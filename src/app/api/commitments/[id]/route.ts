import { NextResponse } from 'next/server';
import { DEFAULT_USER, getStore } from '@/lib/db/store';

export const runtime = 'nodejs';

const STATES = ['open', 'nudged', 'closed'] as const;
type State = (typeof STATES)[number];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let body: { state?: State };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  if (!body.state || !STATES.includes(body.state)) {
    return NextResponse.json({ error: `State must be one of: ${STATES.join(', ')}.` }, { status: 400 });
  }

  try {
    const store = getStore();
    const updated = await store.setCommitmentState(DEFAULT_USER, params.id, body.state);
    if (!updated) {
      return NextResponse.json({ error: 'That commitment is no longer tracked.' }, { status: 404 });
    }
    await store.appendEvent({
      userId: DEFAULT_USER,
      kind: `commitment.${body.state}`,
      summary: updated.text,
      at: Date.now(),
    });
    return NextResponse.json({ commitment: updated });
  } catch (error) {
    console.error('[zyron] updating commitment failed', error);
    return NextResponse.json({ error: 'The commitment could not be saved.' }, { status: 503 });
  }
}
