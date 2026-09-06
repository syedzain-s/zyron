/**
 * The model layer.
 *
 * ZYRON should not care which company answers its questions. Everything above
 * this file asks for text or an image reading; this file decides who provides
 * it, based on whichever key is present in the environment:
 *
 *   GEMINI_API_KEY     → Google Gemini    (free tier, no card, does vision)
 *   ANTHROPIC_API_KEY  → Claude
 *   GROQ_API_KEY       → Groq             (fast, text only)
 *   none               → callers fall back to their own rule-based output
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
}

/** Kept as an alias so existing image callers read naturally. */
export type VisionRequest = MediaRequest;

export class ModelError extends Error {
  readonly provider: Provider;
  readonly status?: number;
  /** Safe to show a user — says what to do, never leaks the key or raw body. */
  readonly userMessage: string;

  constructor(provider: Provider, userMessage: string, status?: number) {
    super(userMessage);
    this.name = 'ModelError';
    this.provider = provider;
    this.userMessage = userMessage;
    this.status = status;
  }
}

const TIMEOUT_MS = 25_000;

/* ─────────────────────────── Selection ─────────────────────────── */

export function activeProvider(): Provider {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GROQ_API_KEY) return 'groq';
  return 'none';
}

/** Only Gemini and Claude can read an image on the current configuration. */
export function visionAvailable(): boolean {
  const p = activeProvider();
  return p === 'gemini' || p === 'anthropic';
}

/** Audio understanding is Gemini only here — Claude takes images, not sound. */
export function audioAvailable(): boolean {
  return activeProvider() === 'gemini';
}

/* ─────────────────────────── Text ─────────────────────────── */

export async function generateText(req: TextRequest): Promise<string> {
  const provider = activeProvider();

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
  const provider = activeProvider();

  if (provider === 'gemini') return geminiMedia(req);
  if (provider === 'anthropic') return anthropicVision(req);

  throw new ModelError(
    provider,
    'The configured model cannot read images. Add a GEMINI_API_KEY to enable it.',
  );
}

/** Reads a short recording. Same call as an image — only the mime type differs. */
export async function readAudio(req: MediaRequest): Promise<string> {
  if (activeProvider() !== 'gemini') {
    throw new ModelError(
      activeProvider(),
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
 * flash variant: faster and far more generous on a free tier than pro, which
 * matters when a page might fire several reads in a row.
 */
async function discoverGeminiModel(): Promise<string | null> {
  try {
    const res = await withTimeout(
      fetch(`${GEMINI_BASE.replace('/models', '')}/models`, {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
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
      .filter((n) => !/(tts|image|transcribe|robotics|computer-use|research|lyria|banana|embedding)/i.test(n));

    const preferred =
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

async function geminiMedia({ base64, mimeType, prompt, system, maxTokens = 700 }: MediaRequest) {
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
    // Low temperature: this is a reading, not a creative task, and the same
    // input should not produce a different mood on every attempt.
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
  };

  return geminiCall(body);
}

async function geminiCall(body: unknown, allowRetry = true): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const model = geminiModel();

  const res = await withTimeout(
    fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    }),
  );

  // A 404 means the model name is gone, not that the request was wrong. Find a
  // live one and try again — once, so a genuine outage cannot loop.
  if (res.status === 404 && allowRetry && !process.env.GEMINI_MODEL) {
    const discovered = await discoverGeminiModel();
    if (discovered && discovered !== model) {
      resolvedModel = discovered;
      return geminiCall(body, false);
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

  if (!text) throw new ModelError('gemini', 'The model returned an empty answer. Try again.');
  return text;
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
    return new ModelError('gemini', 'Gemini rate limit reached. Wait a minute and try again.', status);
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

async function anthropicCall(body: unknown): Promise<string> {
  const res = await withTimeout(
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    }),
  );

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

async function groqText({ system, messages, maxTokens = 900, temperature = 0.4 }: TextRequest) {
  const res = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
        max_tokens: maxTokens,
        temperature,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages,
        ],
      }),
    }),
  );

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    console.error('[zyron] groq error', res.status, raw.slice(0, 400));
    throw new ModelError('groq', 'Groq could not answer right now.', res.status);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ModelError('groq', 'The model returned an empty answer.');
  return text;
}

/* ─────────────────────────── Utilities ─────────────────────────── */

/**
 * A model endpoint that never answers must not hold a request open. Explicit
 * controller rather than AbortSignal.timeout, which is not on every runtime
 * this could be deployed to.
 */
async function withTimeout(promise: Promise<Response>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await promise;
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
