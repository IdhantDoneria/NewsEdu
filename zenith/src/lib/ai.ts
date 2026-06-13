// ─── Zenith AI — provider client with streaming (Gemini / OpenAI-compatible) ──
//
// streamCompletion() reads the active provider from settings, streams tokens via
// onToken(fullTextSoFar) and resolves with the final text. Aborting the signal
// resolves with whatever was streamed so far (it never throws on user-stop).
// All failures are mapped to friendly AIError messages — never raw.

import { useStore } from './store';
import type { Settings } from './types';

export interface StreamOptions {
  system?: string;
  prompt: string;
  signal: AbortSignal;
  /** called with the FULL accumulated text after each chunk */
  onToken: (full: string) => void;
}

/** User-displayable AI failure. streamCompletion never throws anything else. */
export class AIError extends Error {}

export const GEMINI_MODELS: readonly string[] = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey';

// ─── key / model resolution ──────────────────────────────────────────────────

function envGeminiKey(): string | undefined {
  try {
    return (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;
  } catch {
    return undefined;
  }
}

function resolveGeminiKey(s: Settings): string {
  return (s.geminiKey || envGeminiKey() || '').trim();
}

export function hasAIKey(): boolean {
  const s = useStore.getState().settings;
  return s.aiProvider === 'openai' ? !!(s.openaiKey ?? '').trim() : !!resolveGeminiKey(s);
}

/** model name currently in use, for status messages */
export function aiModelLabel(): string {
  const s = useStore.getState().settings;
  return s.aiProvider === 'openai'
    ? (s.openaiModel ?? '').trim() || DEFAULT_OPENAI_MODEL
    : (s.geminiModel ?? '').trim() || DEFAULT_GEMINI_MODEL;
}

// ─── error mapping ───────────────────────────────────────────────────────────

function friendly(status: number, detail = ''): AIError {
  if (status === 400 || status === 401 || status === 403) {
    return new AIError('Check your API key — the provider rejected this request.');
  }
  if (status === 404) {
    return new AIError('Model not found — check the model name (and base URL) in AI settings.');
  }
  if (status === 429) {
    return new AIError('Rate limited — free tier quota; try again in a minute.');
  }
  if (status >= 500) {
    return new AIError('The AI service is having a moment — try again shortly.');
  }
  const extra = detail ? ` — ${detail.slice(0, 140)}` : '';
  return new AIError(`AI request failed${status ? ` (HTTP ${status})` : ''}${extra}`);
}

async function httpError(res: Response): Promise<AIError> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = String(j?.error?.message ?? j?.message ?? '');
    } catch {
      detail = text.slice(0, 200);
    }
  } catch { /* unreadable body */ }
  return friendly(res.status, detail);
}

function toFriendly(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof TypeError) {
    return new AIError("Couldn't reach the AI service — you appear to be offline. Check your connection.");
  }
  if (err instanceof Error && err.name === 'AbortError') return new AIError('Stopped.');
  return new AIError(err instanceof Error ? `AI request failed — ${err.message}` : 'AI request failed.');
}

// ─── SSE reader (both providers send `data: {json}` lines) ───────────────────

async function readSSE(res: Response, onData: (json: any) => void): Promise<void> {
  const handleLine = (raw: string) => {
    const line = raw.trim();
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let json: any;
    try {
      json = JSON.parse(payload);
    } catch {
      return; // ignore malformed / partial keep-alives
    }
    onData(json);
  };

  let buf = '';
  const feed = (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      handleLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  };

  if (!res.body) {
    feed(await res.text());
    handleLine(buf);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      feed(decoder.decode(value, { stream: true }));
    }
    feed(decoder.decode());
    handleLine(buf); // trailing line without newline
  } catch (e) {
    try { void reader.cancel(); } catch { /* already closed */ }
    throw e;
  }
}

// ─── providers ───────────────────────────────────────────────────────────────

async function streamGemini(s: Settings, opts: StreamOptions, acc: { text: string }): Promise<void> {
  const key = resolveGeminiKey(s);
  if (!key) throw new AIError('No Gemini API key configured — add one in Settings → Zenith AI.');
  const model = (((s.geminiModel ?? '').trim()) || DEFAULT_GEMINI_MODEL).replace(/^models\//, '');
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: { temperature: 0.7 },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw await httpError(res);

  await readSSE(res, (json) => {
    if (json?.error) throw friendly(Number(json.error.code) || 0, String(json.error.message ?? ''));
    const parts = json?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      let grew = false;
      for (const p of parts) {
        if (typeof p?.text === 'string' && p.text) { acc.text += p.text; grew = true; }
      }
      if (grew) opts.onToken(acc.text);
    }
  });
}

async function streamOpenAI(s: Settings, opts: StreamOptions, acc: { text: string }): Promise<void> {
  const key = (s.openaiKey ?? '').trim();
  if (!key) throw new AIError('No API key configured — add one in Settings → Zenith AI.');
  const base = ((s.openaiBase ?? '').trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = (s.openaiModel ?? '').trim() || DEFAULT_OPENAI_MODEL;

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.prompt });

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 }),
    signal: opts.signal,
  });
  if (!res.ok) throw await httpError(res);

  await readSSE(res, (json) => {
    if (json?.error) throw friendly(Number(json.error.code) || 0, String(json.error.message ?? ''));
    const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.text;
    if (typeof delta === 'string' && delta) {
      acc.text += delta;
      opts.onToken(acc.text);
    }
  });
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Stream a completion from the configured provider.
 * Resolves with the final text; if the signal aborts mid-stream, resolves with
 * the partial text instead of throwing. Other failures throw friendly AIErrors.
 */
export async function streamCompletion(opts: StreamOptions): Promise<string> {
  const s = useStore.getState().settings;
  const acc = { text: '' };
  try {
    if (s.aiProvider === 'openai') await streamOpenAI(s, opts, acc);
    else await streamGemini(s, opts, acc);
  } catch (err) {
    if (opts.signal.aborted) return acc.text; // user pressed Stop — keep partial
    throw toFriendly(err);
  }
  if (!opts.signal.aborted && !acc.text.trim()) {
    throw new AIError('The model returned an empty response — try again, or switch models.');
  }
  return acc.text;
}

/** Fire a tiny prompt to verify key + model. 10s timeout. Never throws. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  if (!hasAIKey()) return { ok: false, message: 'Add an API key first.' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const text = await streamCompletion({
      prompt: 'Reply with exactly one word: ready',
      signal: ctrl.signal,
      onToken: () => {},
    });
    if (!text.trim()) {
      return { ok: false, message: 'Timed out after 10s — check your network, key and model.' };
    }
    return { ok: true, message: `Connected — ${aiModelLabel()} responded.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Connection failed.' };
  } finally {
    clearTimeout(timer);
  }
}
