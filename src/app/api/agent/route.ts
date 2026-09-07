import { NextResponse } from 'next/server';
import { routeIntent } from '@/lib/agent/router';
import { resolveRecipient, simulate, think } from '@/lib/agent/brain';
import { clearPending, getPending, looksLikeAnswer, setPending } from '@/lib/agent/pending';
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
const MODEL_TIMEOUT_MS = 25_000;
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

  /**
   * If ZYRON asked a question last turn, this message is probably the answer.
   *
   * Routing it as a fresh command is what produced the bug where answering
   * "irtizamazhar" came back as a greeting: the word matches no module, so it
   * fell through to small talk while the original request was lost.
   *
   * The original command is replayed with the answer substituted, so the
   * approval card carries the real intent and not just an address.
   */
  const pending = await getPending().catch(() => null);

  let effectiveMessage = message;
  let answeredPending = false;

  if (pending?.kind === 'recipient' && looksLikeAnswer(message)) {
    const answer = message.trim();
    const resolved = await resolveRecipient(
      answer.includes('@') ? answer : `send a message to ${answer}`,
    );

    if (resolved.kind === 'found') {
      // Replay the original instruction, now addressed properly.
      effectiveMessage = pending.originalMessage.replace(
        new RegExp(pending.subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        answer.includes('@') ? answer : answer,
      );
      if (!effectiveMessage.includes(answer)) {
        effectiveMessage = `${pending.originalMessage} (send it to ${answer})`;
      }
      answeredPending = true;
      await clearPending().catch(() => undefined);
    } else if (resolved.kind === 'ask') {
      await setPending({
        kind: 'recipient',
        subject: answer,
        originalMessage: pending.originalMessage,
      }).catch(() => undefined);

      await safe(() =>
        store.appendMessage({
          userId: DEFAULT_USER,
          speaker: 'user',
          body: message,
          createdAt: Date.now(),
        }),
      );

      return NextResponse.json({
        body: resolved.question,
        routedTo: ['CMS'],
        mode: 'simulation',
        grounded: false,
        storage: store.kind,
        approval: null,
        commitments: [],
      });
    }
  } else if (pending && !looksLikeAnswer(message)) {
    // The user moved on. A stale question must not swallow a later message.
    await clearPending().catch(() => undefined);
  }

  const route = routeIntent(effectiveMessage);

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
    think(effectiveMessage, route, body.history ?? []),
    MODEL_TIMEOUT_MS + 5_000,
    'think',
  ).catch((error) => {
    console.error('[zyron] think timed out', error);
    return simulate(effectiveMessage, route);
  });

  // Commitments are extracted from what the user said, not from what the model
  // decided to mention — the tracker has to be independent of the prose.
  let commitments: CommitmentRecord[] = [];
  const extracted = extractCommitments(answeredPending ? effectiveMessage : message);
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
    // Lets the console distinguish "written from your inbox" from "worked
    // example". Without it the two look identical and the user cannot tell.
    grounded: Boolean(reply.grounded),
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
