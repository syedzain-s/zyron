import { MODULES } from '@/lib/modules';
import type { RiskLevel } from '@/types';

export interface RouteResult {
  modules: string[];
  /** Verbs detected that reach outside the system. */
  effects: string[];
  risk: RiskLevel;
  confidence: number;
}

/**
 * Keyword signatures per module. Deliberately explicit rather than clever: the
 * router has to be inspectable, and a reviewer should be able to read exactly
 * why a command went where it went.
 */
const SIGNATURES: Record<string, string[]> = {
  BRF: ['briefing', 'brief', 'morning', 'today', 'my day', 'agenda', 'schedule overview'],
  DSR: ['prep', 'dossier', 'before the meeting', 'background on', 'who am i meeting'],
  CMS: ['send', 'reply', 'message', 'whatsapp', 'email', 'draft', 'text', 'respond'],
  BIO: ['tired', 'sleep', 'stress', 'burnout', 'energy', 'hrv', 'rest', 'recovery'],
  CLT: ['promise', 'commitment', 'follow up', 'i said i would', 'owe', 'deadline'],
  PSG: ['traffic', 'late', 'delay', 'reschedule', 'move the meeting', 'running behind'],
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

export function routeIntent(input: string): RouteResult {
  const text = input.toLowerCase();

  const scored = Object.entries(SIGNATURES)
    .map(([code, keys]) => {
      const hits = keys.filter((k) => text.includes(k)).length;
      // Longer keyword matches are stronger evidence than single common words.
      const weight = keys.reduce((acc, k) => (text.includes(k) ? acc + k.length : acc), 0);
      return { code, hits, weight };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.weight - a.weight);

  const modules = scored.slice(0, 3).map((s) => s.code);
  if (modules.length === 0) modules.push('BRF');

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

  return { modules, effects, risk, confidence };
}

export function describeModules(codes: string[]) {
  return codes
    .map((code) => MODULES.find((m) => m.code === code))
    .filter(Boolean)
    .map((m) => `${m!.code} — ${m!.name}: ${m!.functionality}`)
    .join('\n');
}
