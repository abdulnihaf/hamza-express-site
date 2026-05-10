// /api/creator-outreach — Backend for the manual outreach control page.
//
// Powers /ops/creator-outreach — the dashboard where the owner clicks per-creator
// channel buttons (IG / WA / Email) to fire the templated outreach manually.
//
// Auth: all actions require X-Dashboard-Key header == env.DASHBOARD_API_KEY.
//
// Reads from influencer_bio_pulse (the enriched creators) and writes to
// creator_outreach_log (audit + send-once idempotency).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Dashboard-Key',
};
const json = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { 'Content-Type': 'application/json', ...CORS },
});

const requireOwner = (env, request, body) => {
  const k = request.headers.get('X-Dashboard-Key')
        || new URL(request.url).searchParams.get('key')
        || (body && body.key);
  return k && k === (env.DASHBOARD_API_KEY || env.DASHBOARD_KEY);
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const db = env.HIRING_DB;
  if (!db) return json({ error: 'HIRING_DB binding missing' }, 500);

  try {
    if (request.method === 'GET') {
      if (!requireOwner(env, request, null)) return json({ error: 'unauthorized' }, 401);
      if (action === 'list')   return await actionList(env, db, url);
      if (action === 'stats')  return await actionStats(env, db);
    }
    if (request.method === 'POST') {
      const body = await safeJson(request);
      if (!requireOwner(env, request, body)) return json({ error: 'unauthorized' }, 401);
      if (action === 'log-send')     return await actionLogSend(env, db, body);
      if (action === 'mark-reply')   return await actionMarkReply(env, db, body);
    }
    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message, stack: e.stack?.slice(0, 600) }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────────
// LIST — pulls the candidate creators with channel availability + send state
// ─────────────────────────────────────────────────────────────────────
async function actionList(env, db, url) {
  const minF = parseInt(url.searchParams.get('min_followers') || '5000');
  const maxF = parseInt(url.searchParams.get('max_followers') || '100000');
  const limit = parseInt(url.searchParams.get('limit') || '60');

  // The full enriched + contactable + public + BLR-food-adjacent set in window.
  // Join with creator_outreach_log to know what's already been sent on each channel.
  const r = await db.prepare(`
    SELECT
      bp.username AS handle,
      bp.full_name,
      bp.followers_count,
      bp.engagement_rate,
      bp.profile_pic_url,
      bp.biography,
      bp.category_name,
      bp.has_email,
      bp.has_phone,
      bp.has_whatsapp,
      bp.extracted_emails_json,
      bp.extracted_phones_json,
      bp.extracted_whatsapp_json,
      bp.is_verified,
      bp.is_business_account,
      (SELECT sent_at FROM creator_outreach_log WHERE handle=bp.username AND channel='ig')    AS ig_sent_at,
      (SELECT sent_at FROM creator_outreach_log WHERE handle=bp.username AND channel='wa')    AS wa_sent_at,
      (SELECT sent_at FROM creator_outreach_log WHERE handle=bp.username AND channel='email') AS email_sent_at,
      (SELECT reply_state FROM creator_outreach_log WHERE handle=bp.username AND reply_state != 'none' ORDER BY updated_at DESC LIMIT 1) AS reply_state
    FROM influencer_bio_pulse bp
    WHERE bp.status = 'ok'
      AND bp.has_any_contact = 1
      AND bp.is_private = 0
      AND bp.followers_count BETWEEN ? AND ?
      AND (
        LOWER(bp.biography) LIKE '%food%'      OR LOWER(bp.biography) LIKE '%bangalore%'  OR
        LOWER(bp.biography) LIKE '%bengaluru%' OR LOWER(bp.biography) LIKE '%blr%'        OR
        LOWER(bp.biography) LIKE '%foodie%'    OR LOWER(bp.biography) LIKE '%biryani%'    OR
        LOWER(bp.biography) LIKE '%recipe%'    OR LOWER(bp.biography) LIKE '%restaurant%' OR
        LOWER(bp.biography) LIKE '%kitchen%'   OR LOWER(bp.biography) LIKE '%vlog%'       OR
        LOWER(bp.biography) LIKE '%cafe%'      OR LOWER(bp.biography) LIKE '%chai%'       OR
        LOWER(bp.biography) LIKE '%namma%'     OR LOWER(bp.category_name) LIKE '%food%'
      )
    ORDER BY bp.followers_count DESC
    LIMIT ?
  `).bind(minF, maxF, limit).all();

  // Strip out obvious non-creators (restaurants/brands) by simple heuristic on biography.
  // The owner can refine the rule later; this is a "good defaults" pass.
  const NON_CREATOR_HINTS = [
    'reservation', 'reservations', 'order online', 'for orders', 'franchise', 'menu',
    'pre-order', 'pre order', 'whatsapp to order', 'dm to order', 'private celebrations',
    'restaurant ', 'bar ', 'lounge ', 'cafe ', 'patisserie', 'boulangerie',
    'kitchen and bar', 'kitchen & bar', 'pub /', 'pub/', 'hotel ', 'rooftop',
    'bridal', 'tailoring', 'salon', 'menswear', 'clothing brand', 'culinary academy',
  ];

  const items = [];
  for (const c of (r.results || [])) {
    const bio = (c.biography || '').toLowerCase();
    const fname = (c.full_name || '').toLowerCase();
    const isLikelyBrand = NON_CREATOR_HINTS.some(h => bio.includes(h) || fname.includes(h));

    // Try to extract first name for {first_name} placeholder
    let firstName = '';
    if (c.full_name) {
      // Strip emojis + special chars, take first word that looks like a name
      const cleaned = c.full_name
        .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/[|\-_·•★⭐👑📍🇮🇳]/g, ' ')
        .trim();
      const parts = cleaned.split(/\s+/).filter(p => p.length > 0 && /^[a-zA-Z]/.test(p));
      firstName = parts[0] || '';
    }

    // Pick best contact values
    let email = null, phone = null, whatsapp = null;
    try {
      const emails = JSON.parse(c.extracted_emails_json || '[]');
      if (emails.length) email = emails[0];
    } catch {}
    try {
      const phones = JSON.parse(c.extracted_phones_json || '[]');
      if (phones.length) phone = phones[0];
    } catch {}
    try {
      const wa = JSON.parse(c.extracted_whatsapp_json || '[]');
      if (wa.length) whatsapp = wa[0];
    } catch {}

    // Normalize phones to digits-only with India prefix
    const normPhone = (p) => {
      if (!p) return null;
      const d = String(p).replace(/\D/g, '');
      if (d.length === 10) return '91' + d;
      if (d.length === 12 && d.startsWith('91')) return d;
      if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1);
      return d.length >= 10 ? d : null;
    };
    phone = normPhone(phone);
    whatsapp = normPhone(whatsapp);

    items.push({
      handle: c.handle,
      full_name: c.full_name,
      first_name: firstName,
      followers_count: c.followers_count,
      engagement_rate: c.engagement_rate,
      profile_pic_url: c.profile_pic_url,
      biography: c.biography,
      category_name: c.category_name,
      tier: tierOf(c.followers_count),
      is_likely_brand: isLikelyBrand,
      contact: {
        email,
        phone,
        whatsapp: whatsapp || phone,  // fall back: phone usually works on WA
      },
      sent: {
        ig:    c.ig_sent_at    || null,
        wa:    c.wa_sent_at    || null,
        email: c.email_sent_at || null,
      },
      reply_state: c.reply_state || 'none',
    });
  }

  return json({
    success: true,
    count: items.length,
    creators: items.filter(c => !c.is_likely_brand),
    excluded_brands: items.filter(c => c.is_likely_brand).map(c => ({
      handle: c.handle, followers: c.followers_count
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────
// LOG-SEND — owner clicked a channel button → record the send
// ─────────────────────────────────────────────────────────────────────
async function actionLogSend(env, db, body) {
  const handle = (body.handle || '').toString().trim().replace(/^@/, '').toLowerCase();
  const channel = (body.channel || '').toString().trim();
  if (!handle) return json({ error: 'handle required' }, 400);
  if (!['ig','wa','email'].includes(channel)) return json({ error: 'invalid channel' }, 400);

  const snapshot = (body.snapshot_text || '').toString().slice(0, 4000);
  const contactValue = (body.contact_value || '').toString().slice(0, 200);

  // Upsert: insert if missing, otherwise bump send_count + sent_at
  await db.prepare(`
    INSERT INTO creator_outreach_log (handle, channel, sent_at, sent_by, send_count, snapshot_text, contact_value)
    VALUES (?, ?, datetime('now'), 'owner', 1, ?, ?)
    ON CONFLICT(handle, channel) DO UPDATE SET
      sent_at       = datetime('now'),
      send_count    = send_count + 1,
      snapshot_text = excluded.snapshot_text,
      contact_value = excluded.contact_value,
      updated_at    = datetime('now')
  `).bind(handle, channel, snapshot, contactValue).run();

  return json({ success: true, handle, channel });
}

// ─────────────────────────────────────────────────────────────────────
// MARK-REPLY — owner manually marks "they replied" / "they applied"
// ─────────────────────────────────────────────────────────────────────
async function actionMarkReply(env, db, body) {
  const handle = (body.handle || '').toString().trim().replace(/^@/, '').toLowerCase();
  const channel = (body.channel || 'ig').toString().trim();
  const state = (body.state || '').toString().trim();
  if (!handle) return json({ error: 'handle required' }, 400);
  if (!['none','replied','applied','declined','bounced'].includes(state)) {
    return json({ error: 'invalid state' }, 400);
  }

  await db.prepare(`
    INSERT INTO creator_outreach_log (handle, channel, reply_state, reply_at, notes)
    VALUES (?, ?, ?, datetime('now'), ?)
    ON CONFLICT(handle, channel) DO UPDATE SET
      reply_state = excluded.reply_state,
      reply_at    = datetime('now'),
      notes       = COALESCE(excluded.notes, notes),
      updated_at  = datetime('now')
  `).bind(handle, channel, state, body.notes || null).run();

  return json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────
// STATS — counters for the dashboard header
// ─────────────────────────────────────────────────────────────────────
async function actionStats(env, db) {
  const sentByChannel = await db.prepare(`
    SELECT channel, COUNT(*) c FROM creator_outreach_log WHERE sent_at IS NOT NULL GROUP BY channel
  `).all();
  const replied = await db.prepare(`
    SELECT reply_state, COUNT(DISTINCT handle) c FROM creator_outreach_log WHERE reply_state != 'none' GROUP BY reply_state
  `).all();
  return json({
    success: true,
    sent_by_channel: sentByChannel.results,
    replies: replied.results,
  });
}

// ─────────────────────────────────────────────────────────────────────
function tierOf(f) {
  f = f || 0;
  if (f < 1000)   return 'T0';
  if (f < 5000)   return 'T1';
  if (f < 15000)  return 'T2';
  if (f < 30000)  return 'T3';
  if (f < 60000)  return 'T4';
  if (f < 100000) return 'T5';
  if (f < 250000) return 'T6';
  return 'T7';
}

async function safeJson(req) { try { return await req.json(); } catch { return {}; } }
