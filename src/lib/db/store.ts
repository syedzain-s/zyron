import { randomUUID } from 'crypto';
import type { ApprovalStatus, RiskLevel } from '@/types';
import { ensureIndexes, getDb, mongoConfigured } from './mongo';

/**
 * Single-user build: every record is stamped with this owner. When auth is
 * added in phase 3, replace the constant with the session user id and nothing
 * else in this file has to change.
 */
export const DEFAULT_USER = 'principal';

export interface ApprovalRecord {
  id: string;
  userId: string;
  moduleCode: string;
  moduleName: string;
  action: string;
  target: string;
  payload: string;
  risk: RiskLevel;
  status: ApprovalStatus;
  createdAt: number;
  resolvedAt?: number;
}

export interface CommitmentRecord {
  id: string;
  userId: string;
  text: string;
  owner: string;
  due: string | null;
  source: string;
  state: 'open' | 'nudged' | 'closed';
  createdAt: number;
}

export interface EventRecord {
  id: string;
  userId: string;
  kind: string;
  summary: string;
  detail?: Record<string, unknown>;
  at: number;
}

export interface MessageRecord {
  id: string;
  userId: string;
  speaker: 'user' | 'zyron' | 'system';
  body: string;
  routedTo?: string[];
  approvalId?: string;
  createdAt: number;
}

export interface ZyronStore {
  readonly kind: 'mongo' | 'memory';

  listApprovals(userId: string, limit?: number): Promise<ApprovalRecord[]>;
  createApproval(record: Omit<ApprovalRecord, 'id'>): Promise<ApprovalRecord>;
  resolveApproval(
    userId: string,
    id: string,
    status: ApprovalStatus,
    payload?: string,
  ): Promise<ApprovalRecord | null>;

  listCommitments(userId: string): Promise<CommitmentRecord[]>;
  createCommitments(records: Array<Omit<CommitmentRecord, 'id'>>): Promise<CommitmentRecord[]>;
  setCommitmentState(
    userId: string,
    id: string,
    state: CommitmentRecord['state'],
  ): Promise<CommitmentRecord | null>;

  listMessages(userId: string, limit?: number): Promise<MessageRecord[]>;
  appendMessage(record: Omit<MessageRecord, 'id'>): Promise<MessageRecord>;

  appendEvent(record: Omit<EventRecord, 'id'>): Promise<void>;
  listEvents(userId: string, limit?: number): Promise<EventRecord[]>;

  reset(userId: string): Promise<void>;
}

const newId = () => randomUUID();

/* ────────────────────────────── Mongo ────────────────────────────── */

class MongoStore implements ZyronStore {
  readonly kind = 'mongo' as const;

  private async col<T extends Document>(name: string) {
    await ensureIndexes();
    const db = await getDb();
    return db.collection(name);
  }

  async listApprovals(userId: string, limit = 50) {
    const col = await this.col('approvals');
    const docs = await col.find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray();
    return docs.map(stripId<ApprovalRecord>);
  }

  async createApproval(record: Omit<ApprovalRecord, 'id'>) {
    const doc: ApprovalRecord = { id: newId(), ...record };
    const col = await this.col('approvals');
    await col.insertOne({ ...doc });
    return doc;
  }

  async resolveApproval(userId: string, id: string, status: ApprovalStatus, payload?: string) {
    const col = await this.col('approvals');
    const update: Record<string, unknown> = { status, resolvedAt: Date.now() };
    if (payload !== undefined) update.payload = payload;
    const result = await col.findOneAndUpdate(
      { id, userId },
      { $set: update },
      { returnDocument: 'after' },
    );
    return result ? stripId<ApprovalRecord>(result) : null;
  }

  async listCommitments(userId: string) {
    const col = await this.col('commitments');
    const docs = await col.find({ userId }).sort({ createdAt: -1 }).limit(100).toArray();
    return docs.map(stripId<CommitmentRecord>);
  }

  async createCommitments(records: Array<Omit<CommitmentRecord, 'id'>>) {
    if (records.length === 0) return [];
    const docs = records.map((r) => ({ id: newId(), ...r }));
    const col = await this.col('commitments');
    await col.insertMany(docs.map((d) => ({ ...d })));
    return docs;
  }

  async setCommitmentState(userId: string, id: string, state: CommitmentRecord['state']) {
    const col = await this.col('commitments');
    const result = await col.findOneAndUpdate(
      { id, userId },
      { $set: { state } },
      { returnDocument: 'after' },
    );
    return result ? stripId<CommitmentRecord>(result) : null;
  }

  async listMessages(userId: string, limit = 60) {
    const col = await this.col('messages');
    const docs = await col.find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray();
    return docs.reverse().map(stripId<MessageRecord>);
  }

  async appendMessage(record: Omit<MessageRecord, 'id'>) {
    const doc: MessageRecord = { id: newId(), ...record };
    const col = await this.col('messages');
    await col.insertOne({ ...doc });
    return doc;
  }

  async appendEvent(record: Omit<EventRecord, 'id'>) {
    const col = await this.col('events');
    await col.insertOne({ id: newId(), ...record });
  }

  async listEvents(userId: string, limit = 40) {
    const col = await this.col('events');
    const docs = await col.find({ userId }).sort({ at: -1 }).limit(limit).toArray();
    return docs.map(stripId<EventRecord>);
  }

  async reset(userId: string) {
    const db = await getDb();
    await Promise.all(
      ['approvals', 'commitments', 'messages', 'events'].map((name) =>
        db.collection(name).deleteMany({ userId }),
      ),
    );
  }
}

function stripId<T>(doc: Record<string, unknown>): T {
  const { _id, ...rest } = doc;
  return rest as T;
}

/* ────────────────────────────── Memory ────────────────────────────── */

/**
 * The offline twin of MongoStore. Keeps the console fully working with no
 * database configured, which matters for a live demo on an unreliable network.
 */
class MemoryStore implements ZyronStore {
  readonly kind = 'memory' as const;

  private approvals: ApprovalRecord[] = [];
  private commitments: CommitmentRecord[] = [];
  private messages: MessageRecord[] = [];
  private events: EventRecord[] = [];

  async listApprovals(userId: string, limit = 50) {
    return this.approvals
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async createApproval(record: Omit<ApprovalRecord, 'id'>) {
    const doc: ApprovalRecord = { id: newId(), ...record };
    this.approvals.unshift(doc);
    return doc;
  }

  async resolveApproval(userId: string, id: string, status: ApprovalStatus, payload?: string) {
    const found = this.approvals.find((a) => a.id === id && a.userId === userId);
    if (!found) return null;
    found.status = status;
    found.resolvedAt = Date.now();
    if (payload !== undefined) found.payload = payload;
    return found;
  }

  async listCommitments(userId: string) {
    return this.commitments.filter((c) => c.userId === userId);
  }

  async createCommitments(records: Array<Omit<CommitmentRecord, 'id'>>) {
    const docs = records.map((r) => ({ id: newId(), ...r }));
    this.commitments.unshift(...docs);
    return docs;
  }

  async setCommitmentState(userId: string, id: string, state: CommitmentRecord['state']) {
    const found = this.commitments.find((c) => c.id === id && c.userId === userId);
    if (!found) return null;
    found.state = state;
    return found;
  }

  async listMessages(userId: string, limit = 60) {
    return this.messages.filter((m) => m.userId === userId).slice(-limit);
  }

  async appendMessage(record: Omit<MessageRecord, 'id'>) {
    const doc: MessageRecord = { id: newId(), ...record };
    this.messages.push(doc);
    return doc;
  }

  async appendEvent(record: Omit<EventRecord, 'id'>) {
    this.events.unshift({ id: newId(), ...record });
    this.events = this.events.slice(0, 200);
  }

  async listEvents(userId: string, limit = 40) {
    return this.events.filter((e) => e.userId === userId).slice(0, limit);
  }

  async reset(userId: string) {
    this.approvals = this.approvals.filter((a) => a.userId !== userId);
    this.commitments = this.commitments.filter((c) => c.userId !== userId);
    this.messages = this.messages.filter((m) => m.userId !== userId);
    this.events = this.events.filter((e) => e.userId !== userId);
  }
}

/* ────────────────────────────── Selection ────────────────────────────── */

declare global {
  // eslint-disable-next-line no-var
  var __zyronMemoryStore: MemoryStore | undefined;
}

let mongoStore: MongoStore | null = null;

export function getStore(): ZyronStore {
  if (mongoConfigured) {
    if (!mongoStore) mongoStore = new MongoStore();
    return mongoStore;
  }
  // Survive hot reload so the demo does not lose state on every file save.
  if (!global.__zyronMemoryStore) global.__zyronMemoryStore = new MemoryStore();
  return global.__zyronMemoryStore;
}
