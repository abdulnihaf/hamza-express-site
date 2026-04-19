/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * /api/hr-wa-send  —  Hamza Express WABA send endpoint for HR digests
 *
 * Purpose: lets hnhotels.in/api/hr-admin push brand-scoped attendance
 * digests through the Hamza Express WhatsApp Business account without
 * exposing WA_ACCESS_TOKEN / WA_PHONE_ID to the HN project.
 *
 * Auth: header `x-api-key` must equal env.DASHBOARD_API_KEY
 *       (same key the HN side already has as DASHBOARD_KEY — value is
 *        shared across projects; see Nihaf's CLAUDE.md platform IDs).
 *
 * Body: { to: "91XXXXXXXXXX" (no + or spaces), text: "..." }
 *
 * WhatsApp policy note: free-form text requires the recipient to have
 * sent an inbound message to this WABA number within the last 24h. If
 * that window is closed, Meta returns a 131047 / 132000 error and this
 * endpoint forwards the failure. Use pre-approved templates for cold
 * sends — not implemented here.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...CORS },
});

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  const key = request.headers.get('x-api-key');
  if (!key || key !== env.DASHBOARD_API_KEY) return json({ error: 'unauthorized' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid json' }, 400); }

  const to = String(body.to || '').replace(/\D/g, '');
  const text = String(body.text || '').trim();
  if (!to || !text) return json({ error: 'to and text required' }, 400);
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) return json({ error: 'WA_ACCESS_TOKEN / WA_PHONE_ID not configured' }, 500);

  const metaUrl = `https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text.slice(0, 4096) },  // WA text cap
  };

  try {
    const resp = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return json({
        error: 'meta_error',
        status: resp.status,
        meta: data?.error || data,
      }, 502);
    }
    return json({
      ok: true,
      wa_message_id: data?.messages?.[0]?.id || null,
      to,
    });
  } catch (e) {
    return json({ error: 'fetch_failed', message: e.message }, 500);
  }
}
