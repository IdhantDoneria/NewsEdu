// ─── Zenith connected apps — thin client for /api/composio and the AI tool loop ──
//
// Lets a signed-in user connect real tools (Gmail, Calendar, Slack, Linear,
// Notion, GitHub, Todoist) and lets Zenith AI act on them. Reads run
// immediately; anything that changes something outside Zenith comes back as a
// `proposedAction` that must be explicitly confirmed via confirmAction().

export interface Toolkit { slug: string; name: string; ready: boolean }
export interface ComposioConfigResult { enabled: boolean; toolkits: Toolkit[] }
export interface Connection { id: string; toolkit: string; status: string; createdAt: number | null }
export interface ProposedAction { tool: string; args: Record<string, any>; description: string }

async function friendlyFetch(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const message = (body && (body.message || body.error)) || `Request failed (HTTP ${res.status})`;
    throw new Error(String(message));
  }
  return body;
}

let cachedConfig: ComposioConfigResult | null = null;

export async function composioConfig(): Promise<ComposioConfigResult> {
  if (cachedConfig) return cachedConfig;
  const body = await friendlyFetch('/api/composio?action=config');
  cachedConfig = body as ComposioConfigResult;
  return cachedConfig;
}

export async function listConnections(): Promise<Connection[]> {
  const body = await friendlyFetch('/api/composio?action=connections');
  return body.connections ?? [];
}

/** Opens the OAuth popup and resolves once it closes (caller should re-fetch connections). */
export async function connectToolkit(slug: string): Promise<void> {
  const { redirectUrl } = await friendlyFetch('/api/composio?action=connect', {
    method: 'POST',
    body: JSON.stringify({ toolkit: slug, callbackUrl: location.href }),
  });
  if (!redirectUrl) throw new Error('Could not start the connection.');
  const popup = window.open(redirectUrl, 'composio-connect', 'width=520,height=680');

  await new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const timedOut = Date.now() - startedAt > 120_000;
      const closed = !popup || popup.closed;
      if (closed || timedOut) {
        clearInterval(timer);
        if (timedOut && !closed) { try { popup?.close(); } catch { /* ignore */ } }
        resolve(); // caller re-fetches listConnections() to see whether it actually landed
      }
    }, 1500);
    if (!popup) { clearInterval(timer); reject(new Error('Pop-up was blocked — allow pop-ups and try again.')); }
  });
}

export async function disconnectConnection(id: string): Promise<void> {
  await friendlyFetch('/api/composio?action=disconnect', {
    method: 'POST',
    body: JSON.stringify({ connectionId: id }),
  });
}

/** Runs one bounded tool-calling round against the user's connected apps via /api/ai. */
export async function runWithTools(prompt: string, system?: string): Promise<{ text?: string; proposedAction?: ProposedAction }> {
  return friendlyFetch('/api/ai', {
    method: 'POST',
    body: JSON.stringify({ prompt, system, useTools: true }),
  });
}

export async function confirmAction(tool: string, args: Record<string, any>): Promise<{ successful: boolean; data?: any; error?: string | null }> {
  return friendlyFetch('/api/composio?action=execute', {
    method: 'POST',
    body: JSON.stringify({ tool, args, confirm: true }),
  });
}
