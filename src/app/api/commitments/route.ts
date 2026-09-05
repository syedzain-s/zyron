import { NextResponse } from 'next/server';
import { DEFAULT_USER, getStore } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = getStore();
    const commitments = await store.listCommitments(DEFAULT_USER);
    return NextResponse.json({ commitments, storage: store.kind });
  } catch (error) {
    console.error('[zyron] listing commitments failed', error);
    return NextResponse.json(
      { error: 'Could not read the commitment tracker.' },
      { status: 503 },
    );
  }
}
