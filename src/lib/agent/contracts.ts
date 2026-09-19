/**
 * Document Intelligence — the analysis engine behind the DOC module.
 *
 * Two layers, deliberately separate:
 *
 *   1. Understanding — what kind of document this is, what it says in two
 *      lines, whether it needs a signature, the handful of facts worth
 *      remembering. A model writes this (it is good at summarising) with a
 *      rule-based fallback so an outage never blanks the card.
 *
 *   2. Risk — deterministic clause detection, contracts only. A model is not
 *      consistent about the same clause twice; these rules are, and a reviewer
 *      can point at the exact pattern that fired.
 *
 * A date sheet is not a contract and is not judged like one. It gets layer 1
 * and nothing else.
 */

import { generateText, textProvider } from '@/lib/agent/providers';

export type Severity = 'high' | 'medium' | 'low' | 'info';

export type DocType =
  | 'contract'
  | 'schedule'
  | 'assignment'
  | 'invoice'
  | 'notice'
  | 'letter'
  | 'form'
  | 'other';

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  contract: 'Contract',
  schedule: 'Schedule',
  assignment: 'Assignment',
  invoice: 'Invoice',
  notice: 'Notice',
  letter: 'Letter',
  form: 'Form',
  other: 'Document',
};

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

  // Understanding layer. Optional so reports stored before it existed still render.
  docType?: DocType;
  /** Two sentences, plain language: what this is and what it is for. */
  summary?: string;
  /** Facts worth remembering: dates, amounts, who, where. At most six. */
  keyPoints?: string[];
  needsSignature?: boolean;
  /** Why it does or does not need signing, one line. */
  signatureNote?: string;
  /** 'model' when a model wrote the summary, 'rules' when the fallback did. */
  understoodBy?: 'model' | 'rules';
}

/* ─────────────────────────── Understanding ─────────────────────────── */

const TYPE_SIGNALS: Record<Exclude<DocType, 'other'>, RegExp[]> = {
  contract: [
    /\b(agreement|contract|parties|party of the (?:first|second) part|hereby|whereas|terms and conditions|indemnif\w*|liabilit\w*|governing law|termination|in witness whereof)\b/gi,
  ],
  schedule: [
    /\b(date ?sheet|time ?table|schedule|examination|exam|mid ?term|final ?term|paper|venue|session|slot|semester)\b/gi,
  ],
  assignment: [
    /\b(assignment|homework|submission|submit(?:ted)? by|due date|marks|rubric|question \d|q\.?\s?\d|plagiarism|course code)\b/gi,
  ],
  invoice: [
    /\b(invoice|receipt|amount due|total due|bill to|subtotal|grand total|payment terms|tax invoice|rs\.?\s?\d|pkr)\b/gi,
  ],
  notice: [
    /\b(notice|notification|circular|announcement|hereby informed|all students|all employees|memo(?:randum)?|with immediate effect)\b/gi,
  ],
  letter: [/\b(dear\s+\w+|sincerely|yours faithfully|yours truly|best regards|kind regards|to whom it may concern)\b/gi],
  form: [
    /\b(application form|applicant|date of birth|cnic|father'?s name|fill in|tick|signature of applicant|for office use)\b/gi,
  ],
};

export function classifyDocument(text: string, title: string): DocType {
  const body = text.slice(0, 20_000);
  let best: DocType = 'other';
  let bestScore = 0;
  for (const [type, patterns] of Object.entries(TYPE_SIGNALS) as Array<[Exclude<DocType, 'other'>, RegExp[]]>) {
    let score = 0;
    for (const p of patterns) {
      score += (body.match(p) ?? []).length;
      // The title is the strongest single signal: "Date Sheet" says it all.
      score += (title.match(p) ?? []).length * 4;
    }
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }
  return bestScore >= 2 ? best : 'other';
}

const SIGNATURE_ASK =
  /\b(please sign|sign (?:here|below|and return)|signature[:\s]*_{2,}|signed[:\s]*_{2,}|authori[sz]ed signator\w*|the undersigned|by signing|countersign|_{6,})/i;

function signatureFor(text: string, type: DocType): { needsSignature: boolean; signatureNote: string } {
  if (SIGNATURE_ASK.test(text)) {
    return { needsSignature: true, signatureNote: 'The document has a signature line or asks you to sign and return it.' };
  }
  if (type === 'contract') {
    return { needsSignature: true, signatureNote: 'Contracts take effect when signed. Read the flagged clauses first.' };
  }
  if (type === 'form') {
    return { needsSignature: true, signatureNote: 'Forms usually need the applicant\u2019s signature before submission.' };
  }
  return { needsSignature: false, signatureNote: 'Nothing here asks for your signature. It is for reading, not signing.' };
}

const ANY_DATE =
  /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
const ANY_AMOUNT = /\b(?:Rs\.?|PKR|USD|\$|€|£)\s?[\d,]+(?:\.\d+)?\b/g;

/** No model: the summary is the first two real sentences, key points are the dates and amounts. */
function understandByRules(text: string, title: string, type: DocType) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 260 && /[a-z]/i.test(s));

  const opening = sentences.slice(0, 2).join(' ');
  const summary = opening
    ? `${DOC_TYPE_LABEL[type]}: ${title}. ${opening}`
    : `${DOC_TYPE_LABEL[type]}: ${title}. The text did not have readable sentences to summarise.`;

  const points = new Set<string>();
  for (const m of text.match(ANY_DATE) ?? []) points.add(`Date: ${m}`);
  for (const m of text.match(ANY_AMOUNT) ?? []) points.add(`Amount: ${m}`);
  return {
    summary: summary.slice(0, 400),
    keyPoints: Array.from(points).slice(0, 6),
    ...signatureFor(text, type),
  };
}

/**
 * The full report. Classification and risk are synchronous and deterministic;
 * the summary comes from the text model when one is configured, with the rule
 * fallback if it is slow, down or returns something unparseable.
 */
export async function analyseDocument(text: string, title = 'Untitled document'): Promise<ContractReport> {
  const type = classifyDocument(text, title);
  const base = analyseContract(text, title);
  const rules = understandByRules(text, title, type);

  // Non-contracts should not carry a contract verdict.
  if (type !== 'contract') {
    base.verdict =
      base.findings.length > 0
        ? 'Not a contract, but a few clause-like lines were noticed below.'
        : 'Read-only document. No clauses to check.';
    base.missing = [];
  }

  let understood: Partial<ContractReport> = { ...rules, understoodBy: 'rules' };

  if (textProvider() !== 'none') {
    try {
      const raw = await generateText({
        system: `You read a document and describe it for its owner. Reply with JSON only, no prose, no markdown fences:
{"summary": "two plain sentences: what this document is and what it is for, naming the institution, course, parties or amounts if present",
 "keyPoints": ["up to six short facts worth remembering: dates, deadlines, amounts, venues, names, what is required of the reader"],
 "needsSignature": true or false,
 "signatureNote": "one line on why it does or does not need signing"}
Never invent facts. If something is not in the text, leave it out.`,
        messages: [
          {
            role: 'user',
            content: `Title: ${title}\nDetected type: ${DOC_TYPE_LABEL[type]}\n\n${text.slice(0, 7_000)}`,
          },
        ],
        maxTokens: 500,
        temperature: 0.2,
      });
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1)) as {
        summary?: string;
        keyPoints?: string[];
        needsSignature?: boolean;
        signatureNote?: string;
      };
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
        understood = {
          summary: parsed.summary.trim().slice(0, 500),
          keyPoints: Array.isArray(parsed.keyPoints)
            ? parsed.keyPoints.filter((p) => typeof p === 'string' && p.trim()).slice(0, 6).map((p) => p.trim())
            : rules.keyPoints,
          // The rule detector wins when it saw a signature line; the model may miss underscores.
          needsSignature: rules.needsSignature || Boolean(parsed.needsSignature),
          signatureNote: rules.needsSignature
            ? rules.signatureNote
            : typeof parsed.signatureNote === 'string' && parsed.signatureNote.trim()
              ? parsed.signatureNote.trim()
              : rules.signatureNote,
          understoodBy: 'model',
        };
      }
    } catch (error) {
      console.warn('[zyron] document summary fell back to rules', error instanceof Error ? error.message : error);
    }
  }

  return { ...base, docType: type, ...understood };
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
  { id: 'liability-cap', label: 'A limit on how much you could owe', pattern: /\b(liability (?:shall|will) (?:not exceed|be limited)|aggregate liability|cap on liability)\b/i },
  { id: 'termination-convenience', label: 'A way to end the contract early', pattern: /\b(terminate .{0,30}for convenience|without cause)\b/i },
  { id: 'force-majeure', label: 'Protection when unexpected events happen', pattern: /\bforce majeure\b/i },
  { id: 'data-protection', label: 'Rules for protecting your personal data', pattern: /\b(data protection|personal data|GDPR|privacy)\b/i },
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
