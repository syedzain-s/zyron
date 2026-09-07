import { NextResponse } from 'next/server';
import { routeIntent } from '@/lib/agent/router';
import { simulate, think } from '@/lib/agent/brain';
import { extractCommitments } from '@/lib/agent/commitments';
import { DEFAULT_USER, getStore, type ApprovalRecord, type CommitmentRecord } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/**
 * Every outbound call here has a deadline.
 *
 * Without one, an unreachable model endpoint or a database whose IP is not
 * whitelisted leaves the request hanging for minutes while the console shows a
 * spinner. A console that hangs is worse than one that says it failed: the
 * user has no idea whether their command ran.
 */
const MODEL_TIMEOUT_MS = 20_000;
const STORAGE_TIMEOUT_MS = 5_000;

interface AgentRequestBody {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function POST(req: Request) {
  let body: AgentRequestBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: 'Send a command in "message".' }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { error: 'Command is too long — keep it under 4000 characters.' },
      { status: 413 },
    );
  }

  const store = getStore();
  const route = routeIntent(message);

  await safe(() =>
    store.appendMessage({
      userId: DEFAULT_USER,
      speaker: 'user',
      body: message,
      createdAt: Date.now(),
    }),
  );

  // A slow model must not hold the request open indefinitely; think() already
  // degrades to the rule-based writer, so a timeout here is a second net.
  const reply = await withTimeout(
    think(message, route, body.history ?? []),
    MODEL_TIMEOUT_MS + 5_000,
    'think',
  ).catch((error) => {
    console.error('[zyron] think timed out', error);
    return simulate(message, route);
  });

  // Commitments are extracted from what the user said, not from what the model
  // decided to mention — the tracker has to be independent of the prose.
  let commitments: CommitmentRecord[] = [];
  const extracted = extractCommitments(message);
  if (extracted.length > 0) {
    commitments =
      (await safe(() =>
        store.createCommitments(
          extracted.map((c) => ({
            userId: DEFAULT_USER,
            text: c.text,
            owner: c.owner,
            due: c.due,
            source: 'console',
            state: 'open' as const,
            createdAt: Date.now(),
          })),
        ),
      )) ?? [];
  }

  // The approval record is written by the router, never by the model. A gate
  // that depends on the model cooperating is not a gate.
  let approval: ApprovalRecord | null = null;
  if (reply.approval) {
    approval =
      (await safe(() =>
        store.createApproval({
          userId: DEFAULT_USER,
          moduleCode: reply.approval!.moduleCode,
          moduleName: reply.approval!.moduleName,
          action: reply.approval!.action,
          target: reply.approval!.target,
          payload: reply.approval!.payload,
          risk: reply.approval!.risk,
          status: 'pending',
          createdAt: Date.now(),
        }),
      )) ?? null;
  }

  await safe(() =>
    store.appendMessage({
      userId: DEFAULT_USER,
      speaker: 'zyron',
      body: reply.body,
      routedTo: reply.routedTo,
      approvalId: approval?.id,
      createdAt: Date.now(),
    }),
  );

  await safe(() =>
    store.appendEvent({
      userId: DEFAULT_USER,
      kind: 'command.routed',
      summary: `${route.modules.join(', ')} · risk ${route.risk}`,
      detail: { mode: reply.mode, effects: route.effects },
      at: Date.now(),
    }),
  );

  return NextResponse.json({
    body: reply.body,
    routedTo: reply.routedTo,
    mode: reply.mode,
    storage: store.kind,
    approval,
    commitments,
  });
}

/** Storage problems must not take the conversation down, or slow it to a stop. */
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await withTimeout(fn(), STORAGE_TIMEOUT_MS, 'storage');
  } catch (error) {
    console.error('[zyron] storage write skipped', error);
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}
