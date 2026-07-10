/**
 * AI client for the intelligence layer. Kept separate from lib/gemini.js
 * (the markets-page wrapper) so the intelligence modules stay importable by
 * plain `node --test` and own their JSON-mode handling.
 */

import { GoogleGenAI } from '@google/genai';

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

/**
 * Ask Gemini for strict JSON. Returns the parsed object or throws.
 * Code fences and stray prose around the JSON body are tolerated;
 * anything that still fails JSON.parse is a hard error the caller must
 * handle (validate → retry → deterministic fallback).
 */
export async function generateJson(prompt, model = 'gemini-2.5-flash') {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured.');

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: { responseMimeType: 'application/json' },
  });

  let text =
    response?.text ??
    response?.candidates?.[0]?.content?.parts?.[0]?.text ??
    (typeof response === 'string' ? response : '');
  if (!text) throw new Error('Empty response from Gemini API');

  text = String(text).trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) text = fenced[1];
  if (!/^[[{]/.test(text)) {
    const start = text.search(/[[{]/);
    if (start >= 0) text = text.slice(start);
  }
  return JSON.parse(text);
}
