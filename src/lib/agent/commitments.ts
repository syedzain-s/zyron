export interface ExtractedCommitment {
  text: string;
  owner: string;
  due: string | null;
}

const FIRST_PERSON = /\b(?:i(?:'|’)?ll|i will|i'm going to|i am going to|let me|i can)\s+([^.,;!?]{6,120})/gi;
const DELEGATED = /\b(?:(?:i(?:'|’)?ll )?(?:assign|hand|pass|give)\s+(?:this|it|that)\s+to|ask)\s+([A-Z][a-z]+)\b/g;

/**
 * Written as plain literals rather than built from a joined array: a dynamic
 * RegExp here has to double every backslash, which is exactly the kind of
 * quiet escaping bug that makes a tracker silently drop due dates.
 */
const DUE_PATTERNS: RegExp[] = [
  /\bby (?:next |this )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bby (tomorrow|tonight|today|end of day|eod|end of week|eow|next week|this week|month end)\b/i,
  /\bby (?:the )?(\d{1,2}(?:st|nd|rd|th)?(?: of)? [A-Za-z]+)\b/,
  /\b(?:before|until) ([^.,;!?]{3,30})\b/i,
];

/**
 * Deliberately conservative. A tracker that invents commitments is worse than
 * one that misses a few, because every false positive costs the user a nudge
 * they have to dismiss.
 */
export function extractCommitments(input: string): ExtractedCommitment[] {
  const found: ExtractedCommitment[] = [];
  const seen = new Set<string>();

  const due = findDue(input);

  for (const match of input.matchAll(FIRST_PERSON)) {
    const body = match[1].trim();
    if (body.length < 6) continue;
    const key = body.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ text: capitalise(body), owner: 'You', due });
  }

  for (const match of input.matchAll(DELEGATED)) {
    const person = match[1];
    const key = `delegated:${person.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      text: trimSentence(input),
      owner: person,
      due,
    });
  }

  return found.slice(0, 4);
}

function findDue(input: string): string | null {
  for (const pattern of DUE_PATTERNS) {
    const match = input.match(pattern);
    if (match?.[1]) return capitalise(match[1].trim());
  }
  return null;
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function trimSentence(value: string) {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 110 ? `${clean.slice(0, 107)}…` : clean;
}
