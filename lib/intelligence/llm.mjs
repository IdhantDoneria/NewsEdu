/**
 * One entry point for every JSON model call in the app.
 *
 * Providers are tried in order: the Gemini models first, then OpenRouter. Any
 * failure moves on to the next, so a retired model (404), an exhausted quota
 * (429), an overloaded one (503), a hung connection (timeout) or malformed JSON
 * degrades to the next model instead of failing the feature. A failed model is
 * skipped for a while (cooldown) so a quota-limited key isn't retried on every
 * request. Every failure is logged.
 *
 * Time is bounded two ways: each attempt has its own timeout (and an
 * AbortSignal that really cancels the HTTP request), and the whole chain shares
 * one deadline, so N slow models can never add up to N x timeout. Defaults per
 * label are in PROFILES (chat 25 s total / 12 s per call, intel 40 s / 20 s).
 *
 * GEMINI_CHAT_MODEL, if set, is tried first.
 */

import { hasGeminiKey, generateJson, combineSignals } from './ai.mjs';
import { hasOpenRouterKey, openRouterJson, openRouterModels } from './openrouter.mjs';
import { timedModelCall } from './metrics.mjs';

const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];

/** Time and output budgets per kind of call. */
export const PROFILES = {
  chat: { deadlineMs: 25_000, callMs: 12_000, maxTokens: 1500 },
  qa: { deadlineMs: 25_000, callMs: 12_000, maxTokens: 1800 },
  // Long structured analysis: gemini-2.5-flash needs 14-15 s for it.
  intel: { deadlineMs: 40_000, callMs: 20_000, maxTokens: 4096 },
  framing: { deadlineMs: 30_000, callMs: 15_000, maxTokens: 2000 },
  recall: { deadlineMs: 30_000, callMs: 15_000, maxTokens: 2000 },
  markets: { deadlineMs: 25_000, callMs: 12_000, maxTokens: 1200 },
  default: { deadlineMs: 25_000, callMs: 12_000, maxTokens: 1500 },
};

// Never start another model with less than this left on the shared deadline.
const MIN_ATTEMPT_MS = 2_000;

// How long a failed model is skipped, so a quota-limited key isn't hammered.
const COOLDOWN_MS = { 404: 10 * 60_000, 429: 60_000, 503: 15_000 };
const TIMEOUT_COOLDOWN_MS = 20_000;
// A model that keeps returning unparseable JSON for one kind of call is skipped
// for that kind of call (not for others) for a while.
const JSON_STREAK = 2;
const JSON_COOLDOWN_MS = 10 * 60_000;

const cooldown = new Map(); // "provider:model" or "provider:model|label" -> timestamp
const jsonFailures = new Map(); // "provider:model|label" -> consecutive malformed replies

let testModels = null;

/**
 * Replace the provider chain (tests): [{ provider, model, call(prompt, { signal, maxTokens }) }].
 * Pass null to restore the real chain.
 */
export function setTestModels(list) {
  testModels = Array.isArray(list) ? list : null;
}

/** Clear cooldowns and failure streaks (tests). */
export function resetLlmState() {
  cooldown.clear();
  jsonFailures.clear();
}

export function llmProfile(label) {
  return PROFILES[label] || PROFILES.default;
}

/** True when at least one provider is configured. */
export function hasAnyModel() {
  return Boolean(testModels?.length) || hasGeminiKey() || hasOpenRouterKey();
}

function candidates() {
  if (testModels) return testModels;
  const gemini = hasGeminiKey()
    ? [process.env.GEMINI_CHAT_MODEL, ...DEFAULT_GEMINI_MODELS]
        .filter((m, i, all) => m && all.indexOf(m) === i)
        .map((model) => ({
          provider: 'gemini',
          model,
          // Structured JSON answers don't need the 2.5 models' hidden reasoning
          // pass, which is most of their latency.
          call: (prompt, { signal, maxTokens } = {}) =>
            generateJson(prompt, model, { noThinking: true, signal, maxOutputTokens: maxTokens }),
        }))
    : [];
  const router = hasOpenRouterKey()
    ? openRouterModels().map((model) => ({
        provider: 'openrouter',
        model,
        call: (prompt, { signal, maxTokens } = {}) => openRouterJson(prompt, model, { signal, maxTokens }),
      }))
    : [];
  return [...gemini, ...router];
}

function cooldownFor(msg) {
  if (/timed out|timeout/i.test(msg)) return TIMEOUT_COOLDOWN_MS;
  const code = /\b(404|429|503)\b/.exec(msg)?.[1];
  return COOLDOWN_MS[code] || 0;
}

const isJsonError = (err) =>
  err?.invalid === true ||
  err instanceof SyntaxError ||
  /JSON|Unexpected (token|end)|Empty response/i.test(String(err?.message || ''));

/** Run one call with its own timeout, cancelling the request when it fires. */
async function attempt(c, prompt, { ms, maxTokens, signal }) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort(new Error('timed out'));
  }, ms);
  const sig = combineSignals(signal, ctrl.signal);
  try {
    return await new Promise((resolve, reject) => {
      sig.addEventListener(
        'abort',
        () => reject(timedOut ? new Error(`timed out after ${ms}ms`) : new Error('aborted')),
        { once: true }
      );
      timedModelCall(() => c.call(prompt, { signal: sig, maxTokens })).then(resolve, (err) =>
        reject(timedOut ? new Error(`timed out after ${ms}ms`) : err)
      );
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One model call across the provider chain.
 * Returns { raw, value, provider, model, ms }; on total failure throws an error whose
 * message joins every attempt's error.
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string} [opts.label]        selects the time/output profile
 * @param {number} [opts.deadlineMs]   shared deadline for the whole chain
 * @param {number} [opts.callMs]       per-model timeout
 * @param {number} [opts.maxTokens]    output cap passed to the provider
 * @param {AbortSignal} [opts.signal]  caller cancellation
 * @param {(raw:any)=>any} [opts.validate]  turns the parsed reply into the value
 *   the caller wants, or returns a falsy value to reject it; a rejected reply
 *   moves on to the next model (counted like malformed JSON) and an accepted
 *   one comes back as `value`.
 */
export async function callModel(prompt, { label = 'llm', deadlineMs, callMs, maxTokens, signal, validate } = {}) {
  const profile = llmProfile(label);
  const budget = deadlineMs ?? profile.deadlineMs;
  const perCall = callMs ?? profile.callMs;
  const tokens = maxTokens ?? profile.maxTokens;
  const started = Date.now();
  const errors = [];

  for (const c of candidates()) {
    const key = `${c.provider}:${c.model}`;
    const labelKey = `${key}|${label}`;
    if ((cooldown.get(key) || 0) > Date.now() || (cooldown.get(labelKey) || 0) > Date.now()) continue;
    if (signal?.aborted) {
      errors.push('aborted');
      break;
    }
    const remaining = budget - (Date.now() - started);
    if (remaining < MIN_ATTEMPT_MS) {
      errors.push(`deadline of ${budget}ms reached`);
      break;
    }
    const t0 = Date.now();
    try {
      const raw = await attempt(c, prompt, { ms: Math.min(perCall, remaining), maxTokens: tokens, signal });
      let value = raw;
      if (validate) {
        value = validate(raw);
        if (!value) throw Object.assign(new Error('reply failed validation'), { invalid: true });
      }
      jsonFailures.delete(labelKey);
      return { raw, value, provider: c.provider, model: c.model, ms: Date.now() - t0 };
    } catch (err) {
      const msg = String(err?.message || err).slice(0, 200);
      errors.push(msg);
      if (isJsonError(err)) {
        const n = (jsonFailures.get(labelKey) || 0) + 1;
        jsonFailures.set(labelKey, n);
        if (n >= JSON_STREAK) {
          cooldown.set(labelKey, Date.now() + JSON_COOLDOWN_MS);
          jsonFailures.delete(labelKey);
        }
      } else {
        const wait = cooldownFor(msg);
        if (wait) cooldown.set(key, Date.now() + wait);
      }
      console.error(`[${label}] ${key} failed after ${Date.now() - t0}ms: ${msg}`);
    }
  }
  throw new Error(errors.join(' | ') || 'every model is cooling down after recent failures');
}
