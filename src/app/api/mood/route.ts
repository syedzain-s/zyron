import { NextResponse } from 'next/server';
import {
  MOODS,
  SUPPORT_MESSAGE,
  VISION_SYSTEM,
  needsSupport,
  parseVisionReading,
  suggestFor,
  TECHNIQUES,
  type Mood,
} from '@/lib/agent/mood';
import { ModelError, activeProvider, audioAvailable, readAudio, readImage, stripDataUrl, visionAvailable } from '@/lib/agent/providers';
import {
  DEFAULT_USER,
  buildTrend,
  correlateWithWorkload,
  getMoodStore,
  scoreTechniques,
  unhelpfulFor,
  type CheckInSource,
} from '@/lib/db/mood';
import { getStore } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * BIO module — Mood Check-in.
 *
 * POST  { source: 'camera' | 'voice', media, mimeType }  → read it, suggest
 * POST  { source: 'manual', mood }                       → skip the model
 * POST  { outcome: { checkInId, techniqueId, helped } }  → record what worked
 * GET                                                    → history, trend, stats
 *
 * The photo and the recording exist only inside this function. They are read,
 * turned into one word, and never written anywhere. That is the whole privacy
 * claim, and it is enforced by there being no code that could store them.
 */

const MAX_MEDIA_BYTES = 6 * 1024 * 1024;
const VALID_MOODS = Object.keys(MOODS) as Mood[];

interface MoodRequestBody {
  source?: CheckInSource;
  /** base64, with or without a data-url prefix. */
  media?: string;
  mimeType?: string;
  mood?: Mood;
  note?: string;
  /** Present when the person is reporting whether something helped. */
  outcome?: { checkInId: string; techniqueId: string; helped: boolean };
}

export async function POST(req: Request) {
  let body: MoodRequestBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const store = getMoodStore();

  /* ── Recording an outcome ── */
  if (body.outcome) {
    const { checkInId, techniqueId, helped } = body.outcome;
    const technique = TECHNIQUES.find((t) => t.id === techniqueId);

    if (!checkInId || !technique) {
      return NextResponse.json({ error: 'That technique is not in the catalogue.' }, { status: 400 });
    }

    try {
      await store.addOutcome({
        userId: DEFAULT_USER,
        checkInId,
        techniqueId,
        techniqueTitle: technique.title,
        helped: Boolean(helped),
        createdAt: Date.now(),
      });
    } catch (error) {
      console.error('[zyron] outcome write failed', error);
    }

    // Whether it helped or not, offer the next move rather than a dead end.
    const outcomes = await safe(() => store.outcomes(DEFAULT_USER), []);
    const recent = await safe(() => store.recentCheckIns(DEFAULT_USER, 1), []);
    const mood = recent[0]?.mood ?? 'tense';

    const rejected = helped ? [] : Array.from(new Set([techniqueId, ...unhelpfulFor(outcomes)]));

    return NextResponse.json({
      recorded: true,
      helped: Boolean(helped),
      next: helped ? null : suggestFor(mood, rejected),
      message: helped
        ? 'Logged. That one goes on your list of things that work.'
        : 'Noted — it will not be suggested first again. Here is something different.',
    });
  }

  /* ── A note that signals real distress stops the flow ── */
  if (body.note && needsSupport(body.note)) {
    return NextResponse.json({ support: SUPPORT_MESSAGE }, { status: 200 });
  }

  const source = body.source ?? 'manual';

  /* ── Manual: the person tells us, no model involved ── */
  if (source === 'manual') {
    if (!body.mood || !VALID_MOODS.includes(body.mood)) {
      return NextResponse.json(
        { error: `Pick one of: ${VALID_MOODS.join(', ')}.` },
        { status: 400 },
      );
    }
    return finish(body.mood, 'manual', 1, false, body.note);
  }

  /* ── Camera or voice ── */
  if (!body.media) {
    return NextResponse.json({ error: 'No image or recording was sent.' }, { status: 400 });
  }

  if (source === 'camera' && !visionAvailable()) {
    return NextResponse.json(
      { error: 'No vision model is configured. Add GEMINI_API_KEY, or pick your mood instead.' },
      { status: 503 },
    );
  }
  if (source === 'voice' && !audioAvailable()) {
    return NextResponse.json(
      { error: 'Voice check-in needs GEMINI_API_KEY. Use the camera or pick your mood instead.' },
      { status: 503 },
    );
  }

  const { data, mimeType: embedded } = stripDataUrl(body.media);
  const mimeType = embedded ?? body.mimeType ?? (source === 'camera' ? 'image/jpeg' : 'audio/webm');

  // base64 is roughly 4/3 the size of the bytes it encodes.
  if (data.length * 0.75 > MAX_MEDIA_BYTES) {
    return NextResponse.json(
      { error: 'That capture is too large. Try again — the camera should send a small frame.' },
      { status: 413 },
    );
  }

  try {
    const prompt =
      source === 'camera'
        ? 'Read this photo and reply with the JSON described in your instructions.'
        : 'Listen to this short recording. Judge only tone, pace and energy of the voice — ignore the words if they are unclear. Reply with the JSON described in your instructions.';

    const raw =
      source === 'camera'
        ? await readImage({ base64: data, mimeType, prompt, system: VISION_SYSTEM })
        : await readAudio({ base64: data, mimeType, prompt, system: VISION_SYSTEM });

    const reading = parseVisionReading(raw);

    if (!reading) {
      console.error('[zyron] unparseable mood reading', raw.slice(0, 300));
      return NextResponse.json(
        { error: 'The reading came back garbled. Pick your mood instead and carry on.' },
        { status: 502 },
      );
    }

    // A confident-sounding guess from a dark frame is worse than admitting it.
    if (reading.confidence < 0.25) {
      return NextResponse.json(
        {
          error: 'Too hard to read from that. Try better light, or just tell me how you feel.',
          observation: reading.observation,
        },
        { status: 422 },
      );
    }

    return finish(reading.mood, source, reading.confidence, false, body.note, reading);
  } catch (error) {
    if (error instanceof ModelError) {
      return NextResponse.json({ error: error.userMessage }, { status: 502 });
    }
    console.error('[zyron] mood read failed', error);
    return NextResponse.json(
      { error: 'That check-in could not be read. Pick your mood instead.' },
      { status: 500 },
    );
  }
}

/**
 * Saves the check-in and builds the response. Everything the UI needs for the
 * next screen comes back in one payload — there is no second round trip while
 * somebody is sitting there feeling bad.
 */
async function finish(
  mood: Mood,
  source: CheckInSource,
  confidence: number,
  corrected: boolean,
  note?: string,
  reading?: { observation: string; question: string },
) {
  const store = getMoodStore();

  const outcomes = await safe(() => store.outcomes(DEFAULT_USER), []);
  const rejected = unhelpfulFor(outcomes);
  const suggestion = suggestFor(mood, rejected);

  const checkIn = await safe(
    () =>
      store.addCheckIn({
        userId: DEFAULT_USER,
        mood,
        source,
        confidence,
        corrected,
        note: note?.slice(0, 500),
        createdAt: Date.now(),
      }),
    null,
  );

  return NextResponse.json({
    checkInId: checkIn?.id ?? null,
    mood,
    label: MOODS[mood].label,
    confidence,
    source,
    observation: reading?.observation ?? MOODS[mood].reading,
    question: reading?.question ?? 'Does that sound about right?',
    suggestion,
    worksForYou: scoreTechniques(outcomes).slice(0, 4),
    provider: activeProvider(),
    storage: store.kind,
  });
}

/* ─────────────────────────── History ─────────────────────────── */

export async function GET() {
  const store = getMoodStore();

  try {
    const [checkIns, outcomes] = await Promise.all([
      store.recentCheckIns(DEFAULT_USER, 30),
      store.outcomes(DEFAULT_USER),
    ]);

    // A busy day is measured by what the person actually put through ZYRON,
    // since no calendar is connected yet. Real data, not invented.
    const events = await safe(() => getStore().listEvents(DEFAULT_USER, 400), []);
    const activityByDay: Record<string, number> = {};
    for (const e of events) {
      const day = new Date(e.at).toISOString().slice(0, 10);
      activityByDay[day] = (activityByDay[day] ?? 0) + 1;
    }

    return NextResponse.json({
      checkIns: checkIns.slice(0, 40),
      trend: buildTrend(checkIns, 14),
      worksForYou: scoreTechniques(outcomes),
      workload: correlateWithWorkload(checkIns, activityByDay),
      capabilities: {
        provider: activeProvider(),
        camera: visionAvailable(),
        voice: audioAvailable(),
      },
      storage: store.kind,
    });
  } catch (error) {
    console.error('[zyron] mood history failed', error);
    return NextResponse.json({
      checkIns: [],
      trend: [],
      worksForYou: [],
      workload: { message: null, heavyDayAverage: null, lightDayAverage: null, daysCompared: 0 },
      capabilities: { provider: activeProvider(), camera: visionAvailable(), voice: audioAvailable() },
      storage: store.kind,
    });
  }
}

export async function DELETE() {
  try {
    await getMoodStore().clear(DEFAULT_USER);
    return NextResponse.json({ cleared: true });
  } catch (error) {
    console.error('[zyron] mood clear failed', error);
    return NextResponse.json({ error: 'Could not clear your check-ins.' }, { status: 503 });
  }
}

/** A storage failure should never cost the person their suggestion. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error('[zyron] mood storage skipped', error);
    return fallback;
  }
}
