import { DEFAULT_USER } from '@/lib/db/store';
import { getDb, mongoConfigured } from '@/lib/db/mongo';

/**
 * Who "zain" is. Every answer to "what is X's email?" and every pick from
 * "which X?" is written down here and checked before the mailbox is searched
 * again. Ask once, then just send.
 */
export interface Contact {
  userId: string;
  key: string;
  name: string;
  email: string;
  uses: number;
  updatedAt: number;
}

const COLLECTION = 'contacts';

declare global {
  // eslint-disable-next-line no-var
  var __zyronContacts: Map<string, Contact> | undefined;
}

const memory = () => (global.__zyronContacts ??= new Map<string, Contact>());

const normalise = (name: string) =>
  name.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export async function rememberContact(rawName: string, rawEmail: string, displayName?: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase().replace(/^.*</, '').replace(/>.*$/, '');
  if (!/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(email)) return;
  const full = normalise(rawName);
  if (!full) return;

  const keys = new Set<string>([full, ...full.split(' ').filter((w) => w.length >= 2)]);
  const now = Date.now();
  for (const key of keys) {
    const record: Contact = { userId: DEFAULT_USER, key, name: displayName?.trim() || rawName.trim(), email, uses: 1, updatedAt: now };
    memory().set(key, { ...record, uses: (memory().get(key)?.uses ?? 0) + 1 });
    if (!mongoConfigured) continue;
    try {
      const db = await getDb();
      await db.collection(COLLECTION).updateOne(
        { userId: DEFAULT_USER, key },
        { $set: { name: record.name, email, updatedAt: now }, $inc: { uses: 1 } },
        { upsert: true },
      );
    } catch (error) {
      console.error('[zyron] could not persist contact', error);
    }
  }
}

export async function lookupContact(rawName: string): Promise<Contact | null> {
  const key = normalise(rawName);
  if (!key) return null;
  const hit = memory().get(key);
  if (hit) return hit;
  if (!mongoConfigured) return null;
  try {
    const db = await getDb();
    const found = (await db.collection(COLLECTION).findOne({ userId: DEFAULT_USER, key }, { projection: { _id: 0 } })) as unknown as Contact | null;
    if (found) memory().set(key, found);
    return found;
  } catch (error) {
    console.error('[zyron] could not read contacts', error);
    return null;
  }
}

export async function forgetContact(rawName: string): Promise<void> {
  const key = normalise(rawName);
  memory().delete(key);
  if (!mongoConfigured) return;
  try {
    const db = await getDb();
    await db.collection(COLLECTION).deleteMany({ userId: DEFAULT_USER, key });
  } catch (error) {
    console.error('[zyron] could not forget contact', error);
  }
}
