import { NextResponse } from 'next/server';
import { DEFAULT_USER, getStore } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One call that hydrates the whole console on load. */
export async function GET() {
  const store = getStore();
  try {
    const [approvals, commitments, messages, events] = await Promise.all([
      store.listApprovals(DEFAULT_USER),
      store.listCommitments(DEFAULT_USER),
      store.listMessages(DEFAULT_USER),
      store.listEvents(DEFAULT_USER, 20),
    ]);
    return NextResponse.json({ approvals, commitments, messages, events, storage: store.kind });
  } catch (error) {
    console.error('[zyron] hydrate failed', error);
    return NextResponse.json(
      {
        approvals: [],
        commitments: [],
        messages: [],
        events: [],
        storage: store.kind,
        error: 'Storage is unreachable — the console is running without history.',
      },
      { status: 200 },
    );
  }
}

/** Clears this user's data. The standing "delete everything" the PRV module promises. */
export async function DELETE() {
  try {
    const store = getStore();
    await store.reset(DEFAULT_USER);
    return NextResponse.json({ cleared: true });
  } catch (error) {
    console.error('[zyron] reset failed', error);
    return NextResponse.json({ error: 'Could not clear stored data.' }, { status: 503 });
  }
}
