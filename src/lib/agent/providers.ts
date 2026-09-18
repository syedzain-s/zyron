/**
 * The model layer.
 *
 * ZYRON should not care which company answers its questions. Everything above
 * this file asks for text or an image reading; this file decides who provides
 * it, based on whichever keys are present in the environment.
 *
 * Text and media are assigned separately, on purpose. A free tier is a single
 * per-minute bucket, and when one provider carries both the briefing and the
 * camera the camera empties the bucket the briefing needed. Two providers is
 * two buckets.
 *
 *   TEXT   → GROQ_API_KEY (fast, generous free tier)
 *            else ANTHROPIC_API_KEY, else GEMINI_API_KEY
 *   MEDIA  → GEMINI_API_KEY (image and audio)
 *            else ANTHROPIC_API_KEY (image only)
 *   none   → callers fall back to their own rule-based output
 *
 * Written against each provider's REST endpoint rather than its SDK. Three
 * SDKs for three providers is three dependency trees and three sets of
 * breaking changes; the request shapes here are small enough to own.
 */

export type Provider = 'gemini' | 'anthropic' | 'groq' | 'none';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TextRequest {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** 0 = repeatable, 1 = loose. Analysis work should stay low. */
  temperature?: number;
}

/**
 * One shape for both image and audio. Gemini and Claude both take media as an
 * inline base64 blob with a mime type, so there is no reason to have two
 * near-identical request types and two near-identical code paths.
 */
export interface MediaRequest {
  /** Raw base64, without the `data:image/...;base64,` prefix. */
  base64: string;
  mimeType: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  /** Ask the provider to guarantee valid JSON rather than hoping for it. */
  json?: boolean;
}

/** Kept as an alias so existing image callers read naturally. */
export type VisionRequest = MediaRequest;

export class ModelError extends Error {
  readonly provider: Provider;
  readonly status?: number;
  /** Safe to show a user — says what to do, never leaks the key or raw body. */
  readonly userMessage: string;
  /** True when waiting would not help: the daily allowance is gone. */
  readonly exhausted: boolean;

  constructor(provider: Provider, userMessage: string, status?: number, exhausted = false) {
    super(userMessage);
    this.name = 'ModelError';
    this.provider = provider;
    this.userMessage = userMessage;
    this.status = status;
    this.exhausted = exhausted;
  }
}

const TIMEOUT_MS = 25_000;

/**
 * How hard to try again when the provider says "not right now".
 *
 * A free tier is limited per minute as well as per day, and the per-minute
 * limit is the one that fires during a demonstration: two or three requests in
 * quick succession is enough. Waiting a second and asking again clears it. The
 * daily limit is different — no amount of waiting helps inside one sitting —
 * so the two are told apart and only the first is retried.
 */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────── Selection ─────────────────────────── */

/** Who writes prose. Groq first: it is the fastest and its free allowance is the largest. */
export function textProvider(): Provider {
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'none';
}

/** Who reads an image or a recording. Gemini first: it is the only one here that hears. */
export function mediaProvider(): Provider {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

/**
 * Kept for callers that ask "is any model configured at all". Answers with the
 * text provider, since text is what most of the app needs.
 */
export function activeProvider(): Provider {
  return textProvider();
}

/** Human-readable name for error messages, so "Gemini unavailable" is not shown when Groq failed. */
export function providerLabel(p: Provider): string {
  return p === 'gemini' ? 'Gemini' : p === 'anthropic' ? 'Claude' : p === 'groq' ? 'Groq' : 'the model';
}

/** Only Gemini and Claude can read an image on the current configuration. */
export function visionAvailable(): boolean {
  return mediaProvider() !== 'none';
}

/** Audio understanding is Gemini only here — Claude takes images, not sound. */
export function audioAvailable(): boolean {
  return mediaProvider() === 'gemini';
}

/* ─────────────────────────── Text ─────────────────────────── */

export async function generateText(req: TextRequest): Promise<string> {
  const provider = textProvider();

  switch (provider) {
    case 'gemini':
      return geminiText(req);
    case 'anthropic':
      return anthropicText(req);
    case 'groq':
      return groqText(req);
    default:
      throw new ModelError('none', 'No model key is configured.');
  }
}

export async function readImage(req: MediaRequest): Promise<string> {
  const provider = mediaProvider();

  if (provider === 'gemini') return geminiMedia(req);
  if (provider === 'anthropic') return anthropicVision(req);

  throw new ModelError(
    provider,
    'No configured model can read images. Add a GEMINI_API_KEY to enable it.',
  );
}

/** Reads a short recording. Same call as an image — only the mime type differs. */
export async function readAudio(req: MediaRequest): Promise<string> {
  if (mediaProvider() !== 'gemini') {
    throw new ModelError(
      mediaProvider(),
      'Voice check-in needs a GEMINI_API_KEY. Use the camera or pick your mood instead.',
    );
  }
  return geminiMedia(req);
}

/* ─────────────────────────── Gemini ─────────────────────────── */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Model names retire faster than anything else here, and a hard-coded default
 * turns into a 404 the day Google moves on. So this resolves in three steps:
 *
 *   1. GEMINI_MODEL from the environment, if set — an explicit choice wins.
 *   2. Otherwise a "-latest" alias, which Google keeps pointed at a current
 *      model, so it survives most retirements on its own.
 *   3. If even that 404s, ask the API which models this key can actually use
 *      and pick one. The answer is cached for the process lifetime.
 *
 * The result is that a retirement costs one slow request, not a broken app and
 * an evening of debugging.
 */
const FALLBACK_MODEL = 'gemini-flash-latest';

/** Discovered at runtime after a 404. Null means not needed yet. */
let resolvedModel: string | null = null;

const geminiModel = () => process.env.GEMINI_MODEL ?? resolvedModel ?? FALLBACK_MODEL;

/**
 * Asks the API for models this key can call, and picks the best fit. Prefers a
 * flash-lite or flash variant: faster and far more generous on a free tier than
 * pro, which matters when a page might fire several reads in a row.
 */
async function discoverGeminiModel(): Promise<string | null> {
  try {
    const res = await withTimeout((signal) =>
      fetch(`${GEMINI_BASE.replace('/models', '')}/models`, {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
        signal,
      }),
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };

    const usable = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      // Image, audio, TTS and research variants answer a different question.
      .filter((n) => !/(tts|image|transcribe|robotics|computer-use|research|lyria|banana|embedding|antigravity|omni)/i.test(n));

    const preferred =
      // Flash-Lite carries the largest free daily allowance, so it is tried
      // first — the limit, not the capability, is what breaks a demonstration.
      usable.find((n) => /flash-lite/.test(n)) ??
      usable.find((n) => n === 'gemini-flash-latest') ??
      usable.find((n) => /flash$/.test(n) && !/lite/.test(n)) ??
      usable.find((n) => /flash/.test(n)) ??
      usable[0];

    if (preferred) {
      console.warn(`[zyron] gemini: falling back to "${preferred}"`);
      return preferred;
    }
    return null;
  } catch (error) {
    console.error('[zyron] gemini model discovery failed', error);
    return null;
  }
}

async function geminiText({ system, messages, maxTokens = 900, temperature = 0.4 }: TextRequest) {
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    // Gemini calls the assistant "model", not "assistant".
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };

  return geminiCall(body);
}

async function geminiMedia({
  base64,
  mimeType,
  prompt,
  system,
  // Newer Gemini models reason before answering and charge that reasoning
  // against the same output budget, so the media budget is generous: a tight
  // one surfaces as a truncated, unparseable answer rather than as a limit.
  maxTokens = 2400,
  json,
}: MediaRequest) {
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      // Low temperature: this is a reading, not a creative task, and the same
      // input should not produce a different mood on every attempt.
      temperature: 0.2,
      // Thinking cannot be switched off on the models "-latest" now points at
      // (thinkingBudget: 0 was rejected outright, and took every camera and
      // voice check-in down with it), but it can be turned down. A mood read
      // does not need deliberation, and "low" cuts several seconds off each
      // capture. If a model rejects this field too, the retry net below
      // strips it and sends again.
      thinkingConfig: { thinkingLevel: 'low' },
      //
      // Asking for JSON is more reliable than asking politely in the prompt:
      // it removes markdown fences and preamble at the source.
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  return geminiCall(body);
}

async function geminiCall(body: unknown, allowRetry = true, attempt = 0): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const model = geminiModel();

  const res = await withTimeout((signal) =>
    fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal,
    }),
  );

  // Some models reject generationConfig fields the others accept. Strip the
  // optional ones and try again rather than failing on a config detail.
  //
  // The match is deliberately broad. Google's wording for these errors changes
  // between models ("thinking_budget", "Budget 0 is invalid", "response mime
  // type is not supported") and a net that only catches one phrasing lets the
  // next one through as a hard failure.
  if (res.status === 400 && allowRetry) {
    const detail = await res.clone().text().catch(() => '');
    if (/thinking|budget|responseMimeType|response_mime_type|mime type|generationConfig|generation_config/i.test(detail)) {
      console.warn('[zyron] gemini: retrying without optional generationConfig');
      const plain = JSON.parse(JSON.stringify(body)) as {
        generationConfig?: Record<string, unknown>;
      };
      if (plain.generationConfig) {
        delete plain.generationConfig.thinkingConfig;
        delete plain.generationConfig.responseMimeType;
      }
      return geminiCall(plain, false);
    }
  }

  // A 404 means the model name is gone, not that the request was wrong. Find a
  // live one and try again — once, so a genuine outage cannot loop.
  if (res.status === 404 && allowRetry && !process.env.GEMINI_MODEL) {
    const discovered = await discoverGeminiModel();
    if (discovered && discovered !== model) {
      resolvedModel = discovered;
      return geminiCall(body, false, attempt);
    }
  }

  // 429 and 503 mean "not now", not "no". The per-minute allowance on a free
  // tier is small enough that two check-ins in a row can trip it, and waiting
  // a second clears it — so the request is repeated rather than surfaced as a
  // failure the user has to work around.
  //
  // The daily allowance is the exception: it does not come back inside a
  // sitting, so retrying only makes the user wait before seeing the same
  // message. `isDailyQuota` tells the two apart from the response body.
  if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
    const raw = await res.clone().text().catch(() => '');
    if (!isDailyQuota(raw)) {
      const wait = retryDelay(res, attempt);
      console.warn(
        `[zyron] gemini ${res.status}: retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(wait);
      return geminiCall(body, allowRetry, attempt + 1);
    }
  }

  if (!res.ok) throw geminiError(res.status, await res.text().catch(() => ''));

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new ModelError('gemini', 'The model declined to answer that request.');
  }

  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!text) {
    const reason = data.candidates?.[0]?.finishReason;
    console.error('[zyron] gemini returned no text. finishReason:', reason);
    throw new ModelError(
      'gemini',
      reason === 'MAX_TOKENS'
        ? 'The model ran out of room before answering. Try again.'
        : 'The model returned an empty answer. Try again.',
    );
  }
  return text;
}

/** A per-day allowance is gone for the day; a per-minute one is not. */
function isDailyQuota(raw: string): boolean {
  return /per\s*day|PerDay|_per_day|free_tier_requests|GenerateRequestsPerDay/i.test(raw);
}

/**
 * How long to wait before asking again.
 *
 * Google sends a `RetryInfo` block with its own suggested delay; that is
 * always better than a guess, so it wins when present. Otherwise the wait
 * doubles each attempt, with a little randomness so several requests that
 * failed together do not all come back at the same instant.
 */
function retryDelay(res: Response, attempt: number): number {
  const header = res.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 8_000);
  }
  const backoff = BASE_DELAY_MS * 2 ** attempt;
  return Math.min(backoff + Math.random() * 400, 8_000);
}

function geminiError(status: number, raw: string) {
  console.error('[zyron] gemini error', status, raw.slice(0, 400));

  if (status === 400 && raw.includes('API_KEY_INVALID')) {
    return new ModelError('gemini', 'That Gemini key is not valid. Check GEMINI_API_KEY.', status);
  }
  if (status === 403) {
    return new ModelError('gemini', 'Gemini refused the key. Check it is enabled in AI Studio.', status);
  }
  if (status === 404) {
    return new ModelError(
      'gemini',
      `No usable Gemini model was found for this key. Set GEMINI_MODEL in .env.local — "gemini-flash-latest" is a safe choice.`,
      status,
    );
  }
  if (status === 429) {
    // Two very different situations behind one status code, and telling the
    // user the wrong one sends them to wait for something that is not coming.
    return isDailyQuota(raw)
      ? new ModelError(
          'gemini',
          "Today's free Gemini allowance is used up. Everything else still works — the reading below was written from your own data.",
          status,
          true,
        )
      : new ModelError(
          'gemini',
          'Gemini is busy right now. Give it a few seconds and try again.',
          status,
        );
  }
  if (status === 503) {
    return new ModelError(
      'gemini',
      'Gemini is overloaded at the moment. Wait a few seconds and try again — nothing is wrong on your side.',
      status,
    );
  }
  if (status === 400) {
    return new ModelError(
      'gemini',
      'Gemini rejected that capture. Try again, or use one of the other check-in options.',
      status,
    );
  }
  return new ModelError('gemini', 'Gemini could not answer right now.', status);
}

/* ─────────────────────────── Anthropic ─────────────────────────── */

const anthropicModel = () => process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

async function anthropicText({ system, messages, maxTokens = 900, temperature = 0.4 }: TextRequest) {
  return anthropicCall({
    model: anthropicModel(),
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

async function anthropicVision({ base64, mimeType, prompt, system, maxTokens = 700 }: MediaRequest) {
  return anthropicCall({
    model: anthropicModel(),
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
}

async function anthropicCall(body: unknown, attempt = 0): Promise<string> {
  const res = await withTimeout((signal) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal,
    }),
  );

  if ((res.status === 429 || res.status === 529) && attempt < MAX_RETRIES) {
    const wait = retryDelay(res, attempt);
    console.warn(`[zyron] anthropic ${res.status}: retrying in ${wait}ms`);
    await sleep(wait);
    return anthropicCall(body, attempt + 1);
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    console.error('[zyron] anthropic error', res.status, raw.slice(0, 400));
    if (res.status === 401) {
      throw new ModelError('anthropic', 'That Anthropic key is not valid.', 401);
    }
    if (res.status === 429) {
      throw new ModelError('anthropic', 'Rate limit reached. Wait a moment and try again.', 429);
    }
    throw new ModelError('anthropic', 'Claude could not answer right now.', res.status);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
    .trim();

  if (!text) throw new ModelError('anthropic', 'The model returned an empty answer.');
  return text;
}

/* ─────────────────────────── Groq ─────────────────────────── */

/**
 * Same story as Gemini: model names retire, so an explicit GROQ_MODEL wins,
 * then a sensible default, and if that comes back "not found" the account's
 * own model list is consulted once and the answer cached.
 */
const GROQ_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
let resolvedGroqModel: string | null = null;
const groqModel = () => process.env.GROQ_MODEL ?? resolvedGroqModel ?? GROQ_FALLBACK_MODEL;

async function discoverGroqModel(): Promise<string | null> {
  try {
    const res = await withTimeout((signal) =>
      fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        signal,
      }),
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (data.data ?? [])
      .map((m) => m.id ?? '')
      .filter(Boolean)
      // Speech, safety and TTS models answer a different question.
      .filter((id) => !/(whisper|guard|tts|orpheus|playai|embed)/i.test(id));

    const preferred =
      ids.find((id) => /llama-3\.3-70b/i.test(id)) ??
      ids.find((id) => /llama.*70b/i.test(id)) ??
      ids.find((id) => /llama-4|qwen|deepseek|kimi|gpt-oss/i.test(id)) ??
      ids.find((id) => /llama/i.test(id)) ??
      ids[0];

    if (preferred) {
      console.warn(`[zyron] groq: falling back to "${preferred}"`);
      return preferred;
    }
    return null;
  } catch (error) {
    console.error('[zyron] groq model discovery failed', error);
    return null;
  }
}

async function groqText(
  { system, messages, maxTokens = 900, temperature = 0.4 }: TextRequest,
  attempt = 0,
  allowDiscovery = true,
): Promise<string> {
  const model = groqModel();
  const res = await withTimeout((signal) =>
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages,
        ],
      }),
      signal,
    }),
  );

  // A retired model comes back as 404, or as 400 with "model … does not exist"
  // or "decommissioned". Either way: ask what is live and try once more.
  if ((res.status === 404 || res.status === 400) && allowDiscovery && !process.env.GROQ_MODEL) {
    const raw = await res.clone().text().catch(() => '');
    if (res.status === 404 || /model|decommission|deprecat/i.test(raw)) {
      const discovered = await discoverGroqModel();
      if (discovered && discovered !== model) {
        resolvedGroqModel = discovered;
        return groqText({ system, messages, maxTokens, temperature }, attempt, false);
      }
    }
  }

  if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
    const wait = retryDelay(res, attempt);
    console.warn(`[zyron] groq ${res.status}: retrying in ${wait}ms`);
    await sleep(wait);
    return groqText({ system, messages, maxTokens, temperature }, attempt + 1, allowDiscovery);
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    console.error('[zyron] groq error', res.status, raw.slice(0, 400));
    if (res.status === 401) throw new ModelError('groq', 'That Groq key is not valid. Check GROQ_API_KEY.', 401);
    if (res.status === 429) {
      const daily = /per day|daily|tokens per day|TPD|RPD/i.test(raw);
      throw new ModelError(
        'groq',
        daily
          ? "Today's free Groq allowance is used up."
          : 'Groq is busy right now. Give it a few seconds and try again.',
        429,
        daily,
      );
    }
    if (res.status === 404) {
      throw new ModelError('groq', 'No usable Groq model was found. Set GROQ_MODEL in .env.local.', 404);
    }
    throw new ModelError('groq', 'Groq could not answer right now.', res.status);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ModelError('groq', 'The model returned an empty answer.');
  return text;
}

/* ─────────────────────────── Utilities ─────────────────────────── */

/**
 * A model endpoint that never answers must not hold a request open.
 *
 * The previous version built an AbortController and then never handed its
 * signal to `fetch`, so the timer fired into nothing and a hung request stayed
 * open until the platform gave up on it. The signal is now passed in, which
 * means callers receive the factory rather than an already-started promise.
 *
 * Explicit controller rather than AbortSignal.timeout, which is not on every
 * runtime this could be deployed to.
 */
async function withTimeout(make: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await make(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Splits a data URL into its mime type and its payload.
 *
 * The first version of this assumed the mime type held no semicolons, which is
 * wrong the moment a browser records audio: MediaRecorder produces
 * `data:audio/webm;codecs=opus;base64,…`, the pattern failed to match, and the
 * entire prefix was forwarded to the API as if it were base64. The provider
 * then rejected it with "Base64 decoding failed", which points at the payload
 * and not at the parsing bug that actually caused it.
 *
 * So: split on the last `;base64,` and drop any codec parameters, because
 * providers want the bare type.
 */
export function stripDataUrl(value: string): { data: string; mimeType: string | null } {
  const marker = ';base64,';
  const at = value.indexOf(marker);

  if (!value.startsWith('data:') || at === -1) {
    return { mimeType: null, data: value.trim() };
  }

  const declared = value.slice('data:'.length, at);
  // `audio/webm;codecs=opus` -> `audio/webm`
  const mimeType = declared.split(';')[0].trim() || null;
  const data = value.slice(at + marker.length).trim();

  return { mimeType, data };
}
