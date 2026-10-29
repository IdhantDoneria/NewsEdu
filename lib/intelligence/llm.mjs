/**
 * One entry point for every JSON model call in the app.
 *
 * Providers are tried in order: the Gemini models first, then OpenRouter. Any
 * failure moves on to the next, so a retired model (404), an exhausted quota
 * (429) or an overloaded one (503) degrades to the next model instead of
 * failing the feature. A failed model is skipped for a while (cooldown) so a
 * quota-limited key isn't retried on every request. Every failure is logged.
 *
 * GEMINI_CHAT_MODEL, if set, is tried first.
 */

import { hasGeminiKey, generateJson } from './ai.mjs';
import { hasOpenRouterKey, openRouterJson, openRouterModels } from './openrouter.mjs';
import { timedModelCall } from './metrics.mjs';

const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];
// How long a failed model is skipped, so a quota-limited key isn't hammered.
const COOLDOWN_MS = { 404: 10 * 60_000, 429: 60_000, 503: 15_000 };
const cooldown = new Map(); // "provider:model" -> timestamp

/** True when at least one provider is configured. */
export function hasAnyModel() {
  return hasGeminiKey() || hasOpenRouterKey();
}

function candidates() {
  const gemini = hasGeminiKey()
    ? [process.env.GEMINI_CHAT_MODEL, ...DEFAULT_GEMINI_MODELS]
        .filter((m, i, all) => m && all.indexOf(m) === i)
        .map((model) => ({
          provider: 'gemini',
          model,
          // Structured JSON answers don't need the 2.5 models' hidden reasoning
          // pass, which is most of their latency.
          call: (prompt) => generateJson(prompt, model, { noThinking: true }),
        }))
    : [];
  const router = hasOpenRouterKey()
    ? openRouterModels().map((model) => ({
        provider: 'openrouter',
        model,
        call: (prompt) => openRouterJson(prompt, model),
      }))
    : [];
  return [...gemini, ...router];
}

function cooldownFor(msg) {
  const code = /\b(404|429|503)\b/.exec(msg)?.[1];
  return COOLDOWN_MS[code] || 0;
}

/**
 * One model call across the provider chain.
 * Returns { raw, provider, model }; on total failure throws an error whose
 * message joins every attempt's error.
 */
export async function callModel(prompt, { label = 'llm' } = {}) {
  const errors = [];
  for (const c of candidates()) {
    const key = `${c.provider}:${c.model}`;
    if ((cooldown.get(key) || 0) > Date.now()) continue;
    try {
      const raw = await timedModelCall(() => c.call(prompt));
      return { raw, provider: c.provider, model: c.model };
    } catch (err) {
      const msg = String(err?.message || err).slice(0, 200);
      errors.push(msg);
      const wait = cooldownFor(msg);
      if (wait) cooldown.set(key, Date.now() + wait);
      console.error(`[${label}] ${key} failed: ${msg}`);
    }
  }
  throw new Error(errors.join(' | ') || 'every model is cooling down after recent failures');
}
