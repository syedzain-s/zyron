/**
 * Contract Intelligence — the analysis engine behind the DOC module.
 *
 * Deliberately written as pure functions over plain text: no PDF library, no
 * database, no model call. That means it can be unit tested, it runs in
 * milliseconds, and — most importantly — the risk findings are reproducible
 * and explainable. A reviewer can point at the exact rule that fired.
 *
 * A model is good at summarising a contract. It is not good at being
 * consistent about the same clause twice. Detection stays deterministic;
 * the model layer only ever adds prose on top.
 */

export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface ClauseFinding {
  id: string;
  /** Short label shown in the report header. */
  title: string;
  severity: Severity;
  /** What this actually means for the person signing, in plain language. */
  plain: string;
  /** What to do about it before signing. */
  advice: string;
  /** The sentence from the document that triggered the rule. */
  excerpt: string;
  /** Roughly where in the document it appeared, 0–1. */
  position: number;
}

export interface KeyDate {
  label: string;
  raw: string;
  /** ISO date when we could parse one, otherwise null. */
  iso: string | null;
}

export interface ContractReport {
  title: string;
  wordCount: number;
  readingMinutes: number;
  /** 0–100. Higher means more exposure for the person signing. */
  riskScore: number;
  verdict: string;
  findings: ClauseFinding[];
  keyDates: KeyDate[];
  parties: string[];
  /** Standard protections we looked for and did NOT find. */
  missing: string[];
}

/* ─────────────────────────── Detection rules ─────────────────────────── */

interface Rule {
  id: string;
  title: string;
  severity: Severity;
  /** Every pattern must be found in the same sentence for the rule to fire. */
  patterns: RegExp[];
  /** If any of these also match, the rule is suppressed — it is the safe variant. */
  unless?: RegExp[];
  plain: string;
  advice: string;
  weight: number;
}

const RULES: Rule[] = [
  {
    id: 'auto-renewal',
    title: 'Renews itself automatically',
    severity: 'high',
    patterns: [/\b(automatically renew|auto-renew|shall renew|renews? for (?:a )?(?:successive|additional|further))\b/i],
    plain:
      'This agreement continues on its own unless you cancel in writing before a deadline. Miss the window and you are committed to another full term.',
    advice: 'Put the cancellation deadline in your calendar the day you sign, with a reminder a month early.',
    weight: 22,
  },
  {
    id: 'long-notice',
    title: 'Long notice period to get out',
    severity: 'high',
    patterns: [/\b(?:notice|terminate|termination)\b/i, /\b(?:ninety|90|one hundred and twenty|120|180|six months?)\s*(?:\(\d+\))?\s*(?:days?|months?)?\b/i],
    plain:
      'You have to announce your exit far in advance. Anything beyond 60 days is longer than the usual commercial standard.',
    advice: 'Ask to bring this down to 30 days. It is one of the easiest terms to negotiate.',
    weight: 16,
  },
  {
    id: 'unlimited-liability',
    title: 'Your liability is not capped',
    severity: 'high',
    patterns: [/\b(unlimited liability|without limitation of liability|no cap on liability|liability shall not be limited)\b/i],
    plain:
      'If something goes wrong, what you could owe has no ceiling. Your exposure is not bounded by what you are being paid.',
    advice: 'Push for a cap — commonly the fees paid in the preceding twelve months.',
    weight: 25,
  },
  {
    id: 'broad-indemnity',
    title: 'You indemnify them broadly',
    severity: 'high',
    patterns: [/\bindemnif(?:y|ies|ication)\b/i, /\b(any and all|all claims|whatsoever|arising out of or (?:in any way )?related)\b/i],
    unless: [/\bmutual(?:ly)? indemnif/i],
    plain:
      'You agree to cover their legal costs and losses over a very wide range of situations, including some outside your control.',
    advice: 'Ask for it to be mutual, and narrow it to claims caused by your own breach or negligence.',
    weight: 20,
  },
  {
    id: 'unilateral-amendment',
    title: 'They can change the terms alone',
    severity: 'high',
    patterns: [/\b(?:we|company|provider|licensor)\s+(?:may|reserve[sd]? the right to)\s+(?:modify|amend|change|update)\b/i],
    plain:
      'The other side can rewrite this agreement without asking you. Whatever you agreed today is not what you may be bound by later.',
    advice: 'Require written consent for material changes, or at minimum a right to exit without penalty when terms change.',
    weight: 20,
  },
  {
    id: 'non-compete',
    title: 'Restricts what you can do next',
    severity: 'medium',
    patterns: [/\b(non-?compet\w*|shall not (?:directly or indirectly )?(?:engage|compete)|restraint of trade)\b/i],
    plain:
      'After this ends, there are limits on who you may work with or what you may build. Check the duration and the geography.',
    advice: 'Narrow the scope, the region and the term. Broad non-competes are often unenforceable but still expensive to fight.',
    weight: 14,
  },
  {
    id: 'ip-assignment',
    title: 'IP transfers to them',
    severity: 'medium',
    patterns: [/\b(assigns? all right, title|hereby assigns?|all intellectual property (?:rights )?(?:shall )?(?:vest|belong))\b/i],
    plain:
      'Work produced under this agreement becomes theirs, not yours. Check whether it also sweeps in things you made before or outside it.',
    advice: 'Carve out your pre-existing and background IP explicitly.',
    weight: 12,
  },
  {
    id: 'foreign-jurisdiction',
    title: 'Disputes are heard somewhere else',
    severity: 'medium',
    patterns: [/\b(?:governed by|jurisdiction|venue|courts?) of\b/i, /\b(Delaware|New York|California|England|Singapore|Dubai|DIFC)\b/],
    plain:
      'A dispute would be argued under another place\u2019s law and probably in its courts. That alone can make enforcing your rights impractical.',
    advice: 'Ask for a neutral venue, or accept it knowingly and price the risk in.',
    weight: 10,
  },
  {
    id: 'binding-arbitration',
    title: 'You give up the right to court',
    severity: 'medium',
    patterns: [/\b(binding arbitration|waive(?:s)? (?:any )?right to (?:a )?(?:jury )?trial|class action waiver)\b/i],
    plain:
      'Disagreements go to a private arbitrator rather than a judge, and you may lose the ability to join others in a group claim.',
    advice: 'Check who picks the arbitrator and who pays. Those two details decide whether this is fair.',
    weight: 12,
  },
  {
    id: 'late-payment',
    title: 'Penalties for paying late',
    severity: 'low',
    patterns: [/\b(late (?:payment )?(?:fee|charge|interest)|interest (?:shall|will) accrue|per annum)\b/i],
    plain: 'Interest or a fee applies if you pay after the due date.',
    advice: 'Confirm the rate is on the overdue amount only, and that the clock starts from receipt of a correct invoice.',
    weight: 5,
  },
  {
    id: 'confidentiality',
    title: 'Confidentiality obligations',
    severity: 'info',
    patterns: [/\b(confidential information|non-?disclosure|shall not disclose)\b/i],
    plain: 'Standard. You must keep their information private, usually for a set number of years.',
    advice: 'Check the term is finite and that it excludes anything already public.',
    weight: 2,
  },
];

/** Protections whose absence is itself worth reporting. */
const EXPECTED: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'liability-cap', label: 'A cap on your total liability', pattern: /\b(liability (?:shall|will) (?:not exceed|be limited)|aggregate liability|cap on liability)\b/i },
  { id: 'termination-convenience', label: 'A right to exit without cause', pattern: /\b(terminate .{0,30}for convenience|without cause)\b/i },
  { id: 'force-majeure', label: 'A force majeure clause', pattern: /\bforce majeure\b/i },
  { id: 'data-protection', label: 'Anything about how your data is handled', pattern: /\b(data protection|personal data|GDPR|privacy)\b/i },
];

/* ────────────────────────────── Analysis ────────────────────────────── */

export function analyseContract(text: string, title = 'Untitled document'): ContractReport {
  const clean = normalise(text);
  const sentences = splitSentences(clean);
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  const findings: ClauseFinding[] = [];
  const fired = new Set<string>();

  sentences.forEach((sentence, index) => {
    for (const rule of RULES) {
      if (fired.has(rule.id)) continue;
      if (!rule.patterns.every((p) => p.test(sentence))) continue;
      if (rule.unless?.some((p) => p.test(sentence))) continue;

      fired.add(rule.id);
      findings.push({
        id: rule.id,
        title: rule.title,
        severity: rule.severity,
        plain: rule.plain,
        advice: rule.advice,
        excerpt: excerpt(sentence),
        position: sentences.length > 1 ? index / (sentences.length - 1) : 0,
      });
    }
  });

  const rawScore = findings.reduce((sum, f) => {
    const rule = RULES.find((r) => r.id === f.id);
    return sum + (rule?.weight ?? 0);
  }, 0);
  const riskScore = Math.min(Math.round(rawScore), 100);

  const missing = EXPECTED.filter((e) => !e.pattern.test(clean)).map((e) => e.label);

  return {
    title,
    wordCount,
    readingMinutes: Math.max(1, Math.round(wordCount / 220)),
    riskScore,
    verdict: verdictFor(riskScore, findings),
    findings: findings.sort(bySeverity),
    keyDates: findDates(clean),
    parties: findParties(clean),
    missing,
  };
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
const bySeverity = (a: ClauseFinding, b: ClauseFinding) =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

function verdictFor(score: number, findings: ClauseFinding[]): string {
  const high = findings.filter((f) => f.severity === 'high').length;
  if (score >= 60 || high >= 3) {
    return 'Do not sign this as it stands. Several terms shift meaningful risk onto you at once.';
  }
  if (score >= 30 || high >= 1) {
    return 'Negotiable, but not as written. Fix the high-severity items first.';
  }
  if (findings.length === 0) {
    return 'Nothing flagged. Read it yourself anyway — this checks known patterns, not intent.';
  }
  return 'Broadly standard. Confirm the flagged items match what you were told verbally.';
}

/* ────────────────────────────── Extraction ────────────────────────────── */

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

const DATE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Effective from', pattern: new RegExp(`\\beffective (?:as of |on |from )?(\\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:${MONTHS})[, ]+\\d{4}|(?:${MONTHS}) \\d{1,2},? \\d{4}|\\d{4}-\\d{2}-\\d{2})`, 'i') },
  { label: 'Expires', pattern: new RegExp(`\\b(?:expire[sd]?|until|through)\\s+(?:on\\s+)?(\\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:${MONTHS})[, ]+\\d{4}|(?:${MONTHS}) \\d{1,2},? \\d{4}|\\d{4}-\\d{2}-\\d{2})`, 'i') },
  { label: 'Initial term', pattern: /\b(?:initial term|term)\b[^.;]{0,40}?\b((?:one|two|three|six|twelve|twenty-four|thirty-six|\d+)\s+(?:year|month)s?)/i },
  { label: 'Notice required', pattern: /\b((?:thirty|sixty|ninety|one hundred and twenty|\d+)\s*(?:\(\d+\))?\s*days?)(?:['\u2019]?\s*(?:prior\s+)?(?:written\s+)?notice)/i },
];

function findDates(text: string): KeyDate[] {
  const dates: KeyDate[] = [];
  for (const { label, pattern } of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      dates.push({ label, raw: match[1].trim(), iso: toIso(match[1]) });
    }
  }
  return dates;
}

function toIso(raw: string): string | null {
  const parsed = Date.parse(raw.replace(/(\d+)(st|nd|rd|th)/i, '$1'));
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function findParties(text: string): string[] {
  const found = new Set<string>();
  const pattern = /\b([A-Z][A-Za-z&.\- ]{2,40}?(?:Inc|LLC|Ltd|Limited|GmbH|Corp|Corporation|Pvt|Private Limited|PLC|LLP)\.?)/g;
  for (const match of text.matchAll(pattern)) {
    const name = match[1].trim().replace(/\s+/g, ' ');
    if (name.length > 3) found.add(name);
    if (found.size >= 4) break;
  }
  return Array.from(found);
}

/* ────────────────────────────── Text helpers ────────────────────────────── */

function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    // Rejoin words split across a line break by hyphenation in the PDF.
    .replace(/(\w)-\n(\w)/g, '$1$2')
    // A single newline inside a paragraph is not a sentence break.
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.;:])\s+(?=[A-Z0-9(])|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

function excerpt(sentence: string, limit = 240): string {
  const clean = sentence.replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}\u2026` : clean;
}
