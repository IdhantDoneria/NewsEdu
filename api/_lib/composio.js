// Composio client + shared helpers — lets a signed-in Zenith user connect real
// tools (Gmail, Calendar, Slack, Linear, Notion, GitHub, Todoist) and lets the
// AI assistant act on them. Requires COMPOSIO_API_KEY; each toolkit also needs
// an auth config id (COMPOSIO_AUTHCONFIG_<SLUG>) created in the Composio
// dashboard before users can connect it — see COMPOSIO.md.
//
// Loaded via dynamic import() (works from CommonJS regardless of whether the
// SDK ships as ESM or CJS) so a missing/misbehaving package never crashes a
// route that doesn't need it.

const TOOLKITS = [
  { slug: 'GMAIL', name: 'Gmail' },
  { slug: 'GOOGLECALENDAR', name: 'Google Calendar' },
  { slug: 'SLACK', name: 'Slack' },
  { slug: 'LINEAR', name: 'Linear' },
  { slug: 'NOTION', name: 'Notion' },
  { slug: 'GITHUB', name: 'GitHub' },
  { slug: 'TODOIST', name: 'Todoist' },
];

function composioEnabled() {
  return !!process.env.COMPOSIO_API_KEY;
}

function authConfigId(slug) {
  return process.env[`COMPOSIO_AUTHCONFIG_${slug}`] || '';
}

function readyToolkits() {
  return TOOLKITS.filter((t) => authConfigId(t.slug));
}

let _client = null;
async function getClient() {
  if (_client) return _client;
  if (!composioEnabled()) throw new Error('Composio is not configured');
  const { Composio } = await import('@composio/core');
  _client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  return _client;
}

// Crude but deliberately conservative: anything that doesn't look like a plain
// read/lookup is treated as mutating and requires explicit user confirmation
// before it's allowed to run. Unknown shapes default to "requires confirmation".
const READ_HINTS = /(GET|LIST|FETCH|SEARCH|FIND|READ|VIEW)/i;
const WRITE_HINTS = /(SEND|CREATE|DELETE|REMOVE|UPDATE|WRITE|POST|ARCHIVE|MOVE|INVITE|SHARE|EDIT|CLOSE|MERGE|PUBLISH|REPLY|FORWARD)/i;
function isMutating(toolSlug) {
  const s = String(toolSlug || '').toUpperCase();
  if (WRITE_HINTS.test(s)) return true;
  if (READ_HINTS.test(s)) return false;
  return true;
}

/** Tool schemas for a user's connected toolkits, in {name,description,parameters} shape. */
async function listUserTools(userId, toolkitSlugs) {
  if (!toolkitSlugs || !toolkitSlugs.length) return [];
  const client = await getClient();
  const tools = await client.tools.get(userId, { toolkits: toolkitSlugs });
  const arr = Array.isArray(tools) ? tools : tools?.items || [];
  return arr.map((t) => (t && t.function ? t.function : t)).filter((t) => t && t.name);
}

async function executeTool(toolSlug, userId, args) {
  const client = await getClient();
  return client.tools.execute(toolSlug, { userId, arguments: args || {}, version: 'latest' });
}

async function listConnections(userId) {
  const client = await getClient();
  const accounts = await client.connectedAccounts.list({ userIds: [userId], statuses: ['ACTIVE'] });
  const items = Array.isArray(accounts) ? accounts : accounts?.items || [];
  return items.map((a) => ({
    id: a.id,
    toolkit: (a.toolkit && a.toolkit.slug) || a.toolkitSlug || a.appName || 'unknown',
    status: a.status,
    createdAt: a.createdAt || a.created_at || null,
  }));
}

async function initiateConnection(userId, toolkitSlug, callbackUrl) {
  const cfgId = authConfigId(toolkitSlug);
  if (!cfgId) throw new Error(`${toolkitSlug} is not configured by the workspace owner yet`);
  const client = await getClient();
  const reqResult = await client.connectedAccounts.initiate(userId, cfgId, callbackUrl ? { callbackUrl } : undefined);
  return { redirectUrl: reqResult.redirectUrl || reqResult.redirect_url };
}

async function deleteConnection(userId, connectionId) {
  const client = await getClient();
  const acc = await client.connectedAccounts.get(connectionId);
  const owner = (acc && (acc.userId || acc.user_id)) || null;
  if (owner && owner !== userId) throw new Error('forbidden');
  await client.connectedAccounts.delete(connectionId);
}

module.exports = {
  TOOLKITS, composioEnabled, authConfigId, readyToolkits, isMutating,
  listUserTools, executeTool, listConnections, initiateConnection, deleteConnection,
};
