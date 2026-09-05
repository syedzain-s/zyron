import { NextResponse } from 'next/server';
import { DEFAULT_USER, getStore } from '@/lib/db/store';
import type { ApprovalStatus } from '@/types';

export const runtime = 'nodejs';

const ALLOWED: ApprovalStatus[] = ['approved', 'edited', 'cancelled'];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let body: { status?: ApprovalStatus; payload?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  if (!body.status || !ALLOWED.includes(body.status)) {
    return NextResponse.json(
      { error: `Status must be one of: ${ALLOWED.join(', ')}.` },
      { status: 400 },
    );
  }

  try {
    const store = getStore();
    const updated = await store.resolveApproval(
      DEFAULT_USER,
      params.id,
      body.status,
      body.payload,
    );

    if (!updated) {
      return NextResponse.json({ error: 'That approval is no longer in the queue.' }, { status: 404 });
    }

    // The audit trail the sovereignty module promises is written here, not
    // reconstructed later from logs.
    await store.appendEvent({
      userId: DEFAULT_USER,
      kind: `approval.${body.status}`,
      summary: `${updated.moduleCode} — ${updated.action} → ${updated.target}`,
      detail: { approvalId: updated.id, risk: updated.risk },
      at: Date.now(),
    });

    return NextResponse.json({ approval: updated });
  } catch (error) {
    console.error('[zyron] resolving approval failed', error);
    return NextResponse.json({ error: 'The approval could not be saved. Try again.' }, { status: 503 });
  }
}
