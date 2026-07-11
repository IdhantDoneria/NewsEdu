// Account/email store backed by Upstash Redis REST (a.k.a. Vercel KV). If no
// store is configured it falls back to a warm-instance in-memory map so the API
// still responds — clearly non-persistent (health reports "ephemeral").
//
// Configure with EITHER naming convention (Vercel KV sets the KV_* ones):
//   KV_REST_API_URL / KV_REST_API_TOKEN
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN

function restConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

const mem = (globalThis.__zenithMem = globalThis.__zenithMem || { kv: new Map(), set: new Set() });

async function redis(args) {
  const cfg = restConfig();
  if (!cfg) return null; // signal: use in-memory
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`store ${res.status}`);
  const j = await res.json();
  return j.result;
}

const USER = (email) => `zenith:user:${email.toLowerCase()}`;
const INDEX = 'zenith:users';

async function getUser(email) {
  const cfg = restConfig();
  if (!cfg) { const v = mem.kv.get(USER(email)); return v ? JSON.parse(v) : null; }
  const raw = await redis(['GET', USER(email)]);
  return raw ? JSON.parse(raw) : null;
}

async function putUser(user) {
  const key = USER(user.email);
  const val = JSON.stringify(user);
  const cfg = restConfig();
  if (!cfg) { mem.kv.set(key, val); mem.set.add(user.email.toLowerCase()); return; }
  await redis(['SET', key, val]);
  await redis(['SADD', INDEX, user.email.toLowerCase()]);
}

async function allUsers() {
  const cfg = restConfig();
  let emails;
  if (!cfg) emails = Array.from(mem.set);
  else emails = (await redis(['SMEMBERS', INDEX])) || [];
  const out = [];
  for (const e of emails) {
    const u = await getUser(e);
    if (u) out.push(u);
  }
  return out;
}

function isPersistent() {
  return !!restConfig();
}

module.exports = { getUser, putUser, allUsers, isPersistent, command: redis };
