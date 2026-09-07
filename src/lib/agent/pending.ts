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
 * Deliberately narrow: one open question at a time, and it expires. A stale
 * pending question is worse than none, because a later unrelated message gets
 * swallowed as an answer to something the user has long moved on from.
 */

export type PendingKind = 'recipient';

export interface Pending {
  userId: string;
  kind: PendingKind;
  /** The name we could not resolve. */
  subject: string;
  /** The command that triggered the question, replayed once answered. */
  originalMessage: string;
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
  // A bare handle or name — "irtizamazhar", "Irtiza Mazhar".
  return trimmed.split(/\s+/).length <= 3 && /^[\p{L}][\p{L}\d.'_-]{1,40}(\s+\S+){0,2}$/u.test(trimmed);
}
