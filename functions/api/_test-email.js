// /api/_test-email — DASHBOARD_API_KEY-gated test endpoint that fires one of the
// two creator-flow HTML email templates to a test address. Used to verify Gmail
// API setup (refresh token, sender identity, template rendering) without going
// through the full apply form.
//
// Usage:
//   POST /api/_test-email
//   { "key": "...", "to": "nihafwork@gmail.com", "kind": "received" | "decision" | "plain" }
//
// Returns: { ok, message_id } from Gmail API on success, or detailed error.

import { sendEmail } from './_lib/email-sender.js';
import { buildReceivedEmail, buildDecisionEmail, buildTentativeEmail } from './_lib/email-templates.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Dashboard-Key',
};
const json = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { 'Content-Type': 'application/json', ...CORS },
});

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const providedKey = request.headers.get('X-Dashboard-Key')
    || new URL(request.url).searchParams.get('key')
    || body.key;
  if (!providedKey || providedKey !== env.DASHBOARD_API_KEY) {
    return json({ error: 'unauthorized' }, 401);
  }

  const to = (body.to || '').toString().trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return json({ error: 'invalid email address' }, 400);
  }
  const kind = (body.kind || 'received').toString();

  // Sample data — matches the shape that creator-application.js builds.
  // NOTE: tentative + decision builders now expect slot as an object {slot_date, window_code}
  // so fmtSlotEmail() can format it consistently. Received still accepts a string fallback.
  const sample = {
    first_name: body.first_name || 'Nihaf',
    handle: body.handle || 'rajbiswas56',
    tier: body.tier || 'T3 · 15K–30K · Mid-Micro',
    slot: body.slot || { slot_date: '2026-05-15', window_code: 'PRIME' },
    hosting: body.hosting || ['3 covers (your party size)', 'Welcome chai', 'Dessert flight'],
    asks: body.asks || ['1 reel within 7 days', '5 stories same evening', 'Tag @hamzaexpress1918', '24-hour bio link'],
    cash_inr: body.cash_inr || 0,
  };

  let payload;
  if (kind === 'plain') {
    payload = {
      subject: 'Test from Hamza Express creator flow · ' + new Date().toISOString().slice(0,16).replace('T',' '),
      html: '<html><body style="font-family:Georgia,serif;color:#713520"><h1>Hello.</h1><p>This is a plain-html smoke test from <strong>nihaf@hnhotels.in</strong> via the Gmail API. If you see this, the OAuth flow + refresh token + sendEmail helper all work.</p></body></html>',
    };
  } else if (kind === 'tentative') {
    payload = buildTentativeEmail({
      ...sample,
      slot: { slot_date: '2026-05-15', window_code: 'PRIME' },
      confirm_url: 'https://hamzaexpress.in/creators/confirm/?token=TEST-MOBILE-PREVIEW',
    });
  } else if (kind === 'decision') {
    payload = buildDecisionEmail({
      ...sample,
      status: body.status || 'approved',
      decline_reason: body.decline_reason || null,
    });
  } else {
    payload = buildReceivedEmail({ ...sample, status: body.status || 'pending' });
  }

  const r = await sendEmail(env, {
    to,
    subject: payload.subject,
    html: payload.html,
    from_name: 'Nihaf · Hamza Express',
  });
  return json(r, r.ok ? 200 : 502);
}
