import { NextResponse } from 'next/server';
import { DEFAULT_USER, getStore } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = getStore();
    const approvals = await store.listApprovals(DEFAULT_USER);
    return NextResponse.json({ approvals, storage: store.kind });
  } catch (error) {
    console.error('[zyron] listing approvals failed', error);
    return NextResponse.json(
      { error: 'Could not read the approval queue. Check MONGODB_URI, then reload.' },
      { status: 503 },
    );
  }
}
