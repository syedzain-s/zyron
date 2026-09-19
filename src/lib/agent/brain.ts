import { MODULES } from '@/lib/modules';
import {
  generateText,
  ModelError,
  providerLabel,
  textProvider,
} from '@/lib/agent/providers';
import {
  cleanMailText,
  findContact,
  isConnected,
  readableSender,
  recentMail,
  rememberContact,
  upcomingEvents,
} from '@/lib/connectors/google';
import { describeModules, extractRecipient, routeIntent, type RouteResult } from './router';
import { clearPending, getPending, setPending } from './pending';
import { lookupContact, rememberContact as rememberKnownContact } from './contacts';
import {
  DEFAULT_USER as DOCUMENT_USER,
  getDocumentStore,
  type DocumentSummary,
} from '@/lib/db/documents';

const IMPORTANT_MAIL_WORDS = /urgent|important|action required|deadline|due|invoice|payment|interview|offer|contract|approval|tomorrow|today/i;
const PRINCIPAL_NAME = process.env.ZYRON_USER_NAME?.trim().split(/\s+/)[0] || 'Zaynix';

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
    attachment?: { documentId: string; filename: string; mimeType: string };
  };
  mode: 'model' | 'simulation';
  /** True when the answer was written against the user's real mail and calendar. */
  grounded?: boolean;
}

const REGISTER = MODULES.map((m) => `${m.code} — ${m.name}: ${m.functionality}`).join('\n');

/**
 * What the model knows about the user's data on this turn.
 *
 * Four states, not two. The old boolean ("is there context?") collapsed
 * "Google is connected but the check timed out" into "Google was never
 * connected", and the model was then instructed to invent a briefing — Sarah,
 * Marcus, a $42,500 wire — for a user whose real inbox was one retry away.
 * A confident fiction in place of real data is the worst thing this system
 * can produce, so the distinction is carried explicitly.
 */
export type DataState =
  | { kind: 'grounded'; context: string }
  /** Account linked, but this module reads sources that are not wired yet. */
  | { kind: 'connected-no-source' }
  /** No account has ever been linked. Worked examples are acceptable here. */
  | { kind: 'not-connected' }
  /** An account is linked but could not be reached on this turn. */
  | { kind: 'unreachable' };

/**
 * What the model is told before it answers.
 *
 * The routing decision, the module choice and the risk classification are all
 * made before this prompt is built. The model is not asked to make them and
 * cannot override them — it is given the answer and asked to write it up. That
 * separation is the point: the safety gate holds whether or not the model
 * cooperates on any given turn.
 */
export function buildSystemPrompt(route: RouteResult, data: DataState): string {
  const connected = data.kind !== 'not-connected';

  // Nothing was routed. Talk, and offer a way in — do not answer as a module
  // that was never chosen.
  if (route.general) {
    return `You are ZYRON, a personal chief of staff for one person.

They have said something conversational — a greeting, a thank you, or a question about what you are.

Always answer in English, even when the user speaks Roman Urdu or another language. When it feels natural, address the user as ${PRINCIPAL_NAME}.

Open by returning the greeting in one short line. Then reply in two or three short sentences. Warm but not chatty, and never servile. Then offer two or three specific things you could do right now, drawn from this list and phrased as the user would say them:

  "Brief me on today"                    — your calendar and inbox, read and prioritised
  "What's on my calendar this afternoon" — the next few hours
  "Reply to <name> about <thing>"        — a draft you approve before it sends
  "What am I forgetting?"                — commitments you have made and not closed
  Drop a contract into the window        — risk clauses flagged before you sign

Do not produce a briefing. Do not invent meetings or mail. Do not use headings or bullet characters — write the options as short lines. No emoji.

${connected ? 'Their Google account is connected, so mention that their real calendar and mail are available.' : ''}`;
  }
  const primary = MODULES.find((m) => m.code === route.modules[0]);

  const dataSection = (() => {
    switch (data.kind) {
      case 'grounded':
        return `LIVE DATA FROM THE USER'S OWN ACCOUNT — this is real, use only this.
${data.context}

Rules for real data: never invent a meeting, a sender or an amount. If something is not in the data above, say it is not there rather than filling the gap. Quote real times and real names.`;

      case 'connected-no-source':
        return `THE USER'S GOOGLE ACCOUNT IS CONNECTED, but this module needs a source that is not wired in yet${
          primary ? ` (${primary.inputs.join(', ')})` : ''
        }.
Do not invent meetings, mail, names, amounts or deadlines. Say exactly what source is missing and what the user can connect next.`;

      case 'unreachable':
        return `THE USER'S GOOGLE ACCOUNT IS CONNECTED BUT COULD NOT BE REACHED ON THIS TURN.
Do NOT invent any meetings, mail, names or amounts. Say plainly, in one or two sentences, that the account could not be read just now and that they should try again in a moment or reconnect Google from the console header. Nothing else.`;

      case 'not-connected':
      default:
        return `NO DATA SOURCES ARE CONNECTED YET.
      Do not invent a calendar, inbox, sender, amount or deadline. Tell the user to connect Google from the console header. For text generation, a GEMINI_API_KEY or GROQ_API_KEY can be used, but those keys do not connect Gmail or Calendar.`;
    }
  })();

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
- A briefing reports what exists; it does not plan the day. If the calendar is empty, say "Nothing scheduled" in one line and move on. Never invent time blocks, breaks, lunch, "deep-work" slots or a 9-to-5 timetable.
- For mail, lead with what needs the user's attention (unread, important, anything asking for a reply or a decision), name the sender and subject, and skip newsletters and automated notices unless asked.

${dataSection}

${
  route.risk === 'autonomous'
    ? 'Nothing here leaves the system, so report it as done.'
    : 'This would touch the outside world. State that it is staged and say who it is addressed to. Never claim it has been sent, and do not rewrite the draft — the interface renders the approval card, with the exact text that will go out, separately.'
}`;
}

export type Resolved =
  | { kind: 'found'; label: string }
  | { kind: 'ask'; question: string; options?: string[] }
  | { kind: 'none' };

/**
 * Turns "send email to israr" into a real address, using mail already
 * exchanged with that person.
 *
 * Three outcomes, and the third matters most: when the name is known but no
 * address can be found, the flow stops and asks. Sending to a guessed address
 * is the one action here that cannot be taken back.
 */
const ORDINALS: Record<string, number> = {
  '1st': 1, first: 1, one: 1, pehla: 1, pehli: 1,
  '2nd': 2, second: 2, two: 2, dusra: 2, doosra: 2, dusri: 2,
  '3rd': 3, third: 3, three: 3, teesra: 3, teesri: 3,
  '4th': 4, fourth: 4, '5th': 5, fifth: 5,
};

/** "2", "2nd", "the second one", "israr23" -> one of the offered options, or null. */
function pickOption(answer: string, options: string[]): string | null {
  const a = answer
    .trim()
    .toLowerCase()
    .replace(/^(?:send a message to\s+)?(?:the\s+)?/, '')
    .replace(/\s+(?:one|wala|wali|ko)$/, '')
    .trim();
  const idx = ORDINALS[a] ?? (/^\d{1,2}$/.test(a) ? Number(a) : NaN);
  if (Number.isInteger(idx) && idx >= 1 && idx <= options.length) return options[idx - 1];
  const hits = options.filter((o) => o.toLowerCase().includes(a));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Turns "send email to israr" into a real address.
 *
 * Order matters: a pick from a list ZYRON just offered, then a typed address,
 * then the contact memory (asked once, never again), then the user's own mail
 * history. One match sends; several matches ask, with numbers.
 */
export async function resolveRecipient(message: string): Promise<Resolved> {
  const pending = await getPending().catch(() => null);

  if (pending?.kind === 'recipient' && pending.options?.length) {
    const picked = pickOption(message, pending.options);
    if (picked) {
      if (pending.subject) await rememberKnownContact(pending.subject, picked, picked.replace(/\s*<.*$/, '')).catch(() => undefined);
      return { kind: 'found', label: picked };
    }
  }

  const name = extractRecipient(message);
  if (!name) return { kind: 'none' };

  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(name)) {
    // A typed address answers "what is X's email?" for good.
    if (pending?.kind === 'recipient' && pending.subject) await rememberKnownContact(pending.subject, name).catch(() => undefined);
    return { kind: 'found', label: name };
  }

  const known = await lookupContact(name).catch(() => null);
  if (known) return { kind: 'found', label: `${known.name || name} <${known.email}>` };

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
  const contested = matches.filter((m) => m.seen >= best.seen * 0.6);
  if (contested.length > 1) {
    const options = contested.slice(0, 5).map((m) => `${m.name || name} <${m.email}>`);
    const list = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    return {
      kind: 'ask',
      question: `More than one ${name} in your mail:\n${list}\nWhich one? Say the number, or part of the address.`,
      options,
    };
  }

  const label = `${best.name || name} <${best.email}>`;
  await rememberKnownContact(name, best.email, best.name || name).catch(() => undefined);
  return { kind: 'found', label };
}
/** Modules whose answer changes if it can see the real inbox and calendar. */
const DATA_HUNGRY = new Set(['BRF', 'DSR', 'CLT', 'PSG', 'CMS', 'FIN', 'VIP', 'DEL']);

/**
 * Pulls the user's own mail and calendar when the routed module would actually
 * use them, and says precisely why when it cannot.
 *
 * Formatted as plain lines rather than JSON: the model reads this, and a wall
 * of braces spends tokens on syntax instead of content.
 */
export async function gatherData(route: RouteResult): Promise<DataState> {
  let connected: boolean;
  try {
    connected = await isConnected();
  } catch (error) {
    // The check itself failed — a token refresh, a slow database. That is
    // "unreachable", not "never connected", and the two must not be confused.
    console.error('[zyron] google connection check failed', error);
    return { kind: 'unreachable' };
  }

  if (!connected) return { kind: 'not-connected' };
  if (!route.modules.some((code) => DATA_HUNGRY.has(code))) return { kind: 'connected-no-source' };

  let eventsFailed = false;
  let mailFailed = false;
  const [events, mail] = await Promise.all([
    upcomingEvents(7).catch((error) => {
      console.error('[zyron] calendar read failed', error);
      eventsFailed = true;
      return [];
    }),
    recentMail(20).catch((error) => {
      console.error('[zyron] mail read failed', error);
      mailFailed = true;
      return [];
    }),
  ]);

  // Both reads failing means the account is linked but not reachable right
  // now. One failing is reported inline and the rest is shown.
  if (eventsFailed && mailFailed) return { kind: 'unreachable' };

  const lines: string[] = [];
  const clock = (iso: string) =>
    iso
      ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : '';

  lines.push(`Today is ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`);

  const dayKey = (value: string) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  };
  const today = new Date();
  const todayKey = dayKey(today.toISOString());
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const tomorrowKey = dayKey(tomorrow.toISOString());
  const writeEvents = (title: string, selected: typeof events) => {
    lines.push('', title);
    if (eventsFailed) {
      lines.push('  Calendar could not be read on this turn.');
      return;
    }
    if (selected.length === 0) {
      lines.push('  Nothing scheduled.');
      return;
    }
    for (const e of selected) {
      const when = e.allDay ? 'All day' : `${clock(e.start)}–${clock(e.end)}`;
      const who = e.attendees.length ? ` · with ${e.attendees.slice(0, 4).join(', ')}` : '';
      const where = e.location ? ` · ${e.location}` : '';
      lines.push(`  ${when}  ${e.summary}${who}${where}`);
    }
  };

  writeEvents('CALENDAR TODAY (what is left and what is done):', events.filter((e) => dayKey(e.start) === todayKey));
  writeEvents('CALENDAR TOMORROW (what you need to do):', events.filter((e) => dayKey(e.start) === tomorrowKey));
  writeEvents('CALENDAR OTHER UPCOMING:', events.filter((e) => ![todayKey, tomorrowKey].includes(dayKey(e.start))));

  lines.push('', 'RECENT MAIL (primary inbox, last 20):');
  if (mailFailed) {
    lines.push('  Mail could not be read on this turn.');
  } else if (mail.length === 0) {
    lines.push('  Nothing new.');
  } else {
    const priorityMail = mail.filter(
      (m) => m.important || m.unread || IMPORTANT_MAIL_WORDS.test(`${m.subject} ${m.snippet}`),
    );
    const orderedMail = [...priorityMail, ...mail.filter((m) => !priorityMail.includes(m))];
    for (const m of orderedMail) {
      const flags = [m.important ? 'important' : '', m.unread ? 'unread' : '']
        .filter(Boolean)
        .map((flag) => `[${flag}] `)
        .join('');
      lines.push(`  ${flags}${cleanMailText(m.subject, 100)} — ${readableSender(m.from)}`);
      if (m.snippet) lines.push(`      ${cleanMailText(m.snippet)}`);
    }
  }

  return { kind: 'grounded', context: lines.join('\n') };
}

/** Kept for any caller that only wants the text. */
export async function gatherContext(route: RouteResult): Promise<string | null> {
  const data = await gatherData(route);
  return data.kind === 'grounded' ? data.context : null;
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

  if (route.modules[0] === 'DOC' && /\b(?:list|show|which|what|stored|saved)\b[\s\S]*\b(?:pdf|document|file|contract)s?\b/i.test(message)) {
    return storedDocumentsResponse(route);
  }

  if (base.approval && route.effects.some((effect) => /message|reply|email|text/.test(effect))) {
    const documents = await getDocumentStore()
      .list(DOCUMENT_USER, 30)
      .catch(() => [] as DocumentSummary[]);
    const selected = selectDocument(message, documents);
    if (mentionsDocument(message) && !selected) {
      const titles = documents.slice(0, 6).map((d, i) => `${i + 1}. ${d.title}`).join('\n');
      return {
        body:
          documents.length > 0
            ? `I could not tell which PDF you mean. Stored:\n${titles}\nSay one distinctive word from the title, for example "send the ${firstTitleWord(documents[0].title)} pdf to ${extractRecipient(message) ?? 'them'}".`
            : 'No PDF is stored yet. Drop the file into this window first, then ask me to send it.',
        routedTo: route.modules,
        mode: 'simulation',
        grounded: true,
      };
    }
    if (selected) {
      base.approval.attachment = {
        documentId: selected.id,
        filename: selected.title.endsWith('.pdf') ? selected.title : `${selected.title}.pdf`,
        mimeType: selected.kind === 'pdf' ? 'application/pdf' : 'text/plain',
      };
    }
  }

  if (route.modules[0] === 'BRF' && /\b(show|what did|reply from|response from)\b/i.test(message)) {
    return mailResponse(message, route);
  }

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
        originalMessage: message, options: resolved.options,
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

  // No name in the command at all ("send email"). A draft "to Unspecified
  // recipient" is not something anyone can approve, so nothing is staged.
  if (
    base.approval &&
    base.approval.target === UNSPECIFIED &&
    route.effects.some((e) => /message|reply|email|invite|text/.test(e))
  ) {
    await setPending({ kind: 'recipient', subject: '', originalMessage: message }).catch(() => undefined);
    return {
      body: 'Who should this go to? Give me a name from your mail or an address and I will stage the draft.',
      routedTo: route.modules,
      mode: 'simulation',
    };
  }
  // A greeting is answered from here, instantly, with no model call.
  //
  // Two reasons. It felt slow — several seconds of spinner to be told hello.
  // And on a free tier every request is a slot, so spending one on "hi" is a
  // slot not available for the briefing that follows it.
  if (route.general) return base;

  const data = await gatherData(route).catch((error): DataState => {
    console.error('[zyron] data gather failed', error);
    return { kind: 'unreachable' };
  });

  // Linked but unreachable: say so, from here, without a model call. The model
  // cannot improve on "could not read your account, try again" and might be
  // tempted to decorate it.
  if (data.kind === 'unreachable') {
    return {
      body: 'Your Google account is connected but could not be read just now. Give it a moment and send that again, or reconnect Google from the console header if it keeps happening. Nothing has been invented in the meantime.',
      routedTo: route.modules,
      mode: 'simulation',
      grounded: false,
      approval: base.approval,
    };
  }

  if (data.kind === 'not-connected' && route.modules.some((code) => DATA_HUNGRY.has(code))) {
    return {
      body: 'Google is not connected, so I cannot read your real calendar or inbox yet. Connect Google from the console header and ask again. I will not invent today\'s events or email priorities.',
      routedTo: route.modules,
      mode: 'simulation',
      grounded: false,
      approval: base.approval,
    };
  }

  const provider = textProvider();
  const label = providerLabel(provider);

  // A missing model must not hide connected Google data. The deterministic
  // fallback can still show the live inbox and calendar without prose
  // generation.
  if (route.modules[0] === 'FIN' && data.kind === 'connected-no-source') {
    return {
      body: 'I can check your connected Gmail for invoices, receipts, and recurring-charge notices. Bank and card feeds are not connected yet, so I cannot truthfully confirm duplicate payments. Connect a financial feed or ask me to scan your email for subscription charges.',
      routedTo: route.modules,
      mode: 'simulation',
      grounded: false,
      approval: base.approval,
    };
  }

  if (route.modules[0] === 'FIN' && data.kind === 'grounded') {
    const matches = data.context
      .split('\n')
      .filter((line) => /subscription|invoice|receipt|charge|billing|payment|renewal/i.test(line))
      .slice(0, 8);
    return {
      body: [
        'I checked your connected Gmail for payment-related messages.',
        '',
        ...(matches.length
          ? matches.map((line) => line.replace(/^\s+/, ''))
          : ['No matching subscription or billing email was found.']),
      ].join('\n'),
      routedTo: route.modules,
      mode: 'simulation',
      grounded: true,
      approval: base.approval,
    };
  }

  if (provider === 'none') {
    return data.kind === 'grounded'
      ? groundedFallback(data.context, route, 'Live account data shown; no model provider is configured.', base.approval)
      : base;
  }

  try {
    const text = await generateText({
      system: buildSystemPrompt(route, data),
      messages: [...history.slice(-8), { role: 'user', content: message }],
      maxTokens: 1200,
      temperature: 0.5,
    });

    return {
      body: base.approval
        ? `Draft ready for approval. I found ${base.approval.target} and prepared the message below.`
        : text,
      routedTo: route.modules,
      // The approval card is still built by the router, never by the model.
      approval: base.approval,
      mode: 'model',
      grounded: data.kind === 'grounded',
    };
  } catch (error) {
    if (error instanceof ModelError) {
      console.error(`[zyron] ${label} refused:`, error.userMessage);
      // The user's own message, not a generic one — it usually says what to fix.
      return data.kind === 'grounded'
        ? groundedFallback(data.context, route, `${label} unavailable: ${error.userMessage}`, base.approval)
        : simulate(message, route, `Fell back to rules: ${error.userMessage}`, base.approval);
    }
    console.error(`[zyron] ${label} call failed`, error);
    return data.kind === 'grounded'
      ? groundedFallback(data.context, route, `${label} did not respond; showing the live account data.`, base.approval)
      : simulate(message, route, `Fell back to rules — ${label} did not respond. Check the server log.`, base.approval);
  }
}

async function mailResponse(message: string, route: RouteResult): Promise<BrainReply> {
  const data = await recentMail(50).catch((error) => {
    console.error('[zyron] response lookup failed', error);
    return null;
  });

  if (!data) {
    return {
      body: 'I could not read Gmail right now. Reconnect Google or try again in a moment.',
      routedTo: route.modules,
      mode: 'simulation',
      grounded: false,
    };
  }

  const words = message
    .toLowerCase()
    .replace(/\b(show|the|response|reply|from|of|what|did|he|she|say)\b/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const matches = data.filter((mail) => {
    const haystack = `${mail.from} ${mail.subject} ${mail.snippet}`.toLowerCase();
    return words.length === 0 || words.some((word) => haystack.includes(word));
  }).slice(0, 5);

  if (matches.length === 0) {
    return {
      body: 'I could not find a matching reply in your recent Gmail inbox.',
      routedTo: route.modules,
      mode: 'simulation',
      grounded: true,
    };
  }

  const lines = ['Here is the response I found:', ''];
  for (const [index, mail] of matches.entries()) {
    lines.push(`${index + 1}. ${cleanMailText(mail.subject, 100)}`);
    lines.push(`   From: ${readableSender(mail.from)}`);
    if (mail.receivedAt) lines.push(`   Received: ${new Date(mail.receivedAt).toLocaleString('en-GB')}`);
    if (mail.snippet) lines.push(`   ${cleanMailText(mail.snippet, 500)}`);
    lines.push('');
  }

  return { body: lines.join('\n').trim(), routedTo: route.modules, mode: 'simulation', grounded: true };
}

function groundedFallback(
  context: string,
  route: RouteResult,
  reason: string,
  approval?: BrainReply['approval'],
): BrainReply {
  const source = context.split('\n').filter((line) => !line.startsWith('Today is '));
  const calendar = source.filter((line) => /^(CALENDAR|  (?:All day|\d{2}:\d{2}))/i.test(line));
  const mailStart = source.findIndex((line) => line.startsWith('RECENT MAIL'));
  const mail = mailStart >= 0 ? source.slice(mailStart + 1) : [];
  const mailItems = mail.filter((line) => line.trim() && !line.startsWith('      '));
  const lines = [
    'Here is your live briefing.',
    '',
    'Calendar',
    ...(calendar.length ? calendar.map((line) => line.replace(/^  /, '')) : ['Nothing scheduled.']),
    '',
    'Priority email',
    ...(mailItems.length ? mailItems.map((line) => line.replace(/^  /, '')) : ['No priority email found.']),
  ];

  for (const line of mail) {
    if (line.startsWith('      ') && lines.length < 16) lines.push(`  ${line.trim()}`);
  }

  return {
    body: lines.join('\n'),
    routedTo: route.modules,
    mode: 'simulation',
    grounded: true,
    approval,
  };
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
    const trimmed = input.trim().toLowerCase();
    if (/^(ok|okay|acha|theek|cool|nice|great)$/.test(trimmed)) {
      return {
        body: 'Yes. What would you like me to do now?',
        routedTo: [],
        mode: 'simulation',
      };
    }
    if (/\b(?:kya haal|kaise ho|how are you|how r u)\b/i.test(trimmed)) {
      return {
        body: `I'm good, ${PRINCIPAL_NAME}. What would you like me to handle?`,
        routedTo: [],
        mode: 'simulation',
      };
    }
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

async function storedDocumentsResponse(route: RouteResult): Promise<BrainReply> {
  const documents = await getDocumentStore().list(DOCUMENT_USER, 30).catch((error) => {
    console.error('[zyron] document list failed', error);
    return null;
  });
  if (!documents) {
    return {
      body: 'I could not reach the stored PDF library just now. Try again in a moment.',
      routedTo: route.modules,
      mode: 'simulation',
      grounded: false,
    };
  }
  if (documents.length === 0) {
    return {
      body: 'There are no stored PDFs yet. Upload a contract and I will analyse and keep it in the document library.',
      routedTo: route.modules,
      mode: 'simulation',
      grounded: true,
    };
  }
  const uniqueDocuments = documents.filter((document, index, all) => {
    const key = document.title.toLowerCase().replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
    return all.findIndex((candidate) =>
      candidate.title.toLowerCase().replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim() === key,
    ) === index;
  });
  const lines = [`I found ${uniqueDocuments.length} stored document${uniqueDocuments.length === 1 ? '' : 's'}:`];
  for (const [index, document] of uniqueDocuments.entries()) {
    lines.push(`${index + 1}. ${document.title} · ${document.pages} pages · risk ${document.report.riskScore}/100`);
  }
  lines.push('', 'Use one distinctive word from a title when you want me to attach it to an approved email.');
  return { body: lines.join('\n'), routedTo: route.modules, mode: 'simulation', grounded: true };
}

/** "Assignemnt" is "assignment" with two letters swapped. Close enough to match a title. */
function closeEnough(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2 || a.length < 5) return false;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length] <= 2;
}

function firstTitleWord(title: string): string {
  return title.toLowerCase().match(/[\p{L}\d]{4,}/u)?.[0] ?? title.split(/\s+/)[0];
}

function selectDocument(message: string, documents: DocumentSummary[]) {
  const available = documents.filter((document) => document.kind === 'pdf' && document.bytes > 0);
  const words = new Set(
    message.toLowerCase().match(/[\p{L}\d][\p{L}\d_-]{1,40}/gu) ?? [],
  );
  const ignored = new Set([
    'send', 'email', 'mail', 'message', 'text', 'reply', 'tell', 'inform', 'to', 'ko',
    'bhej', 'bhejo', 'bhejna', 'pdf', 'document', 'file', 'please', 'and',
    'wala', 'wali', 'walay', 'ka', 'ki', 'ke', 'say', 'saying', 'that', 'nd', 'aur', 'attach', 'attached', 'with',
  ]);
  const named = available.find((document) => {
    const titleWords = document.title
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .match(/[\p{L}\d][\p{L}\d_-]{1,40}/gu) ?? [];
    // "datesheet" must find "Date Sheet": compare with spaces removed too, and
    // let a long message word match the start of a title word.
    const joined = titleWords.join('');
    return Array.from(words).some(
      (w) =>
        !ignored.has(w) &&
        w.length >= 4 &&
        (titleWords.includes(w) || joined.includes(w) || titleWords.some((t) => t.length >= 4 && (t.startsWith(w) || w.startsWith(t) || closeEnough(w, t)))),
    );
  });

  if (named) return named;

  // "PDF Israr ko bhejo" identifies the recipient, not the document. If the
  // library has exactly one document, selecting it is deterministic and lets
  // the user use the natural short command. Multiple documents require a
  // title word so we never attach the wrong contract silently.
  const mentionsDocument = /\b(?:pdf|document|file|contract)\b/i.test(message);
  return mentionsDocument && available.length === 1 ? available[0] : undefined;
}

function mentionsDocument(message: string): boolean {
  return /\b(?:pdf|document|file|contract)\b/i.test(message);
}

/**
 * Builds the message that will actually be sent.
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
  const source = (label.includes('@') ? label.split('@')[0] : label || target.split('@')[0])
    .replace(/[._-]+/g, ' ')
    .replace(/\d+$/, '')
    .trim();
  const first = source.split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, '');

  if (!first || first.length < 2) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Did the command say anything to put *in* the message?
 *
 * "send email to israr" names a person and nothing else. Staging a draft that
 * reads "Following up on this" and calling it done is not helpful — the honest
 * move is to ask what to say, and the API route does exactly that when this
 * returns false.
 */
export function hasBody(input: string): boolean {
  if (
    /\b(?:tomorrow|tomorow|kal|next week)\b/i.test(input) &&
    /\b(?:send|email|mail|message|reply|bhej(?:o|na)?|karo|kar dena)\b/i.test(input) &&
    !/\b(?:saying|say|that|keh do|bolo|batao|ke)\b/i.test(input)
  ) {
    return false;
  }
  return messageContent(input) !== PLACEHOLDER_BODY;
}

const PLACEHOLDER_BODY = 'Following up on this — could you let me know where things stand?';

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

  const contactCommand = cleaned.match(
    /^(?:please\s+)?(?:send|email|mail|message|text)\s+(\+?\d[\d\s().-]{6,})\s+([\p{L}][\p{L}.'-]*)\s+(?:to|ko|for)\s+.+$/iu,
  );
  if (contactCommand?.[1] && contactCommand[2]) {
    return formatContactInfoParts(contactCommand[1], contactCommand[2]);
  }

  // Natural commands often put the message before the destination:
  // "send this contact info to Israr". Keep that message intact.
  const destination = extractRecipient(cleaned);
  if (destination) {
    const escaped = destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const beforeDestination = cleaned.match(
      new RegExp(`^(?:please\\s+)?(?:send|email|mail|message|msg|text|tell)\\s+(.+?)\\s+(?:to|ko|for)\\s+${escaped}\\s*$`, 'iu'),
    );
    if (beforeDestination?.[1]) {
      const directBody =
        formatContactInfo(beforeDestination[1]) ??
        formatAddressInfo(beforeDestination[1]) ??
        polish(beforeDestination[1]);
      if (directBody.replace(/[^\p{L}]/gu, '').length >= 3) return directBody;
    }
  }

  // "say", "that", "keh do", "batao ke" — everything after one of these is the
  // message. Roman Urdu puts the marker in a different place to English, so
  // both orders are listed rather than assuming one grammar.
  const marker = cleaned.match(
    /\b(?:(?:and|nd|n|aur|phir|then)\s+)?(?:saying|say|tell(?:\s+(?:him|her|them))?|that|inform(?:\s+(?:him|her|them))?|(?:karo|kroo|kro|kru|kardo|kar\s*do|bol\s*do|bolo|keh\s*do|kaho|kehna|bata\s*do|batao|bhejo)\s+(?:ke|k|kay)\b|karo|kroo|kro|kru|kardo|bolo|batao|bhejo)\s*[:,]?\s+/i,
  );
  if (marker && marker.index !== undefined) {
    // "saying tell zain how are you" — the user restated the instruction
    // inside the body. Drop a leading "tell <name>" so the recipient's own
    // name does not open their message.
    const raw = cleaned
      .slice(marker.index + marker[0].length)
      .replace(/^(?:tell|inform|ask|say to|bolo|batao|kaho)\s+[\p{L}][\p{L}.'-]*\s+(?:that\s+|ke\s+|k\s+)?/iu, '');
    const said = polish(raw);
    if (said.replace(/[^\p{L}]/gu, '').length >= 2) return said;
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
    return PLACEHOLDER_BODY;
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
    [/\buh\b/gi, 'you'],
    [/\bur\b/gi, 'your'],
    [/\br\b/g, 'are'],
    [/\bhw\b/gi, 'how'],
  ];
  for (const [pattern, replacement] of fixes) t = t.replace(pattern, replacement);

  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t && !/[.!?]$/.test(t)) t += '.';
  return t;
}

function formatContactInfo(text: string): string | null {
  const match = text.trim().match(
    /^(?:contact\s+)?(\+?\d[\d\s().-]{6,})(?:\s+(?:name\s+)?([\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*)*))?$/iu,
  );
  if (!match?.[1] || !match[2]) return null;

  return formatContactInfoParts(match[1], match[2]);
}

function formatContactInfoParts(rawPhone: string, rawName: string): string {
  const phone = rawPhone.replace(/[\s().-]+/g, '').trim();
  const name = rawName
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
  return `Contact information:\nName: ${name}\nPhone: ${phone}`;
}

function formatAddressInfo(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!/\b(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|block|sector)\b/i.test(normalized)) {
    return null;
  }
  const address = normalized
    .split(/\s*,\s*/)
    .map((part) =>
      part
        .split(/\s+/)
        .map((word) => {
          if (/^\d+[a-z]$/i.test(word)) return word.slice(0, -1) + word.slice(-1).toUpperCase();
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' '),
    )
    .join(', ');
  return `Address:\n${address}`;
}

/**
 * A subject line. "about X" or "regarding X" in the command is the best signal
 * there is; otherwise the first clause of the message, which is short enough to
 * read in an inbox list and specific enough not to look automated.
 */
function subjectFor(input: string, message: string): string {
  const contact = message.match(/^Contact information:\nName:\s*(.+)$/im);
  if (contact?.[1]) return `Contact information for ${contact[1].trim()}`;
  if (/^Address:/i.test(message)) return 'Address details';

  const about = input.match(/\b(?:about|regarding|re:?)\s+(.{3,60}?)(?:[.,;]|$)/i);
  if (about?.[1]) return capitalise(about[1].trim());

  const firstClause = message.split(/[.,;!?]/)[0].trim();
  if (firstClause.length >= 4 && firstClause.length <= 60) return firstClause;

  return 'Quick update';
}

export { routeIntent };
