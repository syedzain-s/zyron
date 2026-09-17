import { NextResponse } from 'next/server';
import { GoogleError, recentReplies } from '@/lib/connectors/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const from = new URL(req.url).searchParams.get('from')?.trim().toLowerCase();
  if (!from || !/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(from)) {
    return NextResponse.json({ error: 'A valid sender address is required.' }, { status: 400 });
  }

  try {
    return NextResponse.json({ replies: await recentReplies(from) });
  } catch (error) {
    const message = error instanceof GoogleError ? error.userMessage : 'Replies could not be read right now.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}