import { MODULES } from '@/lib/modules';
import { generateText, ModelError, activeProvider } from '@/lib/agent/providers';
import { describeModules, routeIntent, type RouteResult } from './router';

export interface BrainReply {
  body: string;
  routedTo: string[];
  approval?: {
    moduleCode: string;
    moduleName: string;
    action: string;
    target: string;
    payload: string;
    risk: RouteResult['risk'];
  };
  mode: 'model' | 'simulation';
}

const REGISTER = MODULES.map((m) => `${m.code} — ${m.name}: ${m.functionality}`).join('\n');

/**
 * What the model is told before it answers.
 *
 * The routing decision, the module choice and the risk classification are all
 * made before this prompt is built. The model is not asked to make them and
 * cannot override them — it is given the answer and asked to write it up. That
 * separation is the point: the safety gate holds whether or not the model
 * cooperates on any given turn.
 */
export function buildSystemPrompt(route: RouteResult, hasData = false): string {
  const primary = MODULES.find((m) => m.code === route.modules[0]);

  return `You are ZYRON, a personal chief of staff. You are not a chatbot and you must not sound like one.

THE FULL MODULE REGISTER
${REGISTER}

THIS TURN HAS ALREADY BEEN ROUTED — do not re-route it
Handling module: ${primary ? `${primary.code} — ${primary.name}` : route.modules[0]}
${primary ? `What that module does: ${primary.execution}` : ''}
${primary ? `Data it would normally read: ${primary.inputs.join(', ')}` : ''}
Supporting modules: ${route.modules.slice(1).join(', ') || 'none'}
${route.modules.length > 1 ? describeModules(route.modules.slice(1)) : ''}
Outside-world effects detected: ${route.effects.length ? route.effects.join(', ') : 'none'}
Risk: ${route.risk}

HOW TO ANSWER
- Answer as the handling module would. A briefing request gets an actual briefing with times, priorities and conflicts — not a description of what a briefing is.
- Lead with the result. No preamble, no "certainly", no restating the question.
- Be concrete. Real times, real names, real numbers.
- Under 160 words unless genuine analysis was asked for.
- No bullet list longer than five items. No headings for short answers.
- Write like a senior chief of staff briefing a principal: direct, unhurried, no flattery, no emoji.

${
  hasData
    ? 'You have live data sources. Use only what you have been given and never invent a fact.'
    : `NO DATA SOURCES ARE CONNECTED YET.
So: produce a realistic worked example rather than refusing. Invent plausible meetings, senders, amounts and deadlines so the shape of the output is clear.
Then close with exactly this line, on its own, and nothing after it:
Simulated — no data sources connected yet.`
}

${
  route.risk === 'autonomous'
    ? 'Nothing here leaves the system, so report it as done.'
    : 'This would touch the outside world. State that it is staged and quote the exact draft. Never claim it has been sent — the interface renders the approval card separately.'
}`;
}

/**
 * Produces the reply. Falls back to the rule-based writer whenever the model
 * is missing, slow or unhappy, so the console never dies on a bad connection.
 */
export async function think(
  message: string,
  route: RouteResult,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): Promise<BrainReply> {
  const base = simulate(message, route);

  if (activeProvider() === 'none') return base;

  try {
    const text = await generateText({
      system: buildSystemPrompt(route),
      messages: [...history.slice(-8), { role: 'user', content: message }],
      maxTokens: 1200,
      temperature: 0.5,
    });

    return {
      body: text,
      routedTo: route.modules,
      // The approval card is still built by the router, never by the model.
      approval: base.approval,
      mode: 'model',
    };
  } catch (error) {
    if (error instanceof ModelError) {
      console.error('[zyron] model refused:', error.userMessage);
    } else {
      console.error('[zyron] model call failed', error);
    }
    return base;
  }
}

/**
 * The offline writer. Not a placeholder: routing, dispatch and the approval
 * gate are all real here, only the prose is rule-based. It means a live demo
 * survives a dead network, which is not a small thing.
 */
export function simulate(input: string, route: RouteResult): BrainReply {
  const primary = MODULES.find((m) => m.code === route.modules[0])!;
  const needsApproval = route.risk !== 'autonomous';
  const target = extractTarget(input);

  const lines: string[] = [
    `Routed to ${primary.code} — ${primary.name}.`,
    primary.execution,
  ];

  if (route.modules.length > 1) {
    const others = route.modules
      .slice(1)
      .map((c) => MODULES.find((m) => m.code === c)?.name)
      .filter(Boolean);
    lines.push(`Cross-checked with ${others.join(' and ')}.`);
  }

  lines.push(
    needsApproval
      ? 'This reaches outside the system, so it is staged, not sent. Approve below.'
      : 'No outside effect, so it ran without asking.',
  );
  lines.push('Simulated — no model is configured.');

  const reply: BrainReply = {
    body: lines.join(' '),
    routedTo: route.modules,
    mode: 'simulation',
  };

  if (needsApproval) {
    reply.approval = {
      moduleCode: primary.code,
      moduleName: primary.name,
      action: route.effects[0] ? capitalise(route.effects[0]) : 'Take an external action',
      target,
      payload: draftPayload(input, target),
      risk: route.risk,
    };
  }

  return reply;
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractTarget(input: string) {
  const match = input.match(/\b(?:to|for|with)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  return match?.[1] ?? 'Unspecified recipient';
}

function draftPayload(input: string, target: string) {
  const cleaned = input.replace(/\s+/g, ' ').trim();
  const first = target.split(' ')[0];
  return `${first === 'Unspecified' ? 'Hello' : first} — regarding "${cleaned.slice(0, 90)}${
    cleaned.length > 90 ? '…' : ''
  }". Confirming from my side; let me know if the timing does not work and I will move it.`;
}

export { routeIntent };
