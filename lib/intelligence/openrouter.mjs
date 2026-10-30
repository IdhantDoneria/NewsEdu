/**
 * OpenRouter client: the chat's second provider, used when every Gemini model
 * is unavailable (quota, retirement, overload). Returns parsed JSON, like
 * generateJson in ai.mjs.
 */

import { parseModelJson, combineSignals } from './ai.mjs';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
// Hard ceiling per request; the chain's own deadline is normally tighter.
const TIMEOUT_MS = 30_000;
// A chat answer plus claims and follow-ups; callers raise it for story analysis.
const DEFAULT_MAX_TOKENS = 1500;

function apiKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_KEY ||
    process.env.OPEN_ROUTER_API_KEY ||
    ''
  );
}

export function hasOpenRouterKey() {
  return Boolean(apiKey());
}

/**
 * Models tried in order. Defaults to OpenRouter's Auto Router, which picks the
 * model per prompt; OPENROUTER_MODEL, if set, is tried first (e.g. to pin one).
 */
export function openRouterModels() {
  return [process.env.OPENROUTER_MODEL, 'openrouter/auto'].filter(
    (m, i, all) => m && all.indexOf(m) === i
  );
}

/**
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]  the caller's deadline (the chain's shared deadline)
 * @param {number} [opts.maxTokens]    output cap; story analysis needs far more than a chat answer
 */
export async function openRouterJson(prompt, model, { signal, maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  const key = apiKey();
  if (!key) throw new Error('OpenRouter API key not configured.');

  const site = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://news-edu-eight.vercel.app';

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': site,
      'X-Title': 'The Meridian Brief',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: Math.max(256, Math.min(8192, Math.round(maxTokens))),
    }),
    signal: combineSignals(signal, AbortSignal.timeout(TIMEOUT_MS)),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`OpenRouter ${res.status} (${model}): ${detail}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter empty response (${model})`);
  // For the Auto Router, `data.model` is the model it actually chose.
  if (data.model && data.model !== model) console.log(`[chat] ${model} routed to ${data.model}`);
  return parseModelJson(content);
}
