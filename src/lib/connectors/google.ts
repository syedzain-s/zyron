import { DEFAULT_USER } from '@/lib/db/store';
import { getDb, mongoConfigured } from '@/lib/db/mongo';

/**
 * Google connector — Gmail and Calendar.
 *
 * Written against Google's REST endpoints rather than `googleapis`, which is a
 * very large dependency for the handful of calls this actually makes.
 *
 * Every read scope here is read-only. The one write capability is
 * `gmail.send`, and `sendGmail()` below is the only function that uses it —
 * called from the dispatcher, which is itself only reachable after the user
 * has tapped approve. Reading and sending stay separate on purpose.
 *
 * `gmail.send` is deliberately narrower than `gmail.modify`: it can compose and
 * send, but it cannot read, label or delete anything. If this token leaked, the
 * worst it could do is send mail — it could not quietly rewrite the mailbox.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
].join(' ');

const TOKEN_COLLECTION = 'google_tokens';
const TIMEOUT_MS = 15_000;

export interface GoogleTokens {
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  email?: string;
  connectedAt: number;
}

export class GoogleError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = 'GoogleError';
    this.userMessage = userMessage;
    if (cause) console.error('[zyron] google:', userMessage, cause);
  }
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * The redirect must match what is registered in the Google console exactly.
 * Deriving it from the request host means one deployment does not need a
 * different value from the other, and a typo shows up immediately rather than
 * as an opaque `redirect_uri_mismatch`.
 */
export function redirectUri(origin?: string): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const base = origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/google/callback`;
}

/* ─────────────────────────── OAuth flow ─────────────────────────── */

export function authUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPES,
    // Without both of these Google returns no refresh token on repeat
    // authorisations, and the connection silently dies after an hour.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, origin: string): Promise<GoogleTokens> {
  const res = await post('https://oauth2.googleapis.com/token', {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri(origin),
    grant_type: 'authorization_code',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (body.includes('redirect_uri_mismatch')) {
      throw new GoogleError(
        `Google rejected the redirect URI. Add exactly "${redirectUri(origin)}" to your OAuth client.`,
      );
    }
    throw new GoogleError('Google refused the sign-in. Try connecting again.', body.slice(0, 300));
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  if (!data.refresh_token) {
    throw new GoogleError(
      'Google did not return a refresh token. Remove ZYRON at myaccount.google.com/permissions and connect again.',
    );
  }

  return {
    userId: DEFAULT_USER,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    email: emailFromIdToken(data.id_token),
    connectedAt: Date.now(),
  };
}

/** The id_token is a JWT; the middle segment carries the claims. */
function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = idToken.split('.')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    return (JSON.parse(json) as { email?: string }).email;
  } catch {
    return undefined;
  }
}

/* ─────────────────────────── Token storage ─────────────────────────── */

/** Falls back to process memory when no database is configured, as elsewhere. */
declare global {
  // eslint-disable-next-line no-var
  var __zyronGoogleTokens: GoogleTokens | undefined;
}

export async function saveTokens(tokens: GoogleTokens): Promise<void> {
  if (!mongoConfigured) {
    global.__zyronGoogleTokens = tokens;
    return;
  }
  const db = await getDb();
  await db
    .collection(TOKEN_COLLECTION)
    .updateOne({ userId: tokens.userId }, { $set: tokens }, { upsert: true });
}

export async function loadTokens(): Promise<GoogleTokens | null> {
  if (!mongoConfigured) return global.__zyronGoogleTokens ?? null;
  try {
    const db = await getDb();
    const doc = await db
      .collection(TOKEN_COLLECTION)
      .findOne({ userId: DEFAULT_USER }, { projection: { _id: 0 } });
    return (doc as unknown as GoogleTokens) ?? null;
  } catch (error) {
    console.error('[zyron] could not read google tokens', error);
    return null;
  }
}

export async function disconnect(): Promise<void> {
  global.__zyronGoogleTokens = undefined;
  if (!mongoConfigured) return;
  const db = await getDb();
  await db.collection(TOKEN_COLLECTION).deleteMany({ userId: DEFAULT_USER });
}

export async function isConnected(): Promise<boolean> {
  return Boolean(await loadTokens());
}

/**
 * Returns a usable access token, refreshing when it is close to expiry.
 *
 * The sixty-second margin matters: a token that expires mid-request produces a
 * 401 that looks like a broken connection rather than an expired one.
 */
async function accessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new GoogleError('Google is not connected yet.');

  if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken;

  const res = await post('https://oauth2.googleapis.com/token', {
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // A revoked or expired refresh token cannot be recovered from; clearing it
    // makes the UI offer a reconnect instead of failing forever.
    if (body.includes('invalid_grant')) {
      await disconnect();
      throw new GoogleError('Google access expired. Connect the account again.');
    }
    throw new GoogleError('Could not refresh Google access.', body.slice(0, 300));
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const updated: GoogleTokens = {
    ...tokens,
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  await saveTokens(updated);
  return updated.accessToken;
}

/* ─────────────────────────── Calendar ─────────────────────────── */

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  attendees: string[];
  organizer?: string;
}

export async function todaysEvents(): Promise<CalendarEvent[]> {
  const token = await accessToken();

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const params = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '25',
  });

  const res = await get(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    token,
  );
  if (!res.ok) throw new GoogleError('Could not read your calendar.', await res.text());

  const data = (await res.json()) as {
    items?: Array<{
      summary?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: Array<{ email?: string; displayName?: string }>;
      organizer?: { email?: string; displayName?: string };
    }>;
  };

  return (data.items ?? []).map((e) => ({
    summary: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    allDay: !e.start?.dateTime,
    location: e.location,
    attendees: (e.attendees ?? [])
      .map((a) => a.displayName ?? a.email ?? '')
      .filter(Boolean)
      .slice(0, 8),
    organizer: e.organizer?.displayName ?? e.organizer?.email,
  }));
}

/* ─────────────────────────── Gmail ─────────────────────────── */

export interface MailSummary {
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  unread: boolean;
}

export async function recentMail(limit = 12): Promise<MailSummary[]> {
  const token = await accessToken();

  // Only the primary inbox category: promotions and social are noise in a
  // briefing, and including them buries whatever actually mattered.
  const params = new URLSearchParams({
    q: 'category:primary newer_than:2d',
    maxResults: String(limit),
  });

  const listRes = await get(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    token,
  );
  if (!listRes.ok) throw new GoogleError('Could not read your mail.', await listRes.text());

  const list = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = (list.messages ?? []).slice(0, limit);
  if (ids.length === 0) return [];

  // Metadata format only: the briefing needs headers and a snippet, not the
  // body, and asking for less keeps the request fast and the data minimal.
  const messages = await Promise.all(
    ids.map(async ({ id }) => {
      const res = await get(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        token,
      );
      if (!res.ok) return null;

      const m = (await res.json()) as {
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name: string; value: string }> };
      };

      const header = (name: string) =>
        m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';

      return {
        from: header('from'),
        subject: header('subject') || '(no subject)',
        snippet: (m.snippet ?? '').slice(0, 180),
        receivedAt: header('date'),
        unread: (m.labelIds ?? []).includes('UNREAD'),
      } satisfies MailSummary;
    }),
  );

  return messages.filter((m): m is MailSummary => m !== null);
}

/* ─────────────────────────── Gmail send ─────────────────────────── */

export interface SentMail {
  /** Gmail's own id for the message, so the audit trail can point at it. */
  id: string;
  threadId?: string;
  to: string;
  subject: string;
}

/**
 * Sends one plain-text message as the connected account.
 *
 * This is the only write in the whole connector. It is not exported to the
 * modules — only the dispatcher calls it, and the dispatcher only runs after
 * an approval has been resolved. That chain is the safety model.
 */
export async function sendGmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<SentMail> {
  const to = extractAddress(input.to);
  if (!to) {
    throw new GoogleError(`"${input.to}" is not a usable email address, so nothing was sent.`);
  }

  const subject = input.subject.trim() || '(no subject)';
  const token = await accessToken();
  const raw = Buffer.from(buildMime(to, subject, input.body)).toString('base64url');

  const res = await postJson(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    token,
    { raw },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');

    // The most likely failure by far, and the least obvious one: the stored
    // token predates the gmail.send scope. Refreshing does not widen a token,
    // so the account genuinely has to be connected again.
    if (res.status === 403 && text.includes('insufficient')) {
      throw new GoogleError(
        'This Google connection was authorised before sending was enabled. Disconnect and connect the account again to grant send access.',
        text.slice(0, 300),
      );
    }
    if (res.status === 401) {
      throw new GoogleError('Google rejected the credentials. Connect the account again.', text.slice(0, 300));
    }

    throw new GoogleError(`Gmail refused the message (HTTP ${res.status}). Nothing was sent.`, text.slice(0, 300));
  }

  const data = (await res.json()) as { id?: string; threadId?: string };
  return { id: data.id ?? '', threadId: data.threadId, to, subject };
}

/**
 * Pulls the address out of `Israr Ahmed <israr@x.com>`, or accepts a bare one.
 * The router hands over whatever the recipient resolver produced, which is a
 * display form, not an address.
 */
export function extractAddress(raw: string): string | null {
  const angled = raw.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : raw).trim().toLowerCase();
  return /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(candidate) ? candidate : null;
}

/**
 * A minimal RFC 2822 message.
 *
 * The subject is encoded per RFC 2047 whenever it is not plain ASCII —
 * an Urdu or accented subject line otherwise arrives as mojibake, and the
 * failure is silent because Gmail accepts the message happily.
 */
function buildMime(to: string, subject: string, body: string): string {
  const headers = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  // Bare newlines are tolerated by Gmail but CRLF is what the spec asks for.
  return `${headers.join('\r\n')}\r\n\r\n${body.replace(/\r?\n/g, '\r\n')}`;
}

function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}

/* ─────────────────────────── Contacts ─────────────────────────── */

export interface Contact {
  name: string;
  email: string;
  /** How many recent messages this address appeared in. */
  seen: number;
}

/**
 * Finds someone's address by looking through mail already exchanged with them.
 *
 * The People API would be the obvious choice, but it needs another scope and
 * another consent screen, and most people's contact list is far less complete
 * than their sent mail. Searching the mailbox finds whoever they actually
 * correspond with.
 *
 * Returns matches ranked by how often the address appears, because the person
 * you have written to twenty times is almost certainly the one you meant.
 */
export async function findContact(name: string): Promise<Contact[]> {
  const query = name.trim();
  if (!query) return [];

  // An address in the command needs no lookup.
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(query)) {
    return [{ name: query.split('@')[0], email: query.toLowerCase(), seen: 1 }];
  }

  const token = await accessToken();

  // First pass: let Gmail do the filtering. Cheap, and precise when it works.
  let ids = await listMessageIds(token, `from:${query} OR to:${query}`, 20);

  // Second pass, and the one that matters here.
  //
  // Gmail indexes an address as whole tokens, so searching "israr" does not
  // match "hafizisrar542@gmail.com" — the name is buried inside the token and
  // Gmail does not do substring matching. Someone you mail constantly can
  // therefore come back as "no mail history", which is both wrong and the kind
  // of wrong that looks like a broken connector.
  //
  // So when the targeted query finds nothing, pull recent correspondence and
  // match locally, where a substring test costs nothing.
  if (ids.length === 0) {
    ids = await listMessageIds(token, 'in:sent OR in:inbox', 40);
  }

  if (ids.length === 0) return [];

  const tally = new Map<string, Contact>();
  const needle = query.toLowerCase();

  await Promise.all(
    ids.map(async ({ id }) => {
      const res = await get(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To`,
        token,
      );
      if (!res.ok) return;

      const m = (await res.json()) as {
        payload?: { headers?: Array<{ name: string; value: string }> };
      };

      for (const header of m.payload?.headers ?? []) {
        if (!['from', 'to'].includes(header.name.toLowerCase())) continue;

        // A header can carry several addresses: "A <a@x>, B <b@y>".
        for (const part of header.value.split(',')) {
          const parsed = parseAddress(part);
          if (!parsed) continue;

          const haystack = `${parsed.name} ${parsed.email}`.toLowerCase();
          if (!haystack.includes(needle)) continue;

          const existing = tally.get(parsed.email);
          if (existing) {
            existing.seen += 1;
            // Prefer a real display name over the address stub.
            if (parsed.name && !existing.name.includes(' ')) existing.name = parsed.name;
          } else {
            tally.set(parsed.email, { ...parsed, seen: 1 });
          }
        }
      }
    }),
  );

  return Array.from(tally.values())
    .sort((a, b) => b.seen - a.seen)
    .slice(0, 4);
}

/** Lists message ids for a query, returning an empty list on any failure. */
async function listMessageIds(
  token: string,
  q: string,
  maxResults: number,
): Promise<Array<{ id: string }>> {
  const params = new URLSearchParams({ q, maxResults: String(maxResults) });

  const res = await get(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    token,
  ).catch(() => null);

  if (!res || !res.ok) return [];

  const list = (await res.json().catch(() => null)) as { messages?: Array<{ id: string }> } | null;
  return (list?.messages ?? []).slice(0, maxResults);
}

/** `Israr Ahmed <israr@x.com>` or a bare address. */
function parseAddress(raw: string): { name: string; email: string } | null {
  const angled = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (angled) {
    return { name: angled[1].trim(), email: angled[2].trim().toLowerCase() };
  }
  const bare = raw.trim().match(/^[\w.+-]+@[\w-]+\.[\w.]+$/);
  if (bare) {
    const email = bare[0].toLowerCase();
    return { name: email.split('@')[0], email };
  }
  return null;
}

/* ─────────────────────────── HTTP helpers ─────────────────────────── */

function post(url: string, form: Record<string, string>) {
  return withTimeout(
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    }),
  );
}

function get(url: string, token: string) {
  return withTimeout(fetch(url, { headers: { Authorization: `Bearer ${token}` } }));
}

/** The token endpoint speaks form-encoded; the Gmail API speaks JSON. */
function postJson(url: string, token: string, body: unknown) {
  return withTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  );
}

async function withTimeout(promise: Promise<Response>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
}
