// POST /api/ai — server-side Gemini proxy. The workspace owner's API key lives
// only here (GEMINI_API_KEY); every visitor's request is proxied through this
// endpoint. Plain requests stream SSE straight through from Gemini unchanged.
// Requests with `useTools: true` instead run a short, bounded function-calling
// round against the user's connected Composio apps: read-only actions execute
// immediately, anything that mutates something outside Zenith is returned as a
// `proposedAction` for the client to confirm before /api/composio?action=execute
// actually runs it. Dam-guarded so a shared key can't be drained by one caller.
const { readBody, parseCookies, clientIp } = require('./_lib/respond');
const { verifySession } = require('./_lib/crypto');
const { guard } = require('./_lib/dam');
const { composioEnabled, isMutating, listUserTools, executeTool, listConnections } = require('./_lib/composio');

const DEFAULT_MODEL = 'gemini-2.0-flash';
const ALLOWED_MODELS = new Set([
  'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-pro',
]);

function geminiKey() {
  return process.env.GEMINI_API_KEY || '';
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function genUrl(model, key, verb, extraQuery) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:${verb}?${extraQuery ? extraQuery + '&' : ''}key=${encodeURIComponent(key)}`;
}

async function callGemini(model, key, body) {
  const res = await fetch(genUrl(model, key, 'generateContent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((j && j.error && j.error.message) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return j;
}

function firstFunctionCall(resp) {
  const parts = (resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content && resp.candidates[0].content.parts) || [];
  for (const p of parts) if (p.functionCall) return p.functionCall;
  return null;
}

function textOf(resp) {
  const parts = (resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content && resp.candidates[0].content.parts) || [];
  return parts.map((p) => p.text || '').join('');
}

function humanizeTool(name) {
  return String(name || '').replace(/_/g, ' ').toLowerCase();
}

// ── tool-calling round (non-streaming — needs to inspect the response before deciding what to do) ──
async function handleWithTools(sess, { system, prompt, model }, res) {
  if (!sess) return sendJson(res, 401, { error: 'unauthenticated', message: 'Sign in to use connected apps.' });
  if (!composioEnabled()) return sendJson(res, 503, { error: 'not_configured', message: 'Connected apps are not configured for this workspace yet.' });

  let tools;
  try {
    const conns = await listConnections(sess.email);
    const slugs = [...new Set(conns.map((c) => c.toolkit))];
    tools = await listUserTools(sess.email, slugs);
  } catch (e) {
    return sendJson(res, 502, { error: 'composio', message: e.message || 'Could not reach connected apps.' });
  }
  if (!tools.length) {
    return sendJson(res, 200, { text: "You haven't connected any apps yet — open Settings → Connections to link Gmail, Calendar, Slack and more." });
  }

  const key = geminiKey();
  const base = { generationConfig: { temperature: 0.4 }, tools: [{ functionDeclarations: tools }] };
  if (system) base.systemInstruction = { parts: [{ text: system }] };
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];

  let resp;
  try {
    resp = await callGemini(model, key, { ...base, contents });
  } catch (e) {
    return sendJson(res, e.status || 502, { error: 'upstream', message: e.message });
  }

  const call = firstFunctionCall(resp);
  if (!call) {
    return sendJson(res, 200, { text: textOf(resp) || "I couldn't find anything actionable there — try rephrasing." });
  }

  if (isMutating(call.name)) {
    return sendJson(res, 200, { proposedAction: { tool: call.name, args: call.args || {}, description: `Run "${humanizeTool(call.name)}"` } });
  }

  let result;
  try {
    result = await executeTool(call.name, sess.email, call.args || {});
  } catch (e) {
    return sendJson(res, 502, { error: 'composio', message: e.message || 'The connected app did not respond.' });
  }

  const contents2 = [
    ...contents,
    { role: 'model', parts: [{ functionCall: call }] },
    { role: 'function', parts: [{ functionResponse: { name: call.name, response: { result } } }] },
  ];
  let final;
  try {
    final = await callGemini(model, key, { ...base, contents: contents2 });
  } catch (e) {
    return sendJson(res, e.status || 502, { error: 'upstream', message: e.message });
  }
  return sendJson(res, 200, { text: textOf(final) || 'Done.' });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const key = geminiKey();
  if (!key) {
    return sendJson(res, 503, { error: 'not_configured', message: 'Zenith AI is not configured for this workspace yet.' });
  }

  // Signed-in users get a roomier hourly bucket than anonymous visitors; either
  // way the workspace owner's shared key is protected from a single flood.
  const sess = verifySession(parseCookies(req).zenith_session);
  const bucketKey = sess ? `ai:user:${sess.email}` : `ai:ip:${clientIp(req)}`;
  const damOpts = sess
    ? { capacity: 40, refillPerSec: 40 / 3600 }
    : { capacity: 12, refillPerSec: 12 / 3600 };
  if (!(await guard(req, res, bucketKey, damOpts))) return;

  const { system, prompt, model, useTools } = await readBody(req);
  if (!prompt || typeof prompt !== 'string') {
    return sendJson(res, 400, { error: 'invalid', message: 'Missing prompt.' });
  }
  const useModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;

  if (useTools) return handleWithTools(sess, { system, prompt, model: useModel }, res);

  // ── plain path: stream Gemini's SSE straight through ──
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7 },
  };
  if (system && typeof system === 'string') body.systemInstruction = { parts: [{ text: system }] };

  let upstream;
  try {
    upstream = await fetch(genUrl(useModel, key, 'streamGenerateContent', 'alt=sse'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return sendJson(res, 502, { error: 'upstream', message: 'Could not reach the AI service.' });
  }

  if (!upstream.ok || !upstream.body) {
    let detail = '';
    try { detail = (await upstream.text()).slice(0, 300); } catch { /* unreadable */ }
    return sendJson(res, upstream.status || 502, { error: 'upstream', message: detail || 'The AI service rejected the request.' });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch {
    // client disconnected or upstream dropped mid-stream — nothing more to do
  } finally {
    res.end();
  }
};
