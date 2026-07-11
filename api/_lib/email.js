// Email delivery (Resend REST) + a small library of professional, email-safe
// HTML templates for marketing campaigns. Zero dependencies.
//
// Configure: RESEND_API_KEY, MARKETING_FROM (e.g. "Zenith <hello@yourdomain.com>"),
//            APP_URL (public site URL, used for links).
const { emailToken } = require('./crypto');

function emailConfig() {
  return {
    key: process.env.RESEND_API_KEY || '',
    from: process.env.MARKETING_FROM || 'Zenith <onboarding@resend.dev>',
    appUrl: (process.env.APP_URL || process.env.VERCEL_URL || '').replace(/\/+$/, '') ||
      'https://zenith.app',
  };
}

function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

async function sendEmail({ to, subject, html }) {
  const cfg = emailConfig();
  if (!cfg.key) return { ok: false, skipped: true, reason: 'RESEND_API_KEY not set' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text.slice(0, 300) };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, id: data.id };
}

// ─── shared chrome ─────────────────────────────────────────────────────────

function shell(inner, { appUrl, unsubUrl }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2f2c26;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:28px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(20,16,8,.07);">
<tr><td style="background:linear-gradient(125deg,#15130e,#27200f);padding:26px 32px;">
<span style="font-weight:700;font-size:18px;letter-spacing:.22em;color:#f3ece0;">ZEN<span style="color:#e6c87a;">ITH</span></span>
</td></tr>
<tr><td style="padding:32px;">${inner}</td></tr>
<tr><td style="padding:20px 32px;background:#faf8f3;border-top:1px solid #ece6da;font-size:12px;color:#8a8377;line-height:1.6;">
You're receiving this because you created a Zenith account.
&nbsp;<a href="${unsubUrl}" style="color:#b68a36;">Unsubscribe</a> ·
<a href="${appUrl}" style="color:#b68a36;">Open Zenith</a><br>
Zenith — the pinnacle workspace.
</td></tr>
</table></td></tr></table></body></html>`;
}

function button(label, href) {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(125deg,#e6c87a,#b68a36);color:#1d1709;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:15px;">${label}</a>`;
}

function links(email) {
  const { appUrl } = emailConfig();
  return { appUrl, unsubUrl: `${appUrl}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${emailToken(email, 'unsub')}` };
}

// ─── templates ─────────────────────────────────────────────────────────────

const TEMPLATES = {
  welcome(name, email) {
    const l = links(email);
    return {
      subject: 'Welcome to Zenith ✦ your summit awaits',
      html: shell(`
        <h1 style="font-size:24px;margin:0 0 12px;">Welcome, ${esc(name) || 'there'} 👋</h1>
        <p style="font-size:15px;line-height:1.65;color:#524d44;margin:0 0 18px;">
          Zenith is your second brain — notes, docs, databases and AI in one beautifully minimal place.
          Here's the fastest way to feel the lift:
        </p>
        <ul style="font-size:15px;line-height:1.8;color:#524d44;padding-left:20px;margin:0 0 24px;">
          <li>Press <b>/</b> anywhere for every block and command</li>
          <li>Type <b>/table</b> to spin up a database with six views</li>
          <li>Hit <b>⌘K</b> to jump to anything instantly</li>
        </ul>
        ${button('Open your workspace', l.appUrl)}
      `, l),
    };
  },

  dailyDigest(name, email, tip) {
    const l = links(email);
    return {
      subject: `Your daily Zenith ✦ ${tip.title}`,
      html: shell(`
        <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b68a36;margin:0 0 6px;font-weight:600;">Tip of the day</p>
        <h1 style="font-size:23px;margin:0 0 12px;">${esc(tip.title)}</h1>
        <p style="font-size:15px;line-height:1.65;color:#524d44;margin:0 0 20px;">${esc(tip.body)}</p>
        <div style="background:#faf6ec;border-left:3px solid #e6c87a;border-radius:8px;padding:14px 16px;font-size:14px;color:#6b6356;margin:0 0 24px;">
          ${esc(tip.pro)}
        </div>
        ${button('Put it to work', l.appUrl)}
        <p style="font-size:13px;color:#8a8377;margin:22px 0 0;">See you at the summit, ${esc(name) || 'friend'}.</p>
      `, l),
    };
  },

  productUpdate(name, email, { headline, body, cta }) {
    const l = links(email);
    return {
      subject: `What's new in Zenith ✦ ${headline}`,
      html: shell(`
        <h1 style="font-size:23px;margin:0 0 12px;">${esc(headline)}</h1>
        <p style="font-size:15px;line-height:1.65;color:#524d44;margin:0 0 22px;">${esc(body)}</p>
        ${button(cta || 'Take a look', l.appUrl)}
      `, l),
    };
  },

  reengage(name, email) {
    const l = links(email);
    return {
      subject: 'Your workspace misses you ✦',
      html: shell(`
        <h1 style="font-size:23px;margin:0 0 12px;">Pick up where you left off</h1>
        <p style="font-size:15px;line-height:1.65;color:#524d44;margin:0 0 22px;">
          A few quiet minutes in Zenith compounds. Your notes, tasks and databases are exactly where you left them.
        </p>
        ${button('Return to Zenith', l.appUrl)}
      `, l),
    };
  },
};

// rotating daily tips (campaign content)
const TIPS = [
  { title: 'Think in blocks', body: 'Every line in Zenith is a block you can drag, nest, turn into a heading, toggle, or callout.', pro: 'Pro: drag a block to the right edge of another to make instant columns.' },
  { title: 'One dataset, six lenses', body: 'A database can be a table, board, gallery, list, calendar, or timeline at once.', pro: 'Pro: group a board by a Status property and drag cards to update them.' },
  { title: 'Write at the speed of thought', body: 'Markdown works inline — # for headings, - for bullets, [] for to-dos, ``` for code.', pro: 'Pro: **bold** and `code` format the moment you type them.' },
  { title: 'Let AI do the first draft', body: 'Select text or type /ai to rewrite, summarize, translate, or continue your thought.', pro: 'Pro: "Continue writing" reads everything above your cursor for context.' },
  { title: 'Never lose a word', body: 'Zenith snapshots your pages automatically; restore any version from the ⋯ menu.', pro: 'Pro: ⌘Z undoes across the whole page, not just the current block.' },
  { title: 'Your command center', body: '⌘K searches every page and jumps you there — or creates a new page on the spot.', pro: 'Pro: ⌘\\ toggles the sidebar, ⌘⇧L flips dark mode.' },
  { title: 'Templates that do the work', body: 'Project trackers, planners, reading lists and more are one click away in Templates.', pro: 'Pro: every template creates real, fully editable pages — not screenshots.' },
];

function tipForDay(date = new Date()) {
  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  return TIPS[dayIndex % TIPS.length];
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { sendEmail, isConfigured, emailConfig, TEMPLATES, TIPS, tipForDay };
