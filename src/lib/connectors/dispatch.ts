/**
 * Outbound dispatch — the only place in ZYRON that talks to the outside world.
 *
 * Nothing calls this except the approvals route, and the approvals route only
 * calls it after the user has tapped approve. That is the entire safety model
 * in one sentence, and keeping it in one file is what makes it auditable.
 *
 * Two channels, tried in order:
 *
 *   1. Gmail — the real one. Sends as the connected Google account through the
 *      same OAuth credentials the briefing modules already read with, using the
 *      narrow `gmail.send` scope. No extra service has to be running, which
 *      means it works identically on localhost and on the deployment.
 *
 *   2. Telegram Bot API — a fallback with no OAuth at all. Useful when Google
 *      is not connected, and honest enough to demo: an approved message
 *      genuinely lands on a real phone.
 *
 * With neither available the dispatcher reports `simulated` and says so. It
 * never claims something was sent when it was not.
 */

import { isConnected, googleConfigured, sendGmail, GoogleError } from '@/lib/connectors/google';

export type Channel = 'gmail' | 'telegram' | 'simulated';

export interface DispatchPayload {
  approvalId: string;
  moduleCode: string;
  moduleName: string;
  action: string;
  target: string;
  body: string;
  risk: string;
  decidedAt: number;
}

export interface DispatchResult {
  delivered: boolean;
  channel: Channel;
  /** Shown to the user, so it says what actually happened. */
  detail: string;
  /** Gmail's message id when there is one, for the audit trail. */
  reference?: string;
}

const TIMEOUT_MS = 12_000;

/**
 * What the system *could* use, judged from configuration alone.
 *
 * Synchronous because the health endpoint reports it on every request. It
 * cannot tell whether Google is actually connected — `resolveChannel()` does
 * that, and dispatch uses the latter.
 */
export function configuredChannel(): Channel {
  if (googleConfigured()) return 'gmail';
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) return 'telegram';
  return 'simulated';
}

/** What the system will actually use right now. */
export async function resolveChannel(): Promise<Channel> {
  if (googleConfigured() && (await isConnected())) return 'gmail';
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) return 'telegram';
  return 'simulated';
}

export async function dispatchApproval(payload: DispatchPayload): Promise<DispatchResult> {
  const channel = await resolveChannel();

  if (channel === 'gmail') {
    const result = await sendViaGmail(payload);
    // A failed send should not silently swallow an approved action, so fall
    // through to Telegram if it is available.
    if (!result.delivered && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const fallback = await sendToTelegram(payload);
      if (fallback.delivered) {
        return { ...fallback, detail: `${fallback.detail} (Gmail failed: ${result.detail})` };
      }
    }
    return result;
  }

  if (channel === 'telegram') return sendToTelegram(payload);

  return {
    delivered: false,
    channel: 'simulated',
    detail: googleConfigured()
      ? 'Recorded as approved. Google is not connected, so nothing left the system.'
      : 'Recorded as approved. No delivery channel is configured, so nothing left the system.',
  };
}

/* ─────────────────────────────── Gmail ─────────────────────────────── */

async function sendViaGmail(payload: DispatchPayload): Promise<DispatchResult> {
  try {
    const { subject, body } = splitSubject(payload);
    const sent = await sendGmail({ to: payload.target, subject, body });

    return {
      delivered: true,
      channel: 'gmail',
      detail: `Sent via Gmail to ${sent.to}.`,
      reference: sent.id || undefined,
    };
  } catch (error) {
    // GoogleError already carries a sentence written for the user.
    const detail =
      error instanceof GoogleError
        ? error.userMessage
        : 'Gmail did not respond. Nothing was sent.';
    console.error('[zyron] gmail dispatch failed', error);
    return { delivered: false, channel: 'gmail', detail };
  }
}

/**
 * The model writes a message, not a message plus metadata, so a subject has to
 * come from somewhere. If the draft opens with its own `Subject:` line that is
 * used and stripped; otherwise the module and action make a serviceable one.
 */
function splitSubject(payload: DispatchPayload): { subject: string; body: string } {
  const match = payload.body.match(/^\s*subject:\s*(.+?)\r?\n+([\s\S]*)$/i);
  if (match && match[1].trim()) {
    return { subject: match[1].trim(), body: match[2].trim() };
  }

  const action = payload.action.trim();
  const subject = action && action.length <= 90 ? capitalise(action) : payload.moduleName;
  return { subject, body: payload.body.trim() };
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ───────────────────────────── Telegram ───────────────────────────── */

async function sendToTelegram(payload: DispatchPayload): Promise<DispatchResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      delivered: false,
      channel: 'telegram',
      detail: 'Telegram is half configured — both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are needed.',
    };
  }

  try {
    const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: 'HTML',
        text: formatTelegram(payload),
        disable_web_page_preview: true,
      }),
    });

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;

    if (!res.ok || !data?.ok) {
      const reason = data?.description ?? `HTTP ${res.status}`;
      console.error('[zyron] telegram rejected the dispatch', reason);
      return {
        delivered: false,
        channel: 'telegram',
        detail: `Telegram refused it: ${reason}. Nothing was sent.`,
      };
    }

    return { delivered: true, channel: 'telegram', detail: 'Delivered to Telegram.' };
  } catch (error) {
    console.error('[zyron] telegram dispatch failed', error);
    return {
      delivered: false,
      channel: 'telegram',
      detail: 'Telegram did not respond. Nothing was sent.',
    };
  }
}

/** Telegram's HTML mode is strict: unescaped angle brackets break the message. */
function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatTelegram(p: DispatchPayload) {
  return [
    `<b>ZYRON · ${escapeHtml(p.moduleCode)}</b>`,
    `<i>${escapeHtml(p.moduleName)}</i>`,
    '',
    `<b>Action</b>  ${escapeHtml(p.action)}`,
    `<b>To</b>  ${escapeHtml(p.target)}`,
    '',
    escapeHtml(p.body),
    '',
    `<code>approved ${new Date(p.decidedAt).toISOString()}</code>`,
  ].join('\n');
}

/* ───────────────────────────── Utilities ───────────────────────────── */

/**
 * A hanging connector must not hang the request. AbortSignal.timeout is not
 * available on every runtime this may land on, so the controller is explicit.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
