/**
 * AI client for the intelligence layer. Kept separate from lib/gemini.js
 * (the markets-page wrapper) so the intelligence modules stay importable by
 * plain `node --test` and own their JSON-mode handling.
 */

import { GoogleGenAI } from '@google/genai';

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

/** One signal that aborts when any input does (AbortSignal.any needs Node 20.3+). */
export function combineSignals(...signals) {
  const list = signals.filter(Boolean);
  if (list.length <= 1) return list[0];
  const ctrl = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

/**
 * Ask Gemini for strict JSON. Returns the parsed object or throws.
 * Code fences, stray prose and common JSON slips (trailing commas, missing
 * commas, a truncated tail) are tolerated; anything still unparseable is a
 * hard error the caller must handle (validate -> next model -> fallback).
 *
 * `signal` aborts the HTTP request, so a deadline really stops the call.
 */
export async function generateJson(
  prompt,
  model = 'gemini-2.5-flash',
  { noThinking = false, signal, maxOutputTokens } = {}
) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured.');

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: 'application/json',
      ...(signal ? { abortSignal: signal } : {}),
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      // Only the 2.5 family accepts a zero thinking budget.
      ...(noThinking && /^gemini-2\.5-flash(?!-lite)/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });

  const text =
    response?.text ??
    response?.candidates?.[0]?.content?.parts?.[0]?.text ??
    (typeof response === 'string' ? response : '');
  if (!text) throw new Error('Empty response from Gemini API');
  return parseModelJson(text);
}

/* ------------------------------ tolerant parsing --------------------------- */

const VALUE_START_AFTER_COMMA = /^\s*(?:["{[\-0-9]|true\b|false\b|null\b)/;

/**
 * Best-effort repair of almost-JSON from a model: unescaped quotes and raw
 * newlines inside strings, trailing or missing commas, mismatched or missing
 * closers (a truncated reply), and text after the top-level value.
 * Returns a string that is usually valid JSON; the caller still parses it.
 */
export function repairJson(src) {
  const s = String(src);
  let out = '';
  const stack = [];
  let inStr = false;
  let esc = false;
  let last = ''; // last significant emitted char outside strings; 'v' = literal
  let done = false;
  let strStart = -1; // index in `out` where the current string began, if it is an object key
  let keyStart = -1; // a finished key still waiting for its colon

  const needComma = () => stack.length > 0 && (last === '"' || last === '}' || last === ']' || last === 'v');

  for (let i = 0; i < s.length && !done; i++) {
    const c = s[i];

    if (inStr) {
      if (esc) {
        out += c;
        esc = false;
        continue;
      }
      if (c === '\\') {
        out += c;
        esc = true;
        continue;
      }
      if (c === '"') {
        const rest = s.slice(i + 1);
        const next = /^\s*(.)/s.exec(rest)?.[1];
        let closes = next === undefined || next === '}' || next === ']' || next === ':';
        if (next === ',') closes = VALUE_START_AFTER_COMMA.test(rest.replace(/^\s*,/, '')) || /^\s*,\s*$/.test(rest);
        // A value followed directly by the next key: the comma went missing.
        if (next === '"' && /^\s*"[A-Za-z_][\w ]{0,40}"\s*:/.test(rest)) closes = true;
        if (stack.length === 0) closes = true;
        if (!closes) {
          out += '\\"'; // a quote inside the text
          continue;
        }
        inStr = false;
        out += c;
        last = '"';
        if (strStart >= 0) keyStart = strStart;
        strStart = -1;
        continue;
      }
      if (c === '\n') out += '\\n';
      else if (c === '\r') out += '';
      else if (c === '\t') out += '\\t';
      else if (c < ' ') out += ' ';
      else out += c;
      continue;
    }

    if (/\s/.test(c)) {
      out += c;
      continue;
    }
    if (c === '"') {
      if (needComma()) out += ',';
      strStart = stack[stack.length - 1] === '{' && last !== ':' ? out.length : -1;
      inStr = true;
      out += c;
      continue;
    }
    if (c === '{' || c === '[') {
      if (needComma()) out += ',';
      stack.push(c);
      out += c;
      last = c;
      continue;
    }
    if (c === '}' || c === ']') {
      if (stack.length === 0) continue; // stray closer
      if (keyStart >= 0) out = out.slice(0, keyStart); // key without a value
      keyStart = -1;
      out = out.replace(/,(\s*)$/, '$1');
      if (last === ':') out += 'null';
      const want = stack[stack.length - 1] === '{' ? '}' : ']';
      stack.pop();
      out += want; // a mismatched closer closes the container that is open
      last = want;
      if (stack.length === 0) done = true;
      continue;
    }
    if (c === ',') {
      if (last === ',' || last === '{' || last === '[' || last === ':' || last === '') continue;
      out += c;
      last = ',';
      continue;
    }
    if (c === ':') {
      out += c;
      last = ':';
      keyStart = -1;
      continue;
    }
    // number / true / false / null (anything else is copied through as a token)
    if (needComma()) out += ',';
    let j = i;
    while (j < s.length && !/[\s,:{}[\]"]/.test(s[j])) j++;
    out += s.slice(i, j);
    last = 'v';
    i = j - 1;
  }

  if (inStr) {
    if (esc) out = out.slice(0, -1);
    out += '"';
    if (strStart >= 0) keyStart = strStart;
  }
  if (keyStart >= 0) out = out.slice(0, keyStart);
  out = out.replace(/,(\s*)$/, '$1');
  if (/:\s*$/.test(out)) out += 'null';
  while (stack.length) out += stack.pop() === '{' ? '}' : ']';
  return out;
}

/**
 * Parse a model's JSON reply, tolerating code fences, stray prose around the
 * JSON body and the slips repairJson fixes. Throws if nothing parseable remains.
 */
export function parseModelJson(raw) {
  let text = String(raw ?? '').trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*(?:```)?$/);
  if (fenced) text = fenced[1];
  if (!/^[[{]/.test(text)) {
    const start = text.search(/[[{]/);
    if (start >= 0) text = text.slice(start);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    try {
      const repaired = JSON.parse(repairJson(text));
      if (repaired && typeof repaired === 'object') return repaired;
    } catch {
      // fall through to the original error
    }
    throw err;
  }
}
