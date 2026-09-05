import { NextResponse } from 'next/server';
import { routeIntent } from '@/lib/agent/router';
import { buildSystemPrompt, simulate, type BrainReply } from '@/lib/agent/brain';
import { extractCommitments } from '@/lib/agent/commitments';
import { DEFAULT_USER, getStore, type ApprovalRecord, type CommitmentRecord } from '@/lib/db/store';
import { MODULES } from '@/lib/modules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const reply = await think(message, route, body.history ?? []);

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

async function think(
  message: string,
  route: ReturnType<typeof routeIntent>,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<BrainReply> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return simulate(message, route);

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });

    const completion = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: buildSystemPrompt(route),
      messages: [...history.slice(-8), { role: 'user' as const, content: message }],
    });

    const text = completion.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();

    const primary = MODULES.find((m) => m.code === route.modules[0])!;
    const reply: BrainReply = {
      body: text || 'No output produced.',
      routedTo: route.modules,
      mode: 'model',
    };

    if (route.risk !== 'autonomous') {
      const staged = simulate(message, route).approval;
      if (staged) reply.approval = { ...staged, moduleName: primary.name };
    }

    return reply;
  } catch (error) {
    console.error('[zyron] model call failed', error);
    // Degrade to simulation rather than showing the user a dead console.
    return simulate(message, route);
  }
}

/** Storage problems must not take the conversation down. */
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error('[zyron] storage write failed', error);
    return null;
  }
}
