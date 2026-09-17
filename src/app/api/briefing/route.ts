import { NextResponse } from 'next/server';
import { buildBriefing } from '@/lib/agent/briefing';
import { GoogleError, isConnected } from '@/lib/connectors/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isConnected().catch(() => false))) {
    return NextResponse.json({ connected: false, message: 'Connect Google to receive your calendar and email briefing.' });
  }

  try {
    const briefing = await buildBriefing();
    return NextResponse.json({ connected: true, ...briefing });
  } catch (error) {
    const message = error instanceof GoogleError ? error.userMessage : 'Google briefing could not be read right now.';
    return NextResponse.json({ connected: true, error: message }, { status: 503 });
  }
}