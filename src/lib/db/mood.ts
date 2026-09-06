import { randomUUID } from 'crypto';
import type { Mood } from '@/lib/agent/mood';
import { DEFAULT_USER } from './store';
import { getDb, mongoConfigured } from './mongo';

/**
 * Storage for mood check-ins.
 *
 * The photo and the recording are never stored. They are read in memory,
 * turned into a single word, and dropped before this file is ever called.
 * What lands here is a mood, a timestamp, and what the person said helped —
 * which is everything the features need and nothing that could embarrass
 * someone if the database leaked.
 */

export type CheckInSource = 'camera' | 'voice' | 'manual';

export interface CheckIn {
  id: string;
  userId: string;
  mood: Mood;
  source: CheckInSource;
  /** The model's confidence, or 1 when the person picked the mood themselves. */
  confidence: number;
  /** Whether they confirmed or corrected the reading. */
  corrected: boolean;
  note?: string;
  createdAt: number;
}

export interface Outcome {
  id: string;
  userId: string;
  checkInId: string;
  techniqueId: string;
  techniqueTitle: string;
  helped: boolean;
  createdAt: number;
}

export interface TechniqueScore {
  techniqueId: string;
  title: string;
  tried: number;
  helped: number;
  /** helped / tried, 0–1. */
  rate: number;
}

export interface TrendPoint {
  /** YYYY-MM-DD */
  day: string;
  /** −2 (low) … +2 (bright). Averaged when there are several that day. */
  score: number;
  count: number;
}

export interface WorkloadInsight {
  /** Null when there is not enough history to say anything honest. */
  message: string | null;
  heavyDayAverage: number | null;
  lightDayAverage: number | null;
  daysCompared: number;
}

/** Maps a mood onto a single axis so it can be averaged and charted. */
export const MOOD_SCORE: Record<Mood, number> = {
  bright: 2,
  calm: 1,
  tired: -0.5,
  flat: -1,
  irritable: -1,
  tense: -1,
  anxious: -1.5,
  low: -2,
};

const CHECKINS = 'mood_checkins';
const OUTCOMES = 'mood_outcomes';

const newId = () => randomUUID();
const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export interface MoodStore {
  readonly kind: 'mongo' | 'memory';
  addCheckIn(record: Omit<CheckIn, 'id'>): Promise<CheckIn>;
  addOutcome(record: Omit<Outcome, 'id'>): Promise<Outcome>;
  recentCheckIns(userId: string, days?: number): Promise<CheckIn[]>;
  outcomes(userId: string): Promise<Outcome[]>;
  clear(userId: string): Promise<void>;
}

/* ────────────────────────────── Mongo ────────────────────────────── */

class MongoMoodStore implements MoodStore {
  readonly kind = 'mongo' as const;

  private async col(name: string) {
    const db = await getDb();
    const col = db.collection(name);
    await col.createIndex({ userId: 1, createdAt: -1 }).catch(() => undefined);
    return col;
  }

  async addCheckIn(record: Omit<CheckIn, 'id'>) {
    const doc: CheckIn = { id: newId(), ...record };
    (await this.col(CHECKINS)).insertOne({ ...doc });
    return doc;
  }

  async addOutcome(record: Omit<Outcome, 'id'>) {
    const doc: Outcome = { id: newId(), ...record };
    (await this.col(OUTCOMES)).insertOne({ ...doc });
    return doc;
  }

  async recentCheckIns(userId: string, days = 30) {
    const since = Date.now() - days * 86_400_000;
    const docs = await (await this.col(CHECKINS))
      .find({ userId, createdAt: { $gte: since } }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(300)
      .toArray();
    return docs as unknown as CheckIn[];
  }

  async outcomes(userId: string) {
    const docs = await (await this.col(OUTCOMES))
      .find({ userId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
    return docs as unknown as Outcome[];
  }

  async clear(userId: string) {
    const db = await getDb();
    await Promise.all([
      db.collection(CHECKINS).deleteMany({ userId }),
      db.collection(OUTCOMES).deleteMany({ userId }),
    ]);
  }
}

/* ────────────────────────────── Memory ────────────────────────────── */

class MemoryMoodStore implements MoodStore {
  readonly kind = 'memory' as const;
  private checkIns: CheckIn[] = [];
  private results: Outcome[] = [];

  async addCheckIn(record: Omit<CheckIn, 'id'>) {
    const doc: CheckIn = { id: newId(), ...record };
    this.checkIns.unshift(doc);
    this.checkIns = this.checkIns.slice(0, 300);
    return doc;
  }

  async addOutcome(record: Omit<Outcome, 'id'>) {
    const doc: Outcome = { id: newId(), ...record };
    this.results.unshift(doc);
    this.results = this.results.slice(0, 500);
    return doc;
  }

  async recentCheckIns(userId: string, days = 30) {
    const since = Date.now() - days * 86_400_000;
    return this.checkIns.filter((c) => c.userId === userId && c.createdAt >= since);
  }

  async outcomes(userId: string) {
    return this.results.filter((o) => o.userId === userId);
  }

  async clear(userId: string) {
    this.checkIns = this.checkIns.filter((c) => c.userId !== userId);
    this.results = this.results.filter((o) => o.userId !== userId);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __zyronMoodStore: MemoryMoodStore | undefined;
}

let mongoMood: MongoMoodStore | null = null;

export function getMoodStore(): MoodStore {
  if (mongoConfigured) {
    if (!mongoMood) mongoMood = new MongoMoodStore();
    return mongoMood;
  }
  if (!global.__zyronMoodStore) global.__zyronMoodStore = new MemoryMoodStore();
  return global.__zyronMoodStore;
}

/* ───────────────────── What actually works for you ───────────────────── */

/**
 * Every wellness app gives everyone the same advice. This ranks techniques by
 * what has actually helped *this* person, which is the same principle as the
 * ROI module: the agent keeps score of its own suggestions.
 *
 * Two attempts minimum before a technique is ranked. One data point is a
 * coincidence, and presenting it as a finding would be dishonest.
 */
export function scoreTechniques(outcomes: Outcome[]): TechniqueScore[] {
  const byId = new Map<string, TechniqueScore>();

  for (const o of outcomes) {
    const current = byId.get(o.techniqueId) ?? {
      techniqueId: o.techniqueId,
      title: o.techniqueTitle,
      tried: 0,
      helped: 0,
      rate: 0,
    };
    current.tried += 1;
    if (o.helped) current.helped += 1;
    current.rate = current.helped / current.tried;
    byId.set(o.techniqueId, current);
  }

  return Array.from(byId.values())
    .filter((s) => s.tried >= 2)
    .sort((a, b) => b.rate - a.rate || b.tried - a.tried);
}

/** Technique ids this person has tried and reported no help from, twice or more. */
export function unhelpfulFor(outcomes: Outcome[]): string[] {
  return scoreTechniques(outcomes)
    .filter((s) => s.rate === 0)
    .map((s) => s.techniqueId);
}

/* ───────────────────────────── Trend ───────────────────────────── */

export function buildTrend(checkIns: CheckIn[], days = 14): TrendPoint[] {
  const buckets = new Map<string, { total: number; count: number }>();

  for (const c of checkIns) {
    const key = dayKey(c.createdAt);
    const b = buckets.get(key) ?? { total: 0, count: 0 };
    b.total += MOOD_SCORE[c.mood] ?? 0;
    b.count += 1;
    buckets.set(key, b);
  }

  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(Date.now() - i * 86_400_000);
    const b = buckets.get(key);
    out.push({
      day: key,
      score: b ? Number((b.total / b.count).toFixed(2)) : 0,
      count: b?.count ?? 0,
    });
  }
  return out;
}

/* ─────────────────── Mood against workload ─────────────────── */

/**
 * The point where this stops being a mood app and becomes part of the agent.
 *
 * There is no calendar connected yet, so the honest proxy for a heavy day is
 * how much the person put through ZYRON that day — commands, approvals,
 * commitments. It is real data about their own activity, not invented, and the
 * moment a calendar is connected this function reads that instead.
 */
export function correlateWithWorkload(
  checkIns: CheckIn[],
  activityByDay: Record<string, number>,
): WorkloadInsight {
  const byDay = new Map<string, { total: number; count: number }>();
  for (const c of checkIns) {
    const key = dayKey(c.createdAt);
    const b = byDay.get(key) ?? { total: 0, count: 0 };
    b.total += MOOD_SCORE[c.mood] ?? 0;
    b.count += 1;
    byDay.set(key, b);
  }

  const days = Array.from(byDay.entries())
    .map(([day, b]) => ({ day, mood: b.total / b.count, load: activityByDay[day] ?? 0 }))
    .filter((d) => d.load > 0);

  // Four days is already thin. Below that, any pattern is noise, and saying
  // one exists would be making something up.
  if (days.length < 4) {
    return { message: null, heavyDayAverage: null, lightDayAverage: null, daysCompared: days.length };
  }

  const median = [...days].sort((a, b) => a.load - b.load)[Math.floor(days.length / 2)].load;
  const heavy = days.filter((d) => d.load > median);
  const light = days.filter((d) => d.load <= median);

  if (heavy.length === 0 || light.length === 0) {
    return { message: null, heavyDayAverage: null, lightDayAverage: null, daysCompared: days.length };
  }

  const avg = (xs: typeof days) => xs.reduce((s, d) => s + d.mood, 0) / xs.length;
  const heavyAvg = Number(avg(heavy).toFixed(2));
  const lightAvg = Number(avg(light).toFixed(2));
  const gap = lightAvg - heavyAvg;

  let message: string | null = null;
  if (gap >= 0.6) {
    message = `Across ${days.length} days, your mood reads lower on your busiest ones. Worth protecting a gap on heavy days before it costs you the evening.`;
  } else if (gap <= -0.6) {
    message = `Across ${days.length} days, you actually read better on your busiest ones. Quiet days may be the ones to watch.`;
  } else {
    message = `Across ${days.length} days, workload and mood are not tracking each other. Whatever is moving your mood, it is not how full the day is.`;
  }

  return { message, heavyDayAverage: heavyAvg, lightDayAverage: lightAvg, daysCompared: days.length };
}

export { DEFAULT_USER };
