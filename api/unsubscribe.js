// GET /api/unsubscribe?e=<email>&t=<token> → opt out of marketing emails
const { emailToken } = require('./_lib/crypto');
const { getUser, putUser } = require('./_lib/store');

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#f4f1ea;font-family:-apple-system,Segoe UI,sans-serif;color:#2f2c26;">
<div style="max-width:420px;text-align:center;padding:32px;background:#fff;border-radius:16px;box-shadow:0 6px 24px rgba(20,16,8,.08);">
<div style="font-weight:700;letter-spacing:.22em;margin-bottom:14px;">ZEN<span style="color:#b68a36;">ITH</span></div>
${body}
</div></body></html>`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const email = (url.searchParams.get('e') || '').toLowerCase();
  const token = url.searchParams.get('t') || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!email || token !== emailToken(email, 'unsub')) {
    res.statusCode = 400;
    return res.end(page('Invalid link', '<p style="color:#524d44;line-height:1.6;">This unsubscribe link is invalid or has expired.</p>'));
  }
  try {
    const user = await getUser(email);
    if (user) { user.subscribed = false; await putUser(user); }
  } catch { /* best effort */ }
  res.statusCode = 200;
  return res.end(page('Unsubscribed',
    '<h2 style="margin:0 0 10px;font-size:20px;">You\'re unsubscribed</h2><p style="color:#524d44;line-height:1.6;">You won\'t receive daily Zenith emails anymore. You can re-enable them anytime from Settings.</p>'));
};
