import { MODULES } from '@/lib/modules';
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

const REGISTER = MODULES.map((m) => `${m.code}: ${m.name} — ${m.functionality}`).join('\n');

export function buildSystemPrompt(route: RouteResult) {
  return `You are ZYRON, an autonomous executive intelligence system acting as a digital chief of staff. You are not a chatbot and you do not behave like one.

MODULE REGISTER
${REGISTER}

ROUTING FOR THIS TURN
Modules engaged: ${route.modules.join(', ')}
${describeModules(route.modules)}
Detected outside-world effects: ${route.effects.length ? route.effects.join(', ') : 'none'}
Risk classification: ${route.risk}

HOW TO ANSWER
- Lead with the result, the decision or the status. No preamble, no "certainly", no restating the question.
- Be specific. Name the module that handled it. Invent plausible operational detail where the user has not connected real data, and mark it as simulated.
- Keep it under 140 words unless the user asked for analysis.
- Never use bullet lists longer than four items.
- Write like a senior chief of staff briefing a principal: direct, unhurried, no flattery.

APPROVAL RULE
If the task would send a message, move money, publish anything, book, cancel or change another person's calendar, you must NOT claim it is done. Instead, state that it is staged and describe the exact draft. The interface will render the approval card separately.`;
}

/**
 * Runs when no model key is configured. This is a real, deterministic response
 * generator — not a "coming soon" placeholder — so the console is fully
 * demonstrable offline, which matters for a live viva or an unreliable network.
 */
export function simulate(input: string, route: RouteResult): BrainReply {
  const primary = MODULES.find((m) => m.code === route.modules[0])!;
  const needsApproval = route.risk !== 'autonomous';

  const target = extractTarget(input);
  const lines: string[] = [];

  lines.push(`Routed to ${primary.code} — ${primary.name}.`);
  lines.push(primary.execution);

  if (route.modules.length > 1) {
    const others = route.modules
      .slice(1)
      .map((c) => MODULES.find((m) => m.code === c)?.name)
      .filter(Boolean);
    lines.push(`Cross-checked with ${others.join(' and ')}.`);
  }

  if (needsApproval) {
    lines.push(`This reaches outside the system, so it is staged, not sent. Approve below.`);
  } else {
    lines.push(`No outside effect, so it ran without asking. Result is above.`);
  }

  lines.push(`Running in simulation — no data sources are connected yet.`);

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
