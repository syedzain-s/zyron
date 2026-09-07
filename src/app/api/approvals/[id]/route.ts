import { NextResponse } from 'next/server';
import { DEFAULT_USER, getStore } from '@/lib/db/store';
import { configuredChannel, dispatchApproval } from '@/lib/connectors/dispatch';
import type { ApprovalStatus } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALLOWED: ApprovalStatus[] = ['approved', 'edited', 'cancelled'];

/**
 * The gate itself.
 *
 * This is the only path from a staged action to the outside world, and it only
 * runs after the user has answered the card. Note the order: the decision is
 * recorded first, then dispatch is attempted, then the audit event is written
 * with what actually happened. If dispatch fails, the record still says it was
 * approved and the response says it did not leave — which is the truth, and
 * far more useful than a silent failure.
 */
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

  const store = getStore();

  try {
    const updated = await store.resolveApproval(
      DEFAULT_USER,
      params.id,
      body.status,
      body.payload,
    );

    if (!updated) {
      return NextResponse.json({ error: 'That approval is no longer in the queue.' }, { status: 404 });
    }

    // Cancelled means nothing happens. No dispatch, no ambiguity.
    if (body.status === 'cancelled') {
      await audit(`approval.cancelled`, `${updated.moduleCode} — cancelled: ${updated.action}`);
      return NextResponse.json({
        approval: updated,
        delivered: false,
        channel: 'none',
        detail: 'Cancelled. Nothing was sent.',
      });
    }

    const result = await dispatchApproval({
      approvalId: updated.id,
      moduleCode: updated.moduleCode,
      moduleName: updated.moduleName,
      action: updated.action,
      target: updated.target,
      body: updated.payload,
      risk: updated.risk,
      decidedAt: Date.now(),
    });

    await audit(
      `approval.${body.status}`,
      `${updated.moduleCode} — ${updated.action} → ${updated.target} · ${
        result.delivered ? `delivered via ${result.channel}` : `not delivered (${result.channel})`
      }`,
      { approvalId: updated.id, risk: updated.risk, channel: result.channel, delivered: result.delivered },
    );

    return NextResponse.json({
      approval: updated,
      delivered: result.delivered,
      channel: result.channel,
      detail: result.detail,
    });
  } catch (error) {
    console.error('[zyron] resolving approval failed', error);
    return NextResponse.json({ error: 'The approval could not be saved. Try again.' }, { status: 503 });
  }
}

/** Reports where an approved action would go, for the UI to show up front. */
export async function GET() {
  return NextResponse.json({ channel: configuredChannel() });
}

async function audit(kind: string, summary: string, detail?: Record<string, unknown>) {
  await getStore()
    .appendEvent({ userId: DEFAULT_USER, kind, summary, detail, at: Date.now() })
    .catch((error) => console.error('[zyron] audit write failed', error));
}
