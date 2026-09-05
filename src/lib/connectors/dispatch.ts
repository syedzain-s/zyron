/**
 * Outbound dispatch — the only place in ZYRON that talks to the outside world.
 *
 * Nothing calls this except the approvals route, and the approvals route only
 * calls it after the user has tapped approve. That is the entire safety model
 * in one sentence, and keeping it in one file is what makes it auditable.
 *
 * Two channels, tried in order:
 *
 *   1. n8n webhook — the real integration layer. n8n holds the Google OAuth
 *      credentials, handles token refresh, retries and rate limits, and fans
 *      the action out to Gmail, Calendar, Sheets or anything else. Adding a
 *      connector becomes a change in n8n, not a change in this codebase.
 *
 *   2. Telegram Bot API — a direct fallback with no OAuth at all. Useful when
 *      n8n is not running, and honest enough to demo: an approved message
 *      genuinely lands on a real phone.
 *
 * With neither configured the dispatcher reports `simulated` and says so. It
 * never claims something was sent when it was not.
 */

export type Channel = 'n8n' | 'telegram' | 'simulated';

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
}

const TIMEOUT_MS = 12_000;

export function configuredChannel(): Channel {
  if (process.env.N8N_WEBHOOK_URL) return 'n8n';
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) return 'telegram';
  return 'simulated';
}

export async function dispatchApproval(payload: DispatchPayload): Promise<DispatchResult> {
  const channel = configuredChannel();

  if (channel === 'n8n') {
    const result = await sendToN8n(payload);
    // A dead workflow should not silently swallow an approved action, so fall
    // through to Telegram if it is available.
    if (!result.delivered && process.env.TELEGRAM_BOT_TOKEN) {
      const fallback = await sendToTelegram(payload);
      if (fallback.delivered) {
        return { ...fallback, detail: `${fallback.detail} (n8n was unreachable)` };
      }
    }
    return result;
  }

  if (channel === 'telegram') return sendToTelegram(payload);

  return {
    delivered: false,
    channel: 'simulated',
    detail: 'Recorded as approved. No delivery channel is configured, so nothing left the system.',
  };
}

/* ─────────────────────────────── n8n ─────────────────────────────── */

async function sendToN8n(payload: DispatchPayload): Promise<DispatchResult> {
  const url = process.env.N8N_WEBHOOK_URL!;
  const secret = process.env.N8N_WEBHOOK_SECRET;

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // n8n's Header Auth credential checks this. Without it, anyone who
        // learns the webhook URL can make the workflow send mail as you.
        ...(secret ? { 'x-zyron-secret': secret } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[zyron] n8n rejected the dispatch', res.status, text.slice(0, 300));
      return {
        delivered: false,
        channel: 'n8n',
        detail: `The workflow answered ${res.status}. Nothing was sent — check the n8n execution log.`,
      };
    }

    // n8n may answer with anything; a JSON body is a convenience, not a contract.
    const data = (await res.json().catch(() => null)) as { message?: string } | null;

    return {
      delivered: true,
      channel: 'n8n',
      detail: data?.message ?? 'Dispatched through n8n.',
    };
  } catch (error) {
    console.error('[zyron] n8n dispatch failed', error);
    return {
      delivered: false,
      channel: 'n8n',
      detail: 'The n8n workflow did not respond. Nothing was sent.',
    };
  }
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
