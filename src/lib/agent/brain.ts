import { MODULES } from '@/lib/modules';
import { generateText, ModelError, activeProvider } from '@/lib/agent/providers';
import { findContact, isConnected, recentMail, todaysEvents } from '@/lib/connectors/google';
import { describeModules, extractRecipient, routeIntent, type RouteResult } from './router';
import { clearPending, setPending } from './pending';

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
  /** True when the answer was written against the user's real mail and calendar. */
  grounded?: boolean;
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
export function buildSystemPrompt(route: RouteResult, context?: string | null): string {
  const hasData = Boolean(context);

  // Nothing was routed. Talk, and offer a way in — do not answer as a module
  // that was never chosen.
  if (route.general) {
    return `You are ZYRON, a personal chief of staff for one person.

They have said something conversational — a greeting, a thank you, or a question about what you are.

Open by returning the greeting in one short line. Then reply in two or three short sentences. Warm but not chatty, and never servile. Then offer two or three specific things you could do right now, drawn from this list and phrased as the user would say them:

  "Brief me on today"                    — your calendar and inbox, read and prioritised
  "What's on my calendar this afternoon" — the next few hours
  "Reply to <name> about <thing>"        — a draft you approve before it sends
  "What am I forgetting?"                — commitments you have made and not closed
  Drop a contract into the window        — risk clauses flagged before you sign

Do not produce a briefing. Do not invent meetings or mail. Do not use headings or bullet characters — write the options as short lines. No emoji.

${hasData ? 'Their Google account is connected, so mention that their real calendar and mail are available.' : ''}`;
  }
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
    ? `LIVE DATA FROM THE USER'S OWN ACCOUNT — this is real, use only this.
${context}

Rules for real data: never invent a meeting, a sender or an amount. If something is not in the data above, say it is not there rather than filling the gap. Quote real times and real names.`
    : `NO DATA SOURCES ARE CONNECTED YET.
So: produce a realistic worked example rather than refusing. Invent plausible meetings, senders, amounts and deadlines so the shape of the output is clear.
Then close with exactly this line, on its own, and nothing after it:
Simulated — no data sources connected yet.`
}

${
  route.risk === 'autonomous'
    ? 'Nothing here leaves the system, so report it as done.'
    : 'This would touch the outside world. State that it is staged and say who it is addressed to. Never claim it has been sent, and do not rewrite the draft — the interface renders the approval card, with the exact text that will go out, separately.'
}`;
}

export type Resolved =
  | { kind: 'found'; label: string }
  | { kind: 'ask'; question: string }
  | { kind: 'none' };

/**
 * Turns "send email to israr" into a real address, using mail already
 * exchanged with that person.
 *
 * Three outcomes, and the third matters most: when the name is known but no
 * address can be found, the flow stops and asks. Sending to a guessed address
 * is the one action here that cannot be taken back.
 */
export async function resolveRecipient(message: string): Promise<Resolved> {
  const name = extractRecipient(message);
  if (!name) return { kind: 'none' };

  // An address typed out is already the answer. Asking Google to confirm it
  // would fail for anyone who has not connected an account, over a lookup that
  // was never needed.
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(name)) {
    return { kind: 'found', label: name };
  }

  let connected = false;
  try {
    connected = await isConnected();
  } catch {
    connected = false;
  }

  if (!connected) {
    return {
      kind: 'ask',
      question: `I can draft this for ${name}, but Google is not connected so I cannot look up the address. Connect it, or give me the email and I will stage the draft.`,
    };
  }

  const matches = await findContact(name).catch((error) => {
    console.error('[zyron] contact lookup failed', error);
    return [];
  });

  if (matches.length === 0) {
    return {
      kind: 'ask',
      question: `I have no mail history with ${name}, so I do not have an address. What is ${name}'s email? I will stage the draft as soon as I have it.`,
    };
  }

  const best = matches[0];

  // Several people share a first name often enough that picking silently is a
  // real risk. Two or more strong matches go back to the user.
  const contested = matches.filter((m) => m.seen >= best.seen * 0.6);
  if (contested.length > 1) {
    const options = contested.map((m) => `${m.name || m.email} <${m.email}>`).join(', ');
    return {
      kind: 'ask',
      question: `More than one ${name} in your mail: ${options}. Which one?`,
    };
  }

  return { kind: 'found', label: `${best.name || name} <${best.email}>` };
}

/** Modules whose answer changes if it can see the real inbox and calendar. */
const DATA_HUNGRY = new Set(['BRF', 'DSR', 'CLT', 'PSG', 'CMS', 'VIP', 'DEL']);

/**
 * Pulls the user's own mail and calendar when the routed module would actually
 * use them.
 *
 * Formatted as plain lines rather than JSON: the model reads this, and a wall
 * of braces spends tokens on syntax instead of content. Everything is wrapped
 * so a slow or broken Google connection degrades to the simulated briefing
 * rather than failing the whole turn.
 */
export async function gatherContext(route: RouteResult): Promise<string | null> {
  if (!route.modules.some((code) => DATA_HUNGRY.has(code))) return null;

  try {
    if (!(await isConnected())) return null;
  } catch {
    return null;
  }

  const [events, mail] = await Promise.all([
    todaysEvents().catch((error) => {
      console.error('[zyron] calendar read failed', error);
      return [];
    }),
    recentMail(10).catch((error) => {
      console.error('[zyron] mail read failed', error);
      return [];
    }),
  ]);

  if (events.length === 0 && mail.length === 0) return null;

  const lines: string[] = [];
  const clock = (iso: string) =>
    iso
      ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : '';

  lines.push(`Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`);

  lines.push('', 'CALENDAR TODAY:');
  if (events.length === 0) {
    lines.push('  Nothing scheduled.');
  } else {
    for (const e of events) {
      const when = e.allDay ? 'All day' : `${clock(e.start)}–${clock(e.end)}`;
      const who = e.attendees.length ? ` · with ${e.attendees.slice(0, 4).join(', ')}` : '';
      const where = e.location ? ` · ${e.location}` : '';
      lines.push(`  ${when}  ${e.summary}${who}${where}`);
    }
  }

  lines.push('', 'RECENT MAIL (primary inbox, last 2 days):');
  if (mail.length === 0) {
    lines.push('  Nothing new.');
  } else {
    for (const m of mail) {
      lines.push(`  ${m.unread ? '[unread] ' : ''}${m.from} — ${m.subject}`);
      if (m.snippet) lines.push(`      ${m.snippet}`);
    }
  }

  return lines.join('\n');
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

  // Before anything is staged for approval, work out who it is actually going
  // to. An approval card addressed to "Unspecified recipient" is not something
  // anyone can meaningfully approve.
  if (base.approval && route.effects.some((e) => /message|reply|email|invite/.test(e))) {
    const resolved = await resolveRecipient(message);

    if (resolved.kind === 'ask') {
      // No address, so nothing is staged. Asking is the honest move; guessing
      // an address is the one mistake that cannot be undone after sending.
      //
      // Record what was asked so the reply is understood as an answer rather
      // than routed from scratch as a fresh command.
      await setPending({
        kind: 'recipient',
        subject: extractRecipient(message) ?? '',
        originalMessage: message,
      }).catch(() => undefined);

      return {
        body: resolved.question,
        routedTo: route.modules,
        mode: 'simulation',
      };
    }
    if (resolved.kind === 'found') {
      base.approval.target = resolved.label;
      // The greeting is addressed by name, and the name is only known once the
      // lookup has run — so the draft is rebuilt now rather than at staging.
      base.approval.payload = draftEmail(message, resolved.label);
      await clearPending().catch(() => undefined);
    }
  }


  if (activeProvider() === 'none') return base;

  // A greeting is answered from here, instantly, with no model call.
  //
  // Two reasons. It felt slow — several seconds of spinner to be told hello.
  // And on a free tier every request is a slot, so spending one on "hi" is a
  // slot not available for the briefing that follows it.
  if (route.general) return base;

  const context = await gatherContext(route).catch((error) => {
    console.error('[zyron] context gather failed', error);
    return null;
  });

  try {
    const text = await generateText({
      system: buildSystemPrompt(route, context),
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
      grounded: Boolean(context),
    };
  } catch (error) {
    if (error instanceof ModelError) {
      console.error('[zyron] model refused:', error.userMessage);
      // The user's own message, not a generic one — it usually says what to fix.
      return simulate(message, route, `Fell back to rules: ${error.userMessage}`, base.approval);
    }
    console.error('[zyron] model call failed', error);
    return simulate(
      message,
      route,
      'Fell back to rules — the model did not respond. Check the server log.',
      base.approval,
    );
  }
}

/**
 * The offline writer. Not a placeholder: routing, dispatch and the approval
 * gate are all real here, only the prose is rule-based. It means a live demo
 * survives a dead network, which is not a small thing.
 */
export function simulate(
  input: string,
  route: RouteResult,
  reason?: string,
  /** Reuses an approval whose recipient has already been resolved. */
  staged?: BrainReply['approval'],
): BrainReply {
  // The conversational path has no module, so it needs its own written reply
  // rather than crashing on a module lookup that will not resolve.
  if (route.general || route.modules.length === 0) {
    return {
      body: [
        `${greeting()}. I am here — what do you need?`,
        '',
        'Brief me on today — your calendar and inbox, read and prioritised',
        "What's on my calendar this afternoon — the next few hours",
        'What am I forgetting? — commitments you made and have not closed',
        'Email <name> saying <thing> — a draft you approve before it sends',
        '',
        'Or drop a contract into this window and I will read it before you sign.',
      ].join('\n'),
      routedTo: [],
      mode: 'simulation',
    };
  }

  const primary = MODULES.find((m) => m.code === route.modules[0])!;
  const needsApproval = route.risk !== 'autonomous';
  const target = staged?.target ?? extractTarget(input);

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
      ? `This reaches outside the system, so it is staged, not sent${
          target && target !== UNSPECIFIED ? ` — addressed to ${target}` : ''
        }. Approve below.`
      : 'No outside effect, so it ran without asking.',
  );
  // Say which of the two fallback paths this was. The previous version printed
  // "no model is configured" even when a model was configured and had failed,
  // which sent anyone debugging it to check the wrong thing.
  lines.push(reason ?? 'Simulated — no model is configured.');

  const reply: BrainReply = {
    body: lines.join(' '),
    routedTo: route.modules,
    mode: 'simulation',
  };

  if (needsApproval) {
    reply.approval = staged ?? {
      moduleCode: primary.code,
      moduleName: primary.name,
      action: route.effects[0] ? capitalise(route.effects[0]) : 'Take an external action',
      target,
      payload: draftEmail(input, target),
      risk: route.risk,
    };
  }

  return reply;
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const UNSPECIFIED = 'Unspecified recipient';

function extractTarget(input: string) {
  return extractRecipient(input) ?? UNSPECIFIED;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ─────────────────────── The outgoing draft ─────────────────────── */

/**
 * Builds the message that will actually be sent.
 *
 * This is rule-based on purpose, and it is worth being clear about why. The
 * model writes the console reply; it does not write the payload. So a model
 * outage degrades the prose in the chat window and nothing else — the text
 * that leaves the system is produced by code the reviewer can read, and it is
 * identical whether or not the network was up when it was written.
 *
 * The earlier version pasted the raw command into a fixed scheduling sentence,
 * which is how "I am busy right now" came out as "let me know if the timing
 * does not work and I will move it". It now separates three things: who it is
 * addressed to, what the user actually asked to say, and the wrapper around it.
 */
export function draftEmail(input: string, target: string): string {
  const name = firstName(target);
  const message = messageContent(input);

  const lines = [
    `Subject: ${subjectFor(input, message)}`,
    '',
    name ? `Hi ${name},` : 'Hello,',
    '',
    message,
    '',
    'Best regards,',
  ];

  const signature = process.env.ZYRON_USER_NAME?.trim();
  if (signature) lines.push(signature);

  return lines.join('\n');
}

/** `Hafiz Israr <israr@x.com>` → `Hafiz`. Nothing usable → no greeting name. */
function firstName(target: string): string | null {
  if (!target || target === UNSPECIFIED) return null;

  const label = target.replace(/<[^>]*>/, '').trim();
  const source = label || target.split('@')[0].replace(/[._-]+/g, ' ');
  const first = source.split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, '');

  if (!first || first.length < 2) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Finds the part of the command that is meant to be *in* the message, rather
 * than instructions about it.
 *
 * "email israr and say im busy right now" carries a marker — everything after
 * "say" is the content. Without a marker the whole command would read as the
 * message, which is why the recipient and the verb are stripped instead.
 */
function messageContent(input: string): string {
  const cleaned = input.replace(/\s+/g, ' ').trim();

  // "say", "that", "keh do", "batao ke" — everything after one of these is the
  // message. Roman Urdu puts the marker in a different place to English, so
  // both orders are listed rather than assuming one grammar.
  const marker = cleaned.match(
    /\b(?:and\s+)?(?:saying|say|tell(?:\s+(?:him|her|them))?|that|inform(?:\s+(?:him|her|them))?|(?:karo|kroo|kro|kru|kardo|kar\s*do|bol\s*do|bolo|keh\s*do|kaho|kehna|bata\s*do|batao|bhejo)\s+(?:ke|k|kay)\b|karo|kroo|kro|kru|kardo|bolo|batao|bhejo)\s*[:,]?\s+/i,
  );
  if (marker && marker.index !== undefined) {
    const said = polish(cleaned.slice(marker.index + marker[0].length));
    if (said.replace(/[^\p{L}]/gu, '').length >= 3) return said;
  }

  // "reply to Alex about the invoice" names a topic, not a sentence to send.
  const about = cleaned.match(/\b(?:about|regarding|re:?)\s+(.{2,80})$/i);
  if (about?.[1]) return polish(`Following up regarding ${about[1]}`);

  // No marker at all: drop the verb and the recipient, keep what is left.
  const stripped = cleaned
    .replace(
      /^(?:please\s+)?(?:reply|respond|write|message|msg|text|email|mail|send|dm|ping)\s+(?:an?\s+|the\s+)?(?:email|message|msg|text|note|mail)?\s*(?:(?:to|ko)\s+)?[\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*)?\s*/iu,
      '',
    )
    .replace(/^[\s,.:;-]+/, '');

  const content = polish(stripped);

  // Nothing survived the stripping — the command named a person and no more.
  // A neutral line is better than an empty message or the raw command.
  if (content.replace(/[^\p{L}]/gu, '').length < 3) {
    return 'Following up on this — could you let me know where things stand?';
  }
  return content;
}

/**
 * Light cleanup of typed shorthand. Not a rewrite: the user's words are the
 * user's words, and a message that comes back sounding like someone else is
 * worse than one with a missing apostrophe.
 */
function polish(text: string): string {
  let t = text.trim().replace(/\s+/g, ' ');

  const fixes: Array<[RegExp, string]> = [
    [/\bim\b/gi, "I'm"],
    [/\bive\b/gi, "I've"],
    [/\bid\b/gi, "I'd"],
    [/\bi\b/g, 'I'],
    [/\bdont\b/gi, "don't"],
    [/\bcant\b/gi, "can't"],
    [/\bwont\b/gi, "won't"],
    [/\bisnt\b/gi, "isn't"],
    [/\bthats\b/gi, "that's"],
    [/\bwe're\b/gi, "we're"],
    [/\bbzy\b/gi, 'busy'],
    [/\bpls\b/gi, 'please'],
    [/\bthx\b/gi, 'thanks'],
    [/\bu\b/g, 'you'],
    [/\br\b/g, 'are'],
  ];
  for (const [pattern, replacement] of fixes) t = t.replace(pattern, replacement);

  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t && !/[.!?]$/.test(t)) t += '.';
  return t;
}

/**
 * A subject line. "about X" or "regarding X" in the command is the best signal
 * there is; otherwise the first clause of the message, which is short enough to
 * read in an inbox list and specific enough not to look automated.
 */
function subjectFor(input: string, message: string): string {
  const about = input.match(/\b(?:about|regarding|re:?)\s+(.{3,60}?)(?:[.,;]|$)/i);
  if (about?.[1]) return capitalise(about[1].trim());

  const firstClause = message.split(/[.,;!?]/)[0].trim();
  if (firstClause.length >= 4 && firstClause.length <= 60) return firstClause;

  return 'Quick update';
}

export { routeIntent };
