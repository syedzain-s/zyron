/**
 * Mood Check-in — the wellness half of the BIO module.
 *
 * Three things this file is careful about, and a reviewer should know why:
 *
 * 1. It reads a face as a *guess*, never a diagnosis. Facial expression and
 *    felt emotion are not the same thing, so every reading is offered back to
 *    the person for confirmation before anything is suggested.
 *
 * 2. The techniques are drawn from ordinary, well-established self-help
 *    practice — paced breathing, sensory grounding, behavioural activation,
 *    self-compassion. Nothing here uses physical discomfort as a coping
 *    strategy; those reinforce the thing they claim to interrupt.
 *
 * 3. It has a floor. If the signals suggest real distress rather than a rough
 *    afternoon, the flow stops offering activities and offers support instead.
 *    A tool that answers a crisis with a breathing exercise is worse than one
 *    that says nothing.
 */

export type Mood =
  | 'calm'
  | 'tense'
  | 'anxious'
  | 'low'
  | 'flat'
  | 'irritable'
  | 'tired'
  | 'bright';

export type TechniqueKind =
  | 'breathing'
  | 'grounding'
  | 'cognitive'
  | 'behavioural'
  | 'movement'
  | 'connection'
  | 'playful';

export interface Technique {
  id: string;
  title: string;
  /** One line the person reads before deciding. */
  promise: string;
  kind: TechniqueKind;
  /** Rough minutes. Kept small — nobody in distress starts a 20-minute thing. */
  minutes: number;
  steps: string[];
  /** Why this is worth doing, in plain language. No jargon, no citations. */
  why: string;
  moods: Mood[];
  /** Drives the guided pacer in the UI. */
  pacer?: { inhale: number; hold: number; exhale: number; holdOut: number; cycles: number };
}

export interface Soundscape {
  id: string;
  title: string;
  blurb: string;
  /** Generated in the browser with Web Audio — nothing is streamed or licensed. */
  recipe: 'brown-noise' | 'rain' | 'warm-hum' | 'ocean' | 'soft-chimes';
  moods: Mood[];
}

/* ───────────────────────── Mood definitions ───────────────────────── */

export const MOODS: Record<Mood, { label: string; reading: string }> = {
  calm: { label: 'Calm', reading: 'You look settled.' },
  bright: { label: 'Bright', reading: 'You look genuinely up.' },
  tense: { label: 'Tense', reading: 'You look wound tight — jaw, shoulders, brow.' },
  anxious: { label: 'Anxious', reading: 'You look like your mind is running ahead of you.' },
  low: { label: 'Low', reading: 'You look heavy today.' },
  flat: { label: 'Flat', reading: 'You look switched off rather than sad.' },
  irritable: { label: 'Irritable', reading: 'You look like something is grating on you.' },
  tired: { label: 'Tired', reading: 'You look like you are running on empty.' },
};

/* ───────────────────────── The technique catalogue ───────────────────────── */

export const TECHNIQUES: Technique[] = [
  {
    id: 'physiological-sigh',
    title: 'Double breath, long release',
    promise: 'The fastest way down from a spike. Under a minute.',
    kind: 'breathing',
    minutes: 1,
    steps: [
      'Breathe in through your nose until your chest is full.',
      'Without breathing out, take one more short sip of air on top.',
      'Let it all go slowly through your mouth, longer than the way in.',
      'Repeat three times, then breathe normally and notice the difference.',
    ],
    why: 'A long out-breath is the one part of your stress response you can steer directly. Two inhales stacked open the lungs; the slow exhale is what actually brings the dial down.',
    moods: ['tense', 'anxious', 'irritable'],
    pacer: { inhale: 3, hold: 1, exhale: 6, holdOut: 0, cycles: 5 },
  },
  {
    id: 'box-breathing',
    title: 'Four-square breathing',
    promise: 'A steady rhythm to hold on to when your thoughts will not sit still.',
    kind: 'breathing',
    minutes: 3,
    steps: [
      'In through the nose for four.',
      'Hold for four.',
      'Out through the mouth for four.',
      'Hold empty for four. Repeat.',
    ],
    why: 'Counting gives your attention a simple job. The even rhythm stops the shallow, quick breathing that keeps anxiety topped up.',
    moods: ['anxious', 'tense', 'irritable'],
    pacer: { inhale: 4, hold: 4, exhale: 4, holdOut: 4, cycles: 6 },
  },
  {
    id: 'five-senses',
    title: 'Five things you can see',
    promise: 'Pulls you out of your head and back into the room.',
    kind: 'grounding',
    minutes: 3,
    steps: [
      'Name five things you can see. Say them out loud if you can.',
      'Four things you can physically feel — chair, floor, fabric, air.',
      'Three things you can hear.',
      'Two things you can smell.',
      'One thing you can taste.',
    ],
    why: 'Anxiety lives in the future. Your senses only work in the present, so using them deliberately is the shortest route back.',
    moods: ['anxious', 'tense'],
  },
  {
    id: 'name-the-thought',
    title: 'Name the thought',
    promise: 'Puts a little distance between you and the loop.',
    kind: 'cognitive',
    minutes: 4,
    steps: [
      'Write down the sentence going around your head. The exact words.',
      'Now put "I am having the thought that…" in front of it and read it again.',
      'Ask one question: if a friend said this to me, what would I actually say back?',
      'Write that reply down.',
    ],
    why: 'You cannot argue a thought away, but you can stop standing inside it. Naming it turns it from a fact into a sentence you are having.',
    moods: ['anxious', 'low', 'irritable'],
  },
  {
    id: 'worry-window',
    title: 'Postpone the worry',
    promise: 'For the thing you cannot stop chewing on.',
    kind: 'cognitive',
    minutes: 2,
    steps: [
      'Write the worry down in one line.',
      'Pick a time later today — fifteen minutes, a specific slot.',
      'Tell yourself: not now, then. Put the note away.',
      'When the thought comes back, remind it that it has an appointment.',
    ],
    why: 'Trying not to think about something makes it louder. Giving it a scheduled slot is a deal your mind will usually accept.',
    moods: ['anxious', 'tense'],
  },
  {
    id: 'smallest-step',
    title: 'The two-minute version',
    promise: 'For when everything feels too heavy to start.',
    kind: 'behavioural',
    minutes: 2,
    steps: [
      'Pick the thing you have been avoiding.',
      'Shrink it until it takes two minutes. Not the essay — one paragraph. Not the room — one surface.',
      'Do only that. Stop when the two minutes are up, even if you want to keep going.',
    ],
    why: 'When mood is low, motivation arrives after action, not before it. Waiting to feel like it is waiting for the wrong thing.',
    moods: ['low', 'flat', 'tired'],
  },
  {
    id: 'three-good-things',
    title: 'Three specific things',
    promise: 'Not forced positivity. Specific, small, true.',
    kind: 'cognitive',
    minutes: 4,
    steps: [
      'Write three things from today that were fine or better. Small counts.',
      'For each one, write one line on what you did that helped it happen.',
      'That second line is the point — read it back.',
    ],
    why: 'Low mood filters out the ordinary good. Writing specifics rather than "be grateful" makes it harder for the filter to work.',
    moods: ['low', 'flat'],
  },
  {
    id: 'self-compassion',
    title: 'What you would tell a friend',
    promise: 'For when the voice in your head has turned on you.',
    kind: 'cognitive',
    minutes: 4,
    steps: [
      'Say what you are being hard on yourself about, in one sentence.',
      'Add: "this is difficult, and difficulty is not a personal failing."',
      'Write what you would say to a friend in the same position, word for word.',
      'Read it back as if it were addressed to you. Because it is.',
    ],
    why: 'People are reliably kinder and more accurate about others than about themselves. Borrowing that voice gets you a fairer reading.',
    moods: ['low', 'flat', 'tired'],
  },
  {
    id: 'movement-snack',
    title: 'Six minutes outside',
    promise: 'The cheapest reset there is.',
    kind: 'movement',
    minutes: 6,
    steps: [
      'Stand up. Put your phone down or leave it face down.',
      'Go outside, or to a window with daylight.',
      'Walk at a comfortable pace for six minutes. No podcast, no scrolling.',
      'Come back and notice whether anything shifted.',
    ],
    why: 'Light movement and daylight both nudge mood, and neither asks anything of you. It is the lowest-effort thing on this list that reliably does something.',
    moods: ['low', 'flat', 'tired', 'irritable', 'tense'],
  },
  {
    id: 'unclench',
    title: 'Release from the top down',
    promise: 'You are probably holding your jaw right now.',
    kind: 'grounding',
    minutes: 5,
    steps: [
      'Start at your forehead. Tense it for five seconds, then let go completely.',
      'Jaw next. Then shoulders, then hands, then stomach, then legs.',
      'Each one: squeeze, hold, release, and notice the difference.',
    ],
    why: 'Stress parks itself in muscle before you notice it in your head. Tensing first makes the release obvious enough to actually feel.',
    moods: ['tense', 'irritable', 'anxious', 'tired'],
  },
  {
    id: 'one-message',
    title: 'Message one person',
    promise: 'Not a conversation. One message.',
    kind: 'connection',
    minutes: 3,
    steps: [
      'Pick someone you have not spoken to in a while.',
      'Send one honest line. Not "how are you" — something real and small.',
      'Put the phone down. A reply is a bonus, not the point.',
    ],
    why: 'Low mood pulls you inward and then tells you that reaching out is a burden. It is usually wrong, and one line is a small enough test to run.',
    moods: ['low', 'flat'],
  },
  {
    id: 'shake-it-off',
    title: 'Ninety seconds of nonsense',
    promise: 'Undignified, and it works.',
    kind: 'playful',
    minutes: 2,
    steps: [
      'Stand up where nobody can see you.',
      'Shake out your hands, then arms, then shoulders, then legs. Properly.',
      'Add the silliest song you know, out loud, for one chorus.',
      'Sit back down.',
    ],
    why: 'Animals literally shake off stress and then carry on. It interrupts the loop, and the mild embarrassment is part of what breaks the spell.',
    moods: ['flat', 'low', 'irritable', 'tense'],
  },
  {
    id: 'ten-minute-tidy',
    title: 'Clear one surface',
    promise: 'One surface. Not the room.',
    kind: 'behavioural',
    minutes: 8,
    steps: [
      'Pick the smallest cluttered surface in sight — a desk corner, one shelf.',
      'Set a timer for eight minutes.',
      'Clear only that. Stop when the timer goes.',
    ],
    why: 'A finished small thing is proof that effort still produces results, which is exactly the belief low mood takes away first.',
    moods: ['flat', 'low', 'tired'],
  },
  {
    id: 'keep-the-good',
    title: 'Bank this one',
    promise: 'For when you already feel good.',
    kind: 'cognitive',
    minutes: 3,
    steps: [
      'Write down what today felt like, in a few honest lines.',
      'Note what led up to it — sleep, people, work, weather.',
      'Save it. On a flat day, that note is data, not sentiment.',
    ],
    why: 'Good days pass unexamined. Recording what preceded them is how you find out what actually works for you rather than what is supposed to.',
    moods: ['bright', 'calm'],
  },
];

/* ───────────────────────── Soundscapes ───────────────────────── */

/**
 * Generated in the browser with Web Audio rather than streamed. No licensing,
 * no network, no buffering — and it keeps working on a bad connection during
 * a demo.
 */
export const SOUNDSCAPES: Soundscape[] = [
  {
    id: 'brown-noise',
    title: 'Brown noise',
    blurb: 'A deep, even wash. Good for a mind that will not settle.',
    recipe: 'brown-noise',
    moods: ['anxious', 'tense', 'irritable'],
  },
  {
    id: 'rain',
    title: 'Steady rain',
    blurb: 'Soft and irregular, the way real rain is.',
    recipe: 'rain',
    moods: ['low', 'flat', 'tired', 'anxious'],
  },
  {
    id: 'warm-hum',
    title: 'Warm hum',
    blurb: 'A low drone under everything. Almost not there.',
    recipe: 'warm-hum',
    moods: ['tense', 'tired', 'flat'],
  },
  {
    id: 'ocean',
    title: 'Slow surf',
    blurb: 'Long swells, roughly the pace of calm breathing.',
    recipe: 'ocean',
    moods: ['anxious', 'tense', 'calm'],
  },
  {
    id: 'soft-chimes',
    title: 'Distant chimes',
    blurb: 'Occasional, unpredictable, quiet.',
    recipe: 'soft-chimes',
    moods: ['low', 'bright', 'calm'],
  },
];

/* ───────────────────────── Selection ───────────────────────── */

export interface Suggestion {
  mood: Mood;
  reading: string;
  techniques: Technique[];
  soundscapes: Soundscape[];
}

/**
 * Picks what to offer. `rejected` holds technique ids the person has already
 * said did not help — this session or in their history — so the second round
 * is never the first round again.
 */
export function suggestFor(mood: Mood, rejected: string[] = []): Suggestion {
  const skip = new Set(rejected);

  const matching = TECHNIQUES.filter((t) => t.moods.includes(mood) && !skip.has(t.id));

  // Lead with something that takes under two minutes. Anything longer is a
  // negotiation when someone already feels bad.
  const quick = matching.filter((t) => t.minutes <= 3);
  const rest = matching.filter((t) => t.minutes > 3);

  const ordered = [...quick, ...rest];

  // If everything has been tried and rejected, widen rather than return empty.
  const techniques =
    ordered.length > 0
      ? ordered.slice(0, 3)
      : TECHNIQUES.filter((t) => !skip.has(t.id)).slice(0, 3);

  const sounds = SOUNDSCAPES.filter((s) => s.moods.includes(mood));

  return {
    mood,
    reading: MOODS[mood].reading,
    techniques,
    soundscapes: sounds.length > 0 ? sounds : SOUNDSCAPES.slice(0, 2),
  };
}

/* ───────────────────────── Safety floor ───────────────────────── */

/**
 * Words that mean this is not a rough afternoon. Deliberately broad: a false
 * positive costs one extra screen, a false negative costs far more.
 */
const DISTRESS = [
  'kill myself', 'end my life', 'suicide', 'suicidal', 'want to die', 'better off dead',
  'self harm', 'self-harm', 'hurt myself', 'cutting myself', 'no reason to live',
  'cannot go on', "can't go on", 'give up on life', 'end it all',
];

export function needsSupport(text: string): boolean {
  const lower = text.toLowerCase();
  return DISTRESS.some((phrase) => lower.includes(phrase));
}

export const SUPPORT_MESSAGE = {
  title: 'This is bigger than an activity',
  body: 'What you have described sounds like more than a difficult day, and a breathing exercise is not the right answer to it. Please talk to someone — a doctor, a counsellor, or somebody you trust. If you are in immediate danger, contact your local emergency number.',
  note: 'ZYRON is a wellness tool. It is not a therapist and it is not a crisis service.',
};

/* ───────────────────────── Model prompt ───────────────────────── */

export const VISION_SYSTEM = `You help with a wellness check-in. You are shown one photo of a person who has chosen to share it.

Give a cautious, non-clinical read of how they *appear*. You are guessing from a single frame — a face is not a feeling, and you say so.

Never diagnose. Never mention medical or psychiatric terms. Never comment on appearance, attractiveness, weight, age, race or gender. Never identify the person.

Reply with JSON only, no markdown fence, no commentary:

{
  "mood": one of "calm" | "bright" | "tense" | "anxious" | "low" | "flat" | "irritable" | "tired",
  "confidence": 0.0 to 1.0,
  "observation": "one short sentence about what you noticed — posture, expression, eyes. Neutral and kind.",
  "question": "one short question inviting them to correct you"
}

If the photo has no clear face, or is too dark, set mood to "calm", confidence to 0, and say so in observation.`;

export interface VisionReading {
  mood: Mood;
  confidence: number;
  observation: string;
  question: string;
}

const VALID_MOODS = Object.keys(MOODS) as Mood[];

/** Models add fences and prose no matter what the prompt says. Survive it. */
export function parseVisionReading(raw: string): VisionReading | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<VisionReading>;
    if (!parsed.mood || !VALID_MOODS.includes(parsed.mood)) return null;

    return {
      mood: parsed.mood,
      confidence: clamp01(Number(parsed.confidence ?? 0.5)),
      observation: String(parsed.observation ?? '').slice(0, 240) || 'Hard to read from this photo.',
      question: String(parsed.question ?? '').slice(0, 160) || 'Does that sound about right?',
    };
  } catch {
    return null;
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0.5);
