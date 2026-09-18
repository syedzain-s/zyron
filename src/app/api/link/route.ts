import { NextResponse } from 'next/server';
import { getDb, mongoConfigured } from '@/lib/db/mongo';
import { DEFAULT_USER } from '@/lib/db/store';

/**
 * Phone pairing.
 *
 *   POST { action: 'open',  code }        laptop: this code is on screen
 *   POST { action: 'claim', code, phone } phone:  I scanned it
 *   GET  ?code=…                          laptop: has anyone claimed it yet?
 *   DELETE                                laptop: forget the linked phone
 *
 * Codes live for two minutes. On Vercel every request may hit a different
 * server, so the record goes to Mongo; the in-memory map is only for local
 * development without a database.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PhoneInfo {
  name: string;
  sim: string;
  battery: number;
  signal: number;
}

interface LinkRecord {
  userId: string;
  code: string;
  status: 'waiting' | 'linked';
  phone?: PhoneInfo & { linkedAt: number };
  openedAt: number;
}

const COLLECTION = 'phone_links';
const CODE_TTL_MS = 2 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __zyronLinks: Map<string, LinkRecord> | undefined;
}
const memory = () => (global.__zyronLinks ??= new Map<string, LinkRecord>());

async function read(code: string): Promise<LinkRecord | null> {
  if (mongoConfigured) {
    try {
      const db = await getDb();
      return (await db.collection(COLLECTION).findOne({ code }, { projection: { _id: 0 } })) as unknown as LinkRecord | null;
    } catch (error) {
      console.error('[zyron] link read failed', error);
    }
  }
  return memory().get(code) ?? null;
}

async function write(record: LinkRecord): Promise<void> {
  memory().set(record.code, record);
  if (!mongoConfigured) return;
  try {
    const db = await getDb();
    await db.collection(COLLECTION).updateOne({ code: record.code }, { $set: record }, { upsert: true });
  } catch (error) {
    console.error('[zyron] link write failed', error);
  }
}

const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z2-9]{8}$/.test(v);

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code')?.toUpperCase() ?? '';
  if (!isCode(code)) return NextResponse.json({ error: 'Bad code.' }, { status: 400 });

  const record = await read(code);
  if (!record || Date.now() - record.openedAt > CODE_TTL_MS) return NextResponse.json({ status: 'expired' });
  return NextResponse.json({ status: record.status, phone: record.phone ?? null });
}

export async function POST(req: Request) {
  let body: { action?: string; code?: string; phone?: Partial<PhoneInfo> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }
  const code = body.code?.toUpperCase() ?? '';
  if (!isCode(code)) return NextResponse.json({ error: 'Bad code.' }, { status: 400 });

  if (body.action === 'open') {
    await write({ userId: DEFAULT_USER, code, status: 'waiting', openedAt: Date.now() });
    return NextResponse.json({ status: 'waiting' });
  }

  if (body.action === 'claim') {
    const record = await read(code);
    if (!record || Date.now() - record.openedAt > CODE_TTL_MS) {
      return NextResponse.json({ error: 'That code has expired.' }, { status: 404 });
    }
    const phone = {
      name: String(body.phone?.name ?? 'Phone').slice(0, 60),
      sim: String(body.phone?.sim ?? 'SIM').slice(0, 60),
      battery: Number(body.phone?.battery ?? 100),
      signal: Number(body.phone?.signal ?? 4),
      linkedAt: Date.now(),
    };
    await write({ ...record, status: 'linked', phone });
    return NextResponse.json({ status: 'linked', phone });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

export async function DELETE() {
  memory().clear();
  if (mongoConfigured) {
    try {
      const db = await getDb();
      await db.collection(COLLECTION).deleteMany({ userId: DEFAULT_USER });
    } catch (error) {
      console.error('[zyron] link delete failed', error);
    }
  }
  return NextResponse.json({ ok: true });
}
