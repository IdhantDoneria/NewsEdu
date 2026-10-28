/**
 * OpenRouter client: the chat's second provider, used when every Gemini model
 * is unavailable (quota, retirement, overload). Returns parsed JSON, like
 * generateJson in ai.mjs.
 */

import { parseModelJson } from './ai.mjs';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 20_000;

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

/** Models tried in order. OPENROUTER_MODEL, if set, goes first. */
export function openRouterModels() {
  return [process.env.OPENROUTER_MODEL, 'anthropic/claude-haiku-5.5', 'deepseek/deepseek-v4.1-flash']
    .filter((m, i, all) => m && all.indexOf(m) === i);
}

export async function openRouterJson(prompt, model) {
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
      max_tokens: 1000,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`OpenRouter ${res.status} (${model}): ${detail}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter empty response (${model})`);
  return parseModelJson(content);
}
