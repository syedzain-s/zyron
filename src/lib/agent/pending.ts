import { DEFAULT_USER } from '@/lib/db/store';
import { getDb, mongoConfigured } from '@/lib/db/mongo';

/**
 * What ZYRON is waiting to hear back.
 *
 * Without this the agent asks "what is Irtiza's email?", the user answers, and
 * the answer is routed from scratch as a brand new command — so it matches
 * nothing and comes back as a greeting. The question was asked and then
 * immediately forgotten, which is the single most irritating thing a system
 * that asks questions can do.
 *
 * Two kinds of question so far:
 *
 *   recipient — "what is X's email?"       the answer is an address or a name
 *   body      — "what should I say to X?"  the answer is the message itself
 *
 * The second exists because the first was not enough: after the address came
 * back the command "send email to israr" still had nothing to say, the model
 * asked, and the user's reply ("tell zain how are you") was routed from
 * scratch and came back as a greeting. Same bug, one step later.
 *
 * Deliberately narrow: one open question at a time, and it expires. A stale
 * pending question is worse than none, because a later unrelated message gets
 * swallowed as an answer to something the user has long moved on from.
 */

export type PendingKind = 'recipient' | 'body';

export interface Pending {
  userId: string;
  kind: PendingKind;
  /** recipient: the name we could not resolve. body: the resolved recipient label. */
  subject: string;
  /** The command that triggered the question, replayed once answered. */
  originalMessage: string;
  /** recipient: the choices offered when several people share the name. */
  options?: string[];
  askedAt: number;
}

const COLLECTION = 'pending_questions';
const TTL_MS = 10 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __zyronPending: Pending | undefined;
}

export async function setPending(pending: Omit<Pending, 'userId' | 'askedAt'>): Promise<void> {
  const record: Pending = { ...pending, userId: DEFAULT_USER, askedAt: Date.now() };

  if (!mongoConfigured) {
    global.__zyronPending = record;
    return;
  }
  try {
    const db = await getDb();
    await db
      .collection(COLLECTION)
      .updateOne({ userId: DEFAULT_USER }, { $set: record }, { upsert: true });
  } catch (error) {
    // Falling back to memory keeps the conversation coherent for this process
    // even when the database is unreachable.
    console.error('[zyron] could not persist pending question', error);
    global.__zyronPending = record;
  }
}

export async function getPending(): Promise<Pending | null> {
  let record: Pending | null = null;

  if (!mongoConfigured) {
    record = global.__zyronPending ?? null;
  } else {
    try {
      const db = await getDb();
      record = (await db
        .collection(COLLECTION)
        .findOne({ userId: DEFAULT_USER }, { projection: { _id: 0 } })) as unknown as Pending | null;
    } catch (error) {
      console.error('[zyron] could not read pending question', error);
      record = global.__zyronPending ?? null;
    }
  }

  if (!record) return null;

  if (Date.now() - record.askedAt > TTL_MS) {
    await clearPending();
    return null;
  }
  return record;
}

export async function clearPending(): Promise<void> {
  global.__zyronPending = undefined;
  if (!mongoConfigured) return;
  try {
    const db = await getDb();
    await db.collection(COLLECTION).deleteMany({ userId: DEFAULT_USER });
  } catch (error) {
    console.error('[zyron] could not clear pending question', error);
  }
}

/**
 * Is this message plausibly an answer to "what is their email?"
 *
 * Kept tight on purpose. A long sentence is a new instruction, not an answer,
 * and treating it as one would hijack the conversation.
 */
export function looksLikeAnswer(message: string): boolean {
  const trimmed = message.trim();
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(trimmed)) return true;
  // A pick from a numbered list: "2", "2nd", "the first one", "dusra".
  if (/^(?:the\s+)?(?:\d{1,2}|1st|2nd|3rd|\dth|first|second|third|fourth|fifth|pehla|pehli|dusra|doosra|dusri|teesra|teesri)(?:\s+(?:one|wala|wali))?$/i.test(trimmed)) return true;
  // A bare handle or name — "irtizamazhar", "Irtiza Mazhar".
  return trimmed.split(/\s+/).length <= 3 && /^[\p{L}][\p{L}\d.'_-]{1,40}(\s+\S+){0,2}$/u.test(trimmed);
}

/**
 * Did the user back out of the question instead of answering it?
 *
 * Checked before anything is treated as a body, because "never mind" typed
 * into a message prompt should cancel the message, not become the message.
 */
export function looksLikeCancel(message: string): boolean {
  const trimmed = message.trim().toLowerCase();
  if (trimmed.split(/\s+/).length > 4) return false;
  return /^(cancel|never\s*mind|nevermind|forget it|stop|drop it|leave it|no|nah|nope|nahi|rehne do|chor do|chhor do|jane do)\b/.test(
    trimmed,
  );
}

/**
 * Is this message plausibly the body of the message ZYRON asked for?
 *
 * Almost anything is, which is the point: when ZYRON has just asked "what
 * should I say?", the next thing typed is the answer unless it is clearly a
 * cancel or clearly a different command (a briefing request, a contract
 * question). Those two exceptions are the only ones — being too clever here
 * is how "tell zain how are you" got treated as a greeting.
 */
export function looksLikeBody(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (looksLikeCancel(trimmed)) return false;
  // An obvious pivot to another module. Messaging verbs are deliberately not
  // listed: "tell him I am late" is a body, not a new command.
  if (/^(brief me|briefing|what'?s on my calendar|what am i forgetting|my day|agenda)\b/i.test(trimmed)) return false;
  return true;
}
