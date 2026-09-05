import { randomUUID } from 'crypto';
import type { ContractReport } from '@/lib/agent/contracts';
import { DEFAULT_USER } from './store';
import { ensureIndexes, getDb, mongoConfigured } from './mongo';

/**
 * Storage for analysed contracts.
 *
 * This lives beside `store.ts` rather than inside it because a document
 * carries a very different payload — a whole nested report plus the raw text —
 * and folding it into the general store would make that interface awkward for
 * everything else. Same two-implementation pattern though: Mongo when a URI is
 * configured, memory when it is not, so the feature demos with no database.
 */

export interface StoredDocument {
  id: string;
  userId: string;
  title: string;
  kind: 'pdf' | 'text';
  pages: number;
  bytes: number;
  report: ContractReport;
  /** The extracted text, kept so a re-analysis never needs the original file. */
  text: string;
  createdAt: number;
}

/** What the list endpoint returns — the report without the full document text. */
export type DocumentSummary = Omit<StoredDocument, 'text'>;

export interface DocumentStore {
  readonly kind: 'mongo' | 'memory';
  create(record: Omit<StoredDocument, 'id'>): Promise<StoredDocument>;
  list(userId: string, limit?: number): Promise<DocumentSummary[]>;
  get(userId: string, id: string): Promise<StoredDocument | null>;
  remove(userId: string, id: string): Promise<boolean>;
  clear(userId: string): Promise<void>;
}

const COLLECTION = 'documents';
const newId = () => randomUUID();

/* ────────────────────────────── Mongo ────────────────────────────── */

class MongoDocumentStore implements DocumentStore {
  readonly kind = 'mongo' as const;

  private async col() {
    await ensureIndexes();
    const db = await getDb();
    const col = db.collection(COLLECTION);
    // Cheap and idempotent; keeps this file independent of ensureIndexes.
    await col.createIndex({ userId: 1, createdAt: -1 }).catch(() => undefined);
    return col;
  }

  async create(record: Omit<StoredDocument, 'id'>) {
    const doc: StoredDocument = { id: newId(), ...record };
    const col = await this.col();
    await col.insertOne({ ...doc });
    return doc;
  }

  async list(userId: string, limit = 20) {
    const col = await this.col();
    const docs = await col
      .find({ userId }, { projection: { _id: 0, text: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs as unknown as DocumentSummary[];
  }

  async get(userId: string, id: string) {
    const col = await this.col();
    const doc = await col.findOne({ id, userId }, { projection: { _id: 0 } });
    return (doc as unknown as StoredDocument) ?? null;
  }

  async remove(userId: string, id: string) {
    const col = await this.col();
    const result = await col.deleteOne({ id, userId });
    return result.deletedCount === 1;
  }

  async clear(userId: string) {
    const db = await getDb();
    await db.collection(COLLECTION).deleteMany({ userId });
  }
}

/* ────────────────────────────── Memory ────────────────────────────── */

class MemoryDocumentStore implements DocumentStore {
  readonly kind = 'memory' as const;
  private docs: StoredDocument[] = [];

  async create(record: Omit<StoredDocument, 'id'>) {
    const doc: StoredDocument = { id: newId(), ...record };
    this.docs.unshift(doc);
    // Raw contract text is large; without a ceiling a long session would sit
    // on tens of megabytes of strings in the server process.
    this.docs = this.docs.slice(0, 30);
    return doc;
  }

  async list(userId: string, limit = 20) {
    return this.docs
      .filter((d) => d.userId === userId)
      .slice(0, limit)
      .map(({ text: _text, ...rest }) => rest);
  }

  async get(userId: string, id: string) {
    return this.docs.find((d) => d.id === id && d.userId === userId) ?? null;
  }

  async remove(userId: string, id: string) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !(d.id === id && d.userId === userId));
    return this.docs.length < before;
  }

  async clear(userId: string) {
    this.docs = this.docs.filter((d) => d.userId !== userId);
  }
}

/* ────────────────────────────── Selection ────────────────────────────── */

declare global {
  // eslint-disable-next-line no-var
  var __zyronMemoryDocs: MemoryDocumentStore | undefined;
}

let mongoDocs: MongoDocumentStore | null = null;

export function getDocumentStore(): DocumentStore {
  if (mongoConfigured) {
    if (!mongoDocs) mongoDocs = new MongoDocumentStore();
    return mongoDocs;
  }
  // Survive hot reload so an uploaded contract is not lost on every file save.
  if (!global.__zyronMemoryDocs) global.__zyronMemoryDocs = new MemoryDocumentStore();
  return global.__zyronMemoryDocs;
}

export { DEFAULT_USER };
