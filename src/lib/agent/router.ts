import { MODULES } from '@/lib/modules';
import type { RiskLevel } from '@/types';

export interface RouteResult {
  modules: string[];
  /** Verbs detected that reach outside the system. */
  effects: string[];
  risk: RiskLevel;
  confidence: number;
  /**
   * True when nothing matched a module — a greeting, a question about ZYRON
   * itself, or ordinary conversation. Previously these fell through to the
   * briefing module, so saying "hi" produced a full morning briefing.
   */
  general: boolean;
}

/**
 * Keyword signatures per module. Deliberately explicit rather than clever: the
 * router has to be inspectable, and a reviewer should be able to read exactly
 * why a command went where it went.
 */
const SIGNATURES: Record<string, string[]> = {
  BRF: ['briefing', 'brief', 'morning', 'today', 'my day', 'agenda', 'schedule overview', 'day summary', 'summary of my day'],
  DSR: ['prep', 'dossier', 'before the meeting', 'background on', 'who am i meeting'],
  CMS: ['send', 'reply', 'message', 'msg', 'whatsapp', 'email', 'mail', 'draft', 'text', 'respond', 'dm', 'write to', 'bhejo', 'bhej', 'bhejna', 'likho'],
  BIO: ['tired', 'sleep', 'stress', 'burnout', 'energy', 'hrv', 'rest', 'recovery'],
  CLT: ['promise', 'commitment', 'follow up', 'i said i would', 'owe', 'deadline', 'forgetting', 'forgot', 'pending', 'outstanding', 'what do i owe'],
  PSG: ['traffic', 'late', 'delay', 'reschedule', 'move the meeting', 'running behind', 'calendar', 'my schedule', 'next meeting', 'free time', 'am i busy', 'meetings'],
  NEG: ['negotiate', 'negotiation', 'salary', 'raise', 'deal', 'counteroffer', 'practice', 'rehearse'],
  FIN: ['subscription', 'invoice', 'receipt', 'charge', 'billing', 'refund', 'spend', 'expense'],
  REP: ['review', 'mention', 'press', 'reputation', 'twitter', 'linkedin', 'sentiment', 'pr'],
  DJB: ['decision', 'decided', 'should i', 'bias', 'outcome', 'looking back'],
  DEL: ['assign', 'delegate', 'team', 'chase', 'nudge', 'handed off'],
  CNT: ['emergency contact', 'if something happens', 'continuity', 'trustee', 'dead man'],
  ROI: ['roi', 'performance report', 'how are you doing', 'saved me', 'impact'],
  TRV: ['flight', 'travel', 'trip', 'hotel', 'airport', 'itinerary', 'visa', 'passport'],
  DOC: ['contract', 'agreement', 'clause', 'terms', 'legal', 'nda', 'sign'],
  HHM: ['bill', 'electricity', 'grocery', 'household', 'home', 'maintenance', 'school'],
  CMP: ['tax', 'filing', 'licence', 'license', 'compliance', 'renewal', 'regulatory'],
  PRP: ['rent', 'tenant', 'property', 'landlord', 'lease'],
  CRS: ['emergency', 'crisis', 'urgent problem', 'panic', 'gone wrong'],
  LGY: ['legacy', 'memory', 'archive', 'remember this', 'for my family'],
  VIP: ['birthday', 'anniversary', 'gift', 'relationship', 'keep in touch'],
  BRD: ['tone', 'brand', 'voice', 'post', 'publish', 'sounds like me'],
  PRV: ['privacy', 'delete my data', 'encryption', 'audit trail', 'who can see'],
};

/** Verbs that mean something happens outside ZYRON. */
const EFFECT_VERBS: Array<{ verb: string; effect: string }> = [
  { verb: 'send', effect: 'send a message' },
  { verb: 'reply', effect: 'send a reply' },
  { verb: 'message', effect: 'send a message' },
  { verb: 'email', effect: 'send an email' },
  { verb: 'mail', effect: 'send an email' },
  { verb: 'msg', effect: 'send a message' },
  { verb: 'dm', effect: 'send a message' },
  { verb: 'bhej', effect: 'send a message' },
  { verb: 'text', effect: 'send a text' },
  { verb: 'pay', effect: 'move money' },
  { verb: 'transfer', effect: 'move money' },
  { verb: 'cancel', effect: 'cancel something' },
  { verb: 'book', effect: 'make a booking' },
  { verb: 'post', effect: 'publish in public' },
  { verb: 'publish', effect: 'publish in public' },
  { verb: 'tweet', effect: 'publish in public' },
  { verb: 'invite', effect: 'send an invite' },
  { verb: 'schedule', effect: 'change a calendar' },
  { verb: 'reschedule', effect: 'change a calendar' },
  { verb: 'delete', effect: 'delete data' },
];

const SEALED_CODES = ['CNT', 'CRS', 'LGY', 'PRV'];

const boundaryCache = new Map<string, RegExp>();

/**
 * Whole-word matching, not substring.
 *
 * `includes` sent "what's on my calendar" to the contract module, because
 * "ca-lenda-r" contains "nda". Three-letter keywords hide inside ordinary
 * words constantly, and the resulting misroute is invisible: the answer is
 * fluent, confident and about the wrong thing.
 */
function matches(text: string, keyword: string): boolean {
  let re = boundaryCache.get(keyword);
  if (!re) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`\\b${escaped}\\b`, 'i');
    boundaryCache.set(keyword, re);
  }
  return re.test(text);
}

/**
 * Short openers and questions about the system itself. Checked before the
 * module signatures: "hello" contains no module keyword, but neither does
 * "what can you do", and both deserve a conversational answer rather than a
 * module being picked at random.
 */
const SMALL_TALK = [
  /^(hi|hey|hello|helo|hii+|yo|salam|salaam|assalam|assalamualaikum|aoa|hola|sup)\b/i,
  /^(good\s+(morning|afternoon|evening|night))\b/i,
  /^(how are (you|u)|kya haal|kaise ho|kesa hai|kia haal)\b/i,
  /^(thanks|thank you|shukriya|ok|okay|cool|nice|great|acha|theek)\b/i,
  /\b(who are you|what are you|what can you do|help me|what do you do)\b/i,
  /\b(how does (this|it) work|explain yourself)\b/i,
];

function isSmallTalk(text: string): boolean {
  const trimmed = text.trim();
  // A message that merely opens with "hi" is still a real request:
  // "hi, can you reply to Alex about the invoice" must reach the messaging
  // module. Genuine small talk is short, so length is the discriminator —
  // and six words is comfortably above "good morning" and below any actual
  // instruction.
  if (trimmed.split(/\s+/).length > 6) return false;
  return SMALL_TALK.some((p) => p.test(trimmed));
}

export function routeIntent(input: string): RouteResult {
  const text = input.toLowerCase();

  if (isSmallTalk(input)) {
    return { modules: [], effects: [], risk: 'autonomous', confidence: 1, general: true };
  }

  const scored = Object.entries(SIGNATURES)
    .map(([code, keys]) => {
      const matched = keys.filter((k) => matches(text, k));
      // Longer keyword matches are stronger evidence than single common words.
      const weight = matched.reduce((acc, k) => acc + k.length, 0);
      return { code, hits: matched.length, weight };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.weight - a.weight);

  const modules = scored.slice(0, 3).map((s) => s.code);

  // Nothing matched. Answering as some module anyway is worse than admitting
  // it and asking — a wrong module produces a confident, irrelevant answer.
  if (modules.length === 0) {
    return { modules: [], effects: [], risk: 'autonomous', confidence: 0, general: true };
  }

  const effects = Array.from(
    new Set(
      EFFECT_VERBS.filter(({ verb }) => new RegExp(`\\b${verb}`, 'i').test(text)).map(
        ({ effect }) => effect,
      ),
    ),
  );

  const risk: RiskLevel = modules.some((c) => SEALED_CODES.includes(c))
    ? 'sealed'
    : effects.length > 0
      ? 'approval'
      : 'autonomous';

  const confidence = Math.min(0.4 + scored.length * 0.18, 0.97);

  return { modules, effects, risk, confidence, general: false };
}

/**
 * Pulls the intended recipient out of a command.
 *
 * Two rewrites so far, both for the same reason: people do not phrase commands
 * the way a grammar expects.
 *
 *   1. The first version required a capitalised name, so "send email to israr"
 *      gave nothing. Nobody capitalises when typing quickly, and in Roman Urdu
 *      almost nobody capitalises at all.
 *
 *   2. The second required the word "to". But "email israr and say I am busy"
 *      is how the command actually gets typed, and it produced "Unspecified
 *      recipient" — which then failed at the dispatcher, correctly but late.
 *      "to" and "ko" are now optional: the name may follow the verb directly.
 *
 * Returns the raw name only. Turning it into an address is the connector's
 * job, because that needs the user's actual mail history.
 */
export function extractRecipient(input: string): string | null {
  const patterns = [
    // An address written out needs no interpretation, so it is tried first.
    /\b([\w.+-]+@[\w-]+\.[\w.]+)\b/,
    // Roman Urdu puts the name first: "israr ko email karo".
    /\b([\p{L}][\p{L}.'-]{1,30}(?:\s+[\p{L}][\p{L}.'-]{1,30})?)\s+ko\s+(?:email|mail|message|msg|text|reply)/iu,
    // "email israr", "send a message to israr", "reply to israr", "msg israr"
    /\b(?:reply|respond|write|message|msg|text|email|mail|send|dm|ping)\s+(?:an?\s+|the\s+)?(?:email|message|msg|text|note|mail|reply)?\s*(?:(?:to|ko)\s+)?([\p{L}][\p{L}.'-]{1,30}(?:\s+[\p{L}][\p{L}.'-]{1,30})?)/iu,
    // Bare "to israr" anywhere, as a last resort.
    /\b(?:to|ko|for)\s+([\p{L}][\p{L}.'-]{1,30}(?:\s+[\p{L}][\p{L}.'-]{1,30})?)/iu,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    const raw = match?.[1]?.trim();
    if (!raw) continue;

    if (raw.includes('@')) return raw.toLowerCase();

    // The two-word capture happily swallows the words on either side of the
    // name: "to israr that I am busy" gave "israr that", and dropping the "to"
    // requirement means "message the team" can now lead with a filler word
    // too. Trim from both ends until only name-shaped words are left.
    const words = raw.split(/\s+/).filter(Boolean);
    while (words.length > 0 && STOP_WORDS.has(words[words.length - 1].toLowerCase())) {
      words.pop();
    }
    while (words.length > 0 && STOP_WORDS.has(words[0].toLowerCase())) {
      words.shift();
    }
    if (words.length === 0) continue;

    const name = words.join(' ');
    if (STOP_WORDS.has(name.toLowerCase())) continue;
    return name;
  }
  return null;
}

/**
 * Words that appear where a name would but are not one. Includes the Roman
 * Urdu connectives, since commands here are routinely mixed-language, and the
 * message-shaped nouns — without those, "send briefing" reads "briefing" as a
 * person and stages mail to nobody.
 */
const STOP_WORDS = new Set([
  'me', 'him', 'her', 'them', 'us', 'it', 'the', 'a', 'an', 'my', 'his', 'your',
  'this', 'that', 'these', 'those', 'all', 'everyone', 'about', 'regarding', 're',
  'and', 'or', 'with', 'from', 'on', 'at', 'in', 'by', 'saying', 'say', 'tell',
  'ke', 'ki', 'ka', 'ko', 'kay', 'keh', 'k', 'jo', 'wo', 'woh', 'ye', 'yeh',
  'confirm', 'confirming', 'let', 'know', 'please', 'asap', 'today', 'tomorrow',
  'aj', 'aaj', 'kal', 'abhi', 'kis', 'kya', 'kab', 'time', 'ana', 'aana', 'hai',
  'sorry', 'thanks', 'shukriya', 'karo', 'kar', 'karna', 'kardo', 'do', 'de',
  'dena', 'bolo', 'batao', 'main', 'mai', 'hun', 'hoon', 'kroo', 'kro', 'kru',
  'bhejo', 'bhej', 'bhejna', 'likho', 'kaho', 'kardo',
  // Nouns that follow a send verb but name a thing, not a person.
  'email', 'mail', 'message', 'msg', 'text', 'note', 'reply', 'draft', 'brief',
  'briefing', 'report', 'summary', 'update', 'invite', 'something', 'anything',
  'everything', 'one', 'quick', 'short',
]);

export function describeModules(codes: string[]) {
  return codes
    .map((code) => MODULES.find((m) => m.code === code))
    .filter(Boolean)
    .map((m) => `${m!.code} — ${m!.name}: ${m!.functionality}`)
    .join('\n');
}
