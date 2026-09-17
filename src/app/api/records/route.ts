import { NextResponse } from 'next/server';
import { recentInbox, GoogleError } from '@/lib/connectors/google';
import { DEFAULT_USER, getStore } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = getStore();
    const [approvals, events, inbox] = await Promise.all([
      store.listApprovals(DEFAULT_USER, 100),
      store.listEvents(DEFAULT_USER, 100),
      recentInbox(30).catch((error) => {
        if (error instanceof GoogleError) return [];
        throw error;
      }),
    ]);

    return NextResponse.json({ approvals, events, inbox, storage: store.kind });
  } catch (error) {
    console.error('[zyron] records failed', error);
    return NextResponse.json({ error: 'Records could not be loaded right now.' }, { status: 503 });
  }
}