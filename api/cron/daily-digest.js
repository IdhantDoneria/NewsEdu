// GET /api/cron/daily-digest — Vercel Cron entrypoint (see vercel.json "crons").
// Sends the daily templated marketing email to every subscribed user.
// Protected by CRON_SECRET (Vercel sends it as a Bearer token automatically).
const { json } = require('../_lib/respond');
const { allUsers } = require('../_lib/store');
const { sendEmail, isConfigured, TEMPLATES, tipForDay } = require('../_lib/email');

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured → allow (still gated by obscurity + email config)
  const got = req.headers.authorization || '';
  return got === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
  if (!authorized(req)) return json(res, 401, { error: 'unauthorized' });
  if (!isConfigured()) {
    return json(res, 503, { error: 'email_not_configured', message: 'Set RESEND_API_KEY (and MARKETING_FROM) to send campaigns.' });
  }

  const tip = tipForDay(new Date());
  let sent = 0, skipped = 0, failed = 0;
  try {
    const users = await allUsers();
    for (const u of users) {
      if (u.subscribed === false) { skipped++; continue; }
      const t = TEMPLATES.dailyDigest(u.name, u.email, tip);
      const r = await sendEmail({ to: u.email, subject: t.subject, html: t.html });
      if (r.ok) sent++; else failed++;
      // gentle pacing so a large list doesn't burst the email provider
      await new Promise((res2) => setTimeout(res2, 120));
    }
  } catch (e) {
    return json(res, 500, { error: 'server', message: String(e && e.message || e).slice(0, 200), sent, failed });
  }
  return json(res, 200, { ok: true, campaign: tip.title, sent, skipped, failed });
};
