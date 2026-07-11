// Consolidated Composio function (one Serverless Function; the frontend calls
// it as /api/composio?action=<name> — no path rewrite needed since this is a
// brand new endpoint with no legacy URL shape to preserve).
// Actions: config, connections, connect, disconnect, tools, execute.
const { json, readBody, parseCookies, clientIp } = require('./_lib/respond');
const { verifySession } = require('./_lib/crypto');
const { guard } = require('./_lib/dam');
const {
  TOOLKITS, composioEnabled, readyToolkits, isMutating,
  listUserTools, executeTool, listConnections, initiateConnection, deleteConnection,
} = require('./_lib/composio');

module.exports = async (req, res) => {
  const action = req.query && req.query.action;

  if (action === 'config') {
    const ready = new Set(readyToolkits().map((t) => t.slug));
    return json(res, 200, {
      enabled: composioEnabled(),
      toolkits: TOOLKITS.map((t) => ({ ...t, ready: ready.has(t.slug) })),
    });
  }

  const sess = verifySession(parseCookies(req).zenith_session);
  if (!sess) return json(res, 401, { error: 'unauthenticated', message: 'Please sign in first.' });
  if (!composioEnabled()) {
    return json(res, 503, { error: 'not_configured', message: 'Connected apps are not configured for this workspace yet.' });
  }

  if (action === 'connections' && req.method === 'GET') {
    try { return json(res, 200, { connections: await listConnections(sess.email) }); }
    catch (e) { return json(res, 502, { error: 'composio', message: e.message || 'Could not reach Composio.' }); }
  }

  if (action === 'connect' && req.method === 'POST') {
    if (!(await guard(req, res, `composio-connect:${clientIp(req)}`, { capacity: 10, refillPerSec: 0.1 }))) return;
    const { toolkit, callbackUrl } = await readBody(req);
    try {
      const out = await initiateConnection(sess.email, String(toolkit || '').toUpperCase(), callbackUrl);
      return json(res, 200, out);
    } catch (e) { return json(res, 400, { error: 'composio', message: e.message || 'Could not start the connection.' }); }
  }

  if (action === 'disconnect' && req.method === 'POST') {
    const { connectionId } = await readBody(req);
    if (!connectionId) return json(res, 400, { error: 'invalid', message: 'Missing connectionId.' });
    try { await deleteConnection(sess.email, connectionId); return json(res, 200, { ok: true }); }
    catch (e) { return json(res, e.message === 'forbidden' ? 403 : 502, { error: 'composio', message: e.message }); }
  }

  if (action === 'tools' && req.method === 'GET') {
    try {
      const conns = await listConnections(sess.email);
      const slugs = [...new Set(conns.map((c) => c.toolkit))];
      const tools = await listUserTools(sess.email, slugs);
      return json(res, 200, { tools });
    } catch (e) { return json(res, 502, { error: 'composio', message: e.message || 'Could not list tools.' }); }
  }

  if (action === 'execute' && req.method === 'POST') {
    if (!(await guard(req, res, `composio-exec:${sess.email}`, { capacity: 20, refillPerSec: 20 / 3600 }))) return;
    const { tool, args, confirm } = await readBody(req);
    if (!tool || typeof tool !== 'string') return json(res, 400, { error: 'invalid', message: 'Missing tool.' });
    if (isMutating(tool) && !confirm) {
      return json(res, 428, { error: 'confirm_required', message: 'This action changes something outside Zenith — confirm to run it.' });
    }
    try {
      const result = await executeTool(tool, sess.email, args || {});
      return json(res, 200, result);
    } catch (e) { return json(res, 502, { error: 'composio', message: e.message || 'The connected app did not respond.' }); }
  }

  return json(res, 404, { error: 'not_found' });
};
