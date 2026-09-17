import { NextResponse } from 'next/server';
import { audioAvailable, readAudio, stripDataUrl } from '@/lib/agent/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request) {
  let body: { media?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Voice note must be JSON.' }, { status: 400 });
  }

  if (!body.media) {
    return NextResponse.json({ error: 'No voice note was sent.' }, { status: 400 });
  }
  if (!audioAvailable()) {
    return NextResponse.json(
      { error: 'Voice notes need GEMINI_API_KEY. Add it to .env.local, then restart the dev server.' },
      { status: 503 },
    );
  }

  const { data, mimeType: embedded } = stripDataUrl(body.media);
  const mimeType = embedded ?? body.mimeType ?? 'audio/wav';
  if (data.length * 0.75 > MAX_BYTES) {
    return NextResponse.json({ error: 'That voice note is too large. Keep it under 6MB.' }, { status: 413 });
  }

  try {
    const transcript = await readAudio({
      base64: data,
      mimeType,
      prompt: 'Transcribe this voice note exactly. Return only the spoken words, with normal punctuation. Do not summarize or add commentary.',
      maxTokens: 1200,
    });
    return NextResponse.json({ transcript: transcript.trim() });
  } catch (error) {
    console.error('[zyron] voice note transcription failed', error);
    return NextResponse.json(
      { error: 'The voice note could not be transcribed. Try again or type the command.' },
      { status: 503 },
    );
  }
}
