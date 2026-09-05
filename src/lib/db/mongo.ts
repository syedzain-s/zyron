import { MongoClient, type Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? 'zyron';

/**
 * Next.js re-evaluates modules on every hot reload in development, which would
 * open a new connection pool each time and exhaust an Atlas free tier in
 * minutes. Caching the promise on globalThis is the documented way around it.
 */
declare global {
  // eslint-disable-next-line no-var
  var __zyronMongo: Promise<MongoClient> | undefined;
}

export const mongoConfigured = Boolean(uri);

function connect(): Promise<MongoClient> {
  if (!uri) throw new Error('MONGODB_URI is not set.');

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
    retryWrites: true,
  });

  return client.connect();
}

export function getMongoClient(): Promise<MongoClient> {
  if (!uri) throw new Error('MONGODB_URI is not set.');

  if (process.env.NODE_ENV === 'development') {
    if (!global.__zyronMongo) global.__zyronMongo = connect();
    return global.__zyronMongo;
  }

  if (!global.__zyronMongo) global.__zyronMongo = connect();
  return global.__zyronMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}

/**
 * Indexes are created once, lazily, on first database use. Small collections
 * plus a free tier means this costs nothing and removes a manual setup step.
 */
let indexesReady: Promise<void> | null = null;

export function ensureIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db.collection('approvals').createIndex({ userId: 1, createdAt: -1 }),
        db.collection('approvals').createIndex({ userId: 1, status: 1 }),
        db.collection('commitments').createIndex({ userId: 1, state: 1, due: 1 }),
        db.collection('events').createIndex({ userId: 1, at: -1 }),
        db.collection('messages').createIndex({ userId: 1, createdAt: 1 }),
      ]);
    })().catch((error) => {
      // A failed index build should not take the app down.
      console.error('[zyron] index creation failed', error);
      indexesReady = null;
    });
  }
  return indexesReady;
}
