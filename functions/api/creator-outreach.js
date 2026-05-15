// /api/creator-outreach — Backend for the manual outreach control page.
import { sendEmail } from './_lib/email-sender.js';
import { buildOutreachEmail } from './_lib/email-templates.js';

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
      if (action === 'list')         return await actionList(env, db, url);
      if (action === 'stats')        return await actionStats(env, db);
      if (action === 'load-config')  return await actionLoadConfig(env, db);
      if (action === 'campaign')     return await actionCampaign(env, db, url);
    }
    if (request.method === 'POST') {
      const body = await safeJson(request);
      if (!requireOwner(env, request, body)) return json({ error: 'unauthorized' }, 401);
      if (action === 'log-send')        return await actionLogSend(env, db, body);
      if (action === 'mark-reply')      return await actionMarkReply(env, db, body);
      if (action === 'save-config')     return await actionSaveConfig(env, db, body);
      if (action === 'send-bulk-email') return await actionSendBulkEmail(env, db, body);
      if (action === 'send-bulk-whatsapp') return await actionSendBulkWhatsApp(env, db, body);
      if (action === 'send-campaign-email') return await actionSendCampaignEmail(env, db, body);
      if (action === 'send-campaign-whatsapp') return await actionSendCampaignWhatsApp(env, db, body);
      if (action === 'test-email')         return await actionTestEmail(env, db, body);
      if (action === 'test-whatsapp')      return await actionTestWhatsApp(env, db, body);
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

function normPhone(p) {
  if (!p) return null;
  const d = String(p).replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1);
  return d.length >= 10 ? d : null;
}

function firstCsvValue(v) {
  return String(v || '').split(/[;,]/).map(s => s.trim()).filter(Boolean)[0] || null;
}

function firstNameFrom(fullName, handle) {
  if (fullName) {
    const cleaned = String(fullName)
      .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/[|\-_·•★⭐👑📍🇮🇳]/g, ' ').trim();
    const parts = cleaned.split(/\s+/).filter(p => p.length && /^[a-zA-Z]/.test(p));
    if (parts[0]) return parts[0];
  }
  return (handle || 'there').split(/[._]/)[0] || 'there';
}

async function loadJsonConfig(db, key) {
  const head = await db.prepare(
    `SELECT config_value FROM programme_config WHERE config_key = ?`
  ).bind(key).first();
  if (!head?.config_value) return null;

  let meta;
  try { meta = JSON.parse(head.config_value); } catch { meta = null; }
  if (meta?.encoding === 'plain-json-chunks') {
    const chunkPrefix = key + '__chunk_';
    const rows = await db.prepare(`
      SELECT config_key, config_value
      FROM programme_config
      WHERE config_key >= ? AND config_key < ?
      ORDER BY config_key
    `).bind(chunkPrefix, chunkPrefix + '\uffff').all();
    const text = (rows.results || []).map(r => r.config_value || '').join('');
    if (meta.chunks && (rows.results || []).length !== meta.chunks) {
      throw new Error(`campaign config ${key} incomplete: expected ${meta.chunks} chunks, got ${(rows.results || []).length}`);
    }
    return JSON.parse(text);
  }
  return meta;
}

async function campaignParts(db, includeReview = false) {
  const prefix = 'creator_campaign_2026_05_15';
  const [meta, creators, schedule, reviewMaster] = await Promise.all([
    loadJsonConfig(db, `${prefix}_meta`),
    loadJsonConfig(db, `${prefix}_creators`),
    loadJsonConfig(db, `${prefix}_schedule`),
    includeReview ? loadJsonConfig(db, `${prefix}_review_master`) : Promise.resolve(null),
  ]);
  if (!meta || !Array.isArray(creators)) {
    throw new Error('May 15 campaign payload missing from programme_config');
  }
  return { meta, creators, schedule: Array.isArray(schedule) ? schedule : [], reviewMaster };
}

function normalizeCampaignCreator(c, sentMap = {}) {
  const handle = String(c.username || c.handle || '').replace(/^@/, '').toLowerCase();
  const followers = Number(c.followers || c.followers_count || 0);
  const email = firstCsvValue(c.emails || c.email);
  const phone = normPhone(firstCsvValue(c.phones || c.phone));
  return {
    handle,
    full_name: c.full_name || '',
    first_name: firstNameFrom(c.full_name, handle),
    followers_count: followers,
    engagement_rate: null,
    profile_pic_url: '',
    biography: c.personalized_angle || c.bio || '',
    category_name: c.bucket_label || '',
    tier: tierOf(followers),
    campaign_rank: Number(c.rank || 0),
    campaign_priority: c.priority || '',
    campaign_bucket: c.bucket || '',
    campaign_bucket_label: c.bucket_label || '',
    contact_route: c.contact_route || '',
    route_instruction: c.route_instruction || '',
    tomorrow_slot: c.tomorrow_slot || '',
    external_url: c.external_url || '',
    instagram_url: c.instagram_url || (handle ? `https://www.instagram.com/${handle}` : ''),
    instagram_dm_url: c.instagram_dm_url || (handle ? `https://ig.me/m/${handle}` : ''),
    contact: { email, phone, whatsapp: phone },
    messages: {
      email_subject: c.email_subject || '',
      email_body: c.email_body || '',
      waba_body: c.waba_body || '',
      instagram_dm: c.instagram_dm || '',
    },
    sent: {
      ig: sentMap[handle]?.ig || null,
      wa: sentMap[handle]?.wa || null,
      email: sentMap[handle]?.email || null,
    },
    reply_state: sentMap[handle]?.reply_state || 'none',
    campaign_source: 'may15',
  };
}

async function sentStateForHandles(db, handles) {
  const unique = [...new Set(handles.map(h => String(h || '').toLowerCase()).filter(Boolean))];
  if (!unique.length) return {};
  const placeholders = unique.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT handle, channel, sent_at, reply_state
    FROM creator_outreach_log
    WHERE handle IN (${placeholders})
  `).bind(...unique).all();
  const map = {};
  for (const r of (rows.results || [])) {
    const h = String(r.handle || '').toLowerCase();
    if (!map[h]) map[h] = { reply_state: 'none' };
    if (r.sent_at) map[h][r.channel] = r.sent_at;
    if (r.reply_state && r.reply_state !== 'none') map[h].reply_state = r.reply_state;
  }
  return map;
}

async function actionCampaign(env, db, url) {
  const includeReview = url.searchParams.get('include_review') === '1';
  const parts = await campaignParts(db, includeReview);
  const handles = parts.creators.map(c => c.username || c.handle);
  const sentMap = await sentStateForHandles(db, handles);
  const creators = parts.creators.map(c => normalizeCampaignCreator(c, sentMap));
  return json({
    success: true,
    campaign_id: '2026-05-15',
    meta: parts.meta,
    count: creators.length,
    creators,
    schedule: parts.schedule,
    review_master: includeReview ? (parts.reviewMaster || []) : undefined,
  });
}

async function sendMarketingTemplate(env, phone, handle) {
  const url = `https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`;
  const chain = [
    { name: 'creator_outreach_invitation_v3', vars: [] },
    { name: 'creator_outreach_invitation_v2', vars: [{ type: 'text', text: handle }] },
    { name: 'creator_outreach_invitation_v1', vars: [{ type: 'text', text: handle }] },
  ];
  let lastErr = null;
  for (const t of chain) {
    const components = t.vars.length ? [{ type: 'body', parameters: t.vars }] : [];
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: { name: t.name, language: { code: 'en' }, components },
      }),
    });
    const data = await resp.json();
    if (resp.ok) return { ok: true, message_id: data?.messages?.[0]?.id, via: t.name };
    lastErr = { status: resp.status, error: data?.error };
    const code = data?.error?.code;
    if (code !== 132000 && code !== 132001 && code !== 132012) break;
  }
  return { ok: false, ...(lastErr || { error: 'unknown' }) };
}

// ─────────────────────────────────────────────────────────────────────
// TEST-EMAIL — sends the CURRENT saved template to a single address,
// using sample first_name/handle/tier values. Does NOT write to
// creator_outreach_log (bulk-send dedup state stays clean).
// Subject is prefixed "[TEST]" so the recipient knows.
// ─────────────────────────────────────────────────────────────────────
async function actionTestEmail(env, db, body) {
  const to = (body.to || '').toString().trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json({ error: 'invalid_email', detail: 'Expected a valid email like you@example.com' }, 400);
  }
  if (!env.GMAIL_REFRESH_TOKEN) {
    return json({ error: 'gmail_not_configured', detail: 'Run /api/email-auth first.' }, 500);
  }

  // Pull the same saved template the bulk send uses
  const cfgRows = await db.prepare(
    `SELECT config_key, config_value FROM programme_config WHERE config_key IN ('outreach_template_body','outreach_subject_email')`
  ).all();
  const cfg = {};
  for (const r of (cfgRows.results || [])) cfg[r.config_key] = r.config_value;
  const tmplBody = cfg.outreach_template_body;
  const tmplSubject = cfg.outreach_subject_email || 'An invitation from Hamza Express — est. 1918, Shivajinagar';
  if (!tmplBody) {
    return json({ error: 'template_not_set', detail: 'Save the outreach template via save-config first.' }, 400);
  }

  const payload = buildOutreachEmail({
    first_name: 'there',
    handle: 'test_creator',
    tier: 'T2 · Micro',
    full_name: 'Test Creator',
    body_text: tmplBody,
    subject: '[TEST] ' + tmplSubject,
  });

  const r = await sendEmail(env, {
    to,
    subject: payload.subject,
    html: payload.html,
    from_name: 'Abdul Nihaf',
  });

  if (!r.ok) {
    return json({
      error: 'send_failed',
      detail: r.error || JSON.stringify(r.detail || r).slice(0, 300),
    }, 500);
  }
  return json({ success: true, message_id: r.message_id, to });
}

// ─────────────────────────────────────────────────────────────────────
// TEST-WHATSAPP — sends the same Meta-approved Marketing template
// chain (creator_outreach_invitation_v3 → v2 → v1) that Bulk WA uses,
// with handle="test_creator". Single recipient, no log write.
// Costs ~₹0.78 per send (1 marketing conversation on WABA).
// ─────────────────────────────────────────────────────────────────────
async function actionTestWhatsApp(env, db, body) {
  const phoneRaw = (body.phone || '').toString();
  const digits = phoneRaw.replace(/\D/g, '');
  if (digits.length < 10) {
    return json({ error: 'invalid_phone', detail: 'Expected at least 10 digits.' }, 400);
  }
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) {
    return json({ error: 'waba_not_configured', detail: 'Set WA_ACCESS_TOKEN and WA_PHONE_ID secrets.' }, 500);
  }

  // Normalise to E.164-ish (no +). Same logic as bulk send.
  let normalized;
  if (digits.length === 10) normalized = '91' + digits;
  else if (digits.length === 12 && digits.startsWith('91')) normalized = digits;
  else if (digits.length === 11 && digits.startsWith('0')) normalized = '91' + digits.slice(1);
  else normalized = digits;

  const url = `https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`;
  const chain = [
    { name: 'creator_outreach_invitation_v3', vars: [] },
    { name: 'creator_outreach_invitation_v2', vars: [{ type: 'text', text: 'test_creator' }] },
    { name: 'creator_outreach_invitation_v1', vars: [{ type: 'text', text: 'test_creator' }] },
  ];
  let lastErr = null;
  for (const t of chain) {
    const components = t.vars.length ? [{ type: 'body', parameters: t.vars }] : [];
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalized,
        type: 'template',
        template: { name: t.name, language: { code: 'en' }, components },
      }),
    });
    const data = await resp.json();
    if (resp.ok) {
      return json({ success: true, message_id: data?.messages?.[0]?.id, via: t.name, to: normalized });
    }
    lastErr = { status: resp.status, error: data?.error };
    const code = data?.error?.code;
    // Fall through only on template-side errors (not-found, lang mismatch, var mismatch)
    if (code !== 132000 && code !== 132001 && code !== 132012) break;
  }
  return json({ error: 'send_failed', detail: lastErr }, 500);
}

// ─────────────────────────────────────────────────────────────────────
// SEND-CAMPAIGN-EMAIL — sends the prepared May 15 per-creator email copy.
// This uses the uploaded execution artifact as source of truth, not the
// generic saved template.
// ─────────────────────────────────────────────────────────────────────
async function actionSendCampaignEmail(env, db, body) {
  const handles = Array.isArray(body.handles)
    ? body.handles.map(h => String(h).replace(/^@/, '').toLowerCase()).filter(Boolean)
    : [];
  if (!handles.length) return json({ error: 'handles required' }, 400);
  if (!env.GMAIL_REFRESH_TOKEN) {
    return json({ error: 'gmail_not_configured', detail: 'Run /api/email-auth first.' }, 500);
  }
  const skipAlready = body.skip_already_emailed !== false;
  const parts = await campaignParts(db, false);
  const byHandle = new Map(parts.creators.map(c => [String(c.username || '').toLowerCase(), c]));
  const prior = await sentStateForHandles(db, handles);
  const summary = { sent: 0, skipped_not_in_campaign: 0, skipped_no_email: 0, skipped_already_emailed: 0, failed: 0 };
  const results = [];

  for (const handle of handles) {
    const raw = byHandle.get(handle);
    if (!raw) {
      summary.skipped_not_in_campaign++;
      results.push({ handle, status: 'skipped_not_in_campaign' });
      continue;
    }
    if (skipAlready && prior[handle]?.email) {
      summary.skipped_already_emailed++;
      results.push({ handle, status: 'skipped_already_emailed' });
      continue;
    }
    const c = normalizeCampaignCreator(raw);
    const email = c.contact.email;
    if (!email || !c.messages.email_body) {
      summary.skipped_no_email++;
      results.push({ handle, status: 'skipped_no_email' });
      continue;
    }

    const subject = c.messages.email_subject || 'Invitation from Hamza Express — HKP Road, Shivajinagar';
    const payload = buildOutreachEmail({
      first_name: c.first_name,
      handle,
      tier: c.tier,
      full_name: c.full_name || '',
      body_text: c.messages.email_body,
      subject,
    });
    const r = await sendEmail(env, {
      to: email,
      subject: payload.subject,
      html: payload.html,
      from_name: 'Abdul Nihaf',
    });
    if (r.ok) {
      summary.sent++;
      results.push({ handle, status: 'sent', message_id: r.message_id, email });
      try {
        await db.prepare(`
          INSERT INTO creator_outreach_log (handle, channel, sent_at, sent_by, send_count, snapshot_text, contact_value)
          VALUES (?, 'email', datetime('now'), 'campaign_may15', 1, ?, ?)
          ON CONFLICT(handle, channel) DO UPDATE SET
            sent_at=datetime('now'), send_count=send_count+1,
            snapshot_text=excluded.snapshot_text, contact_value=excluded.contact_value, updated_at=datetime('now')
        `).bind(handle, subject + '\n\n' + c.messages.email_body.slice(0, 1000), email).run();
      } catch {}
    } else {
      summary.failed++;
      results.push({ handle, status: 'failed', error: r.error || JSON.stringify(r.detail || r).slice(0, 200), email });
    }
    await new Promise(res => setTimeout(res, 250));
  }

  return json({ success: true, summary, results });
}

// ─────────────────────────────────────────────────────────────────────
// SEND-CAMPAIGN-WHATSAPP — sends the approved WABA template to May 15
// campaign creators that have a phone route.
// ─────────────────────────────────────────────────────────────────────
async function actionSendCampaignWhatsApp(env, db, body) {
  const handles = Array.isArray(body.handles)
    ? body.handles.map(h => String(h).replace(/^@/, '').toLowerCase()).filter(Boolean)
    : [];
  if (!handles.length) return json({ error: 'handles required' }, 400);
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) {
    return json({ error: 'waba_not_configured', detail: 'Set WA_ACCESS_TOKEN and WA_PHONE_ID secrets.' }, 500);
  }
  const skipAlready = body.skip_already_sent !== false;
  const parts = await campaignParts(db, false);
  const byHandle = new Map(parts.creators.map(c => [String(c.username || '').toLowerCase(), c]));
  const prior = await sentStateForHandles(db, handles);
  const summary = { sent: 0, skipped_not_in_campaign: 0, skipped_no_phone: 0, skipped_already_sent: 0, failed: 0 };
  const results = [];

  for (const handle of handles) {
    const raw = byHandle.get(handle);
    if (!raw) {
      summary.skipped_not_in_campaign++;
      results.push({ handle, status: 'skipped_not_in_campaign' });
      continue;
    }
    if (skipAlready && prior[handle]?.wa) {
      summary.skipped_already_sent++;
      results.push({ handle, status: 'skipped_already_sent' });
      continue;
    }
    const c = normalizeCampaignCreator(raw);
    const phone = c.contact.whatsapp || c.contact.phone;
    if (!phone) {
      summary.skipped_no_phone++;
      results.push({ handle, status: 'skipped_no_phone' });
      continue;
    }
    const r = await sendMarketingTemplate(env, phone, handle);
    if (r.ok) {
      summary.sent++;
      results.push({ handle, status: 'sent', message_id: r.message_id, via: r.via, phone });
      try {
        await db.prepare(`
          INSERT INTO creator_outreach_log (handle, channel, sent_at, sent_by, send_count, snapshot_text, contact_value)
          VALUES (?, 'wa', datetime('now'), 'campaign_may15', 1, ?, ?)
          ON CONFLICT(handle, channel) DO UPDATE SET
            sent_at=datetime('now'), send_count=send_count+1,
            snapshot_text=excluded.snapshot_text, contact_value=excluded.contact_value, updated_at=datetime('now')
        `).bind(handle, `${r.via} (May 15 campaign template)`, phone).run();
      } catch {}
    } else {
      summary.failed++;
      results.push({ handle, status: 'failed', error: r.error?.message || JSON.stringify(r.error || r).slice(0, 200), phone });
    }
    await new Promise(res => setTimeout(res, 300));
  }

  return json({ success: true, summary, results });
}

// ─────────────────────────────────────────────────────────────────────
// SEND-BULK-WHATSAPP — fires the Meta-approved MARKETING template
// `creator_outreach_invitation_v1` to selected creators via Cloud API.
//
// Template body has 1 var (handle). 1 URL button (static URL → /creators/).
// Idempotent: skips creators already sent on the WhatsApp channel unless
// body.skip_already_sent === false.
// ─────────────────────────────────────────────────────────────────────
async function actionSendBulkWhatsApp(env, db, body) {
  const handles = Array.isArray(body.handles) ? body.handles.filter(h => typeof h === 'string') : [];
  if (!handles.length) return json({ error: 'handles required' }, 400);
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) {
    return json({ error: 'waba_not_configured', detail: 'Set WA_ACCESS_TOKEN and WA_PHONE_ID secrets.' }, 500);
  }
  const skipAlready = body.skip_already_sent !== false;

  const placeholders = handles.map(() => '?').join(',');
  const cre = await db.prepare(`
    SELECT bp.username, bp.full_name, bp.followers_count,
           bp.extracted_phones_json, bp.extracted_whatsapp_json,
           (SELECT sent_at FROM creator_outreach_log WHERE handle=bp.username AND channel='wa') AS wa_sent_at
    FROM influencer_bio_pulse bp
    WHERE bp.username IN (${placeholders})
  `).bind(...handles).all();

  const summary = { sent: 0, skipped_no_phone: 0, skipped_already_sent: 0, failed: 0 };
  const results = [];

  // Phone normaliser
  const normPhone = (p) => {
    if (!p) return null;
    const d = String(p).replace(/\D/g, '');
    if (d.length === 10) return '91' + d;
    if (d.length === 12 && d.startsWith('91')) return d;
    if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1);
    return d.length >= 10 ? d : null;
  };

  // Send template helper. Chain v3 → v2 → v1.
  //   v3: "Greetings!" opener, ZERO body vars. Auto-prefers when Meta approves.
  //   v2: "Hi @{{1}}" with handle (currently default).
  //   v1: older copy, last fallback.
  async function sendMarketingTemplate(phone, handle) {
    const url = `https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`;
    const chain = [
      { name: 'creator_outreach_invitation_v3', vars: [] },
      { name: 'creator_outreach_invitation_v2', vars: [{ type: 'text', text: handle }] },
      { name: 'creator_outreach_invitation_v1', vars: [{ type: 'text', text: handle }] },
    ];
    let lastErr = null;
    for (const t of chain) {
      const components = t.vars.length
        ? [{ type: 'body', parameters: t.vars }]
        : [];
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: { name: t.name, language: { code: 'en' }, components },
        }),
      });
      const data = await resp.json();
      if (resp.ok) return { ok: true, message_id: data?.messages?.[0]?.id, via: t.name };
      lastErr = { status: resp.status, error: data?.error };
      const code = data?.error?.code;
      // Fall through only on template-side errors (132000 not-found, 132001 lang
      // mismatch, 132012 var mismatch). Recipient-side errors stop retrying.
      if (code !== 132000 && code !== 132001 && code !== 132012) break;
    }
    return { ok: false, ...(lastErr || { error: 'unknown' }) };
  }

  for (const c of (cre.results || [])) {
    if (skipAlready && c.wa_sent_at) {
      summary.skipped_already_sent++;
      results.push({ handle: c.username, status: 'skipped_already_sent' });
      continue;
    }
    let phone = null;
    try {
      const pl = JSON.parse(c.extracted_phones_json || '[]');
      if (pl.length) phone = pl[0];
    } catch {}
    if (!phone) {
      try {
        const wl = JSON.parse(c.extracted_whatsapp_json || '[]');
        if (wl.length) phone = wl[0];
      } catch {}
    }
    phone = normPhone(phone);
    if (!phone) {
      summary.skipped_no_phone++;
      results.push({ handle: c.username, status: 'skipped_no_phone' });
      continue;
    }

    const r = await sendMarketingTemplate(phone, c.username);
    if (r.ok) {
      summary.sent++;
      results.push({ handle: c.username, status: 'sent', message_id: r.message_id, phone });
      try {
        await db.prepare(`
          INSERT INTO creator_outreach_log (handle, channel, sent_at, sent_by, send_count, snapshot_text, contact_value)
          VALUES (?, 'wa', datetime('now'), 'bulk', 1, ?, ?)
          ON CONFLICT(handle, channel) DO UPDATE SET
            sent_at=datetime('now'), send_count=send_count+1,
            snapshot_text=excluded.snapshot_text, contact_value=excluded.contact_value, updated_at=datetime('now')
        `).bind(c.username, 'creator_outreach_invitation_v1 (Marketing template, handle=' + c.username + ')', phone).run();
      } catch {}
    } else {
      summary.failed++;
      results.push({ handle: c.username, status: 'failed', error: r.error?.message || JSON.stringify(r.error || r).slice(0, 200), phone });
    }
    await new Promise(res => setTimeout(res, 300));
  }

  return json({ success: true, summary, results });
}

// ─────────────────────────────────────────────────────────────────────
// LOAD-CONFIG — returns the persisted unified outreach template + subject
// (no auth required for read, since the values aren't secrets and the page
// itself is dashboard-key gated).
// ─────────────────────────────────────────────────────────────────────
async function actionLoadConfig(env, db) {
  const rows = await db.prepare(`SELECT config_key, config_value, updated_at FROM programme_config WHERE config_key IN ('outreach_template_body','outreach_subject_email')`).all();
  const cfg = {};
  for (const r of (rows.results || [])) cfg[r.config_key] = r.config_value;
  return json({ success: true, config: cfg });
}

// ─────────────────────────────────────────────────────────────────────
// SAVE-CONFIG — owner upserts unified outreach template + subject
// ─────────────────────────────────────────────────────────────────────
async function actionSaveConfig(env, db, body) {
  const updates = [];
  if (typeof body.template_body === 'string') {
    updates.push({ key: 'outreach_template_body', value: body.template_body });
  }
  if (typeof body.subject_email === 'string') {
    updates.push({ key: 'outreach_subject_email', value: body.subject_email });
  }
  if (!updates.length) return json({ error: 'nothing_to_save' }, 400);
  for (const u of updates) {
    await db.prepare(`
      INSERT INTO programme_config (config_key, config_value, updated_at, updated_by)
      VALUES (?, ?, datetime('now'), 'owner')
      ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value, updated_at=datetime('now'), updated_by='owner'
    `).bind(u.key, u.value).run();
  }
  return json({ success: true, saved: updates.map(u => u.key) });
}

// ─────────────────────────────────────────────────────────────────────
// SEND-BULK-EMAIL — fires the unified outreach email to a list of creator
// handles via Gmail API (using the existing nihaf@hnhotels.in OAuth setup).
//
// Body:
//   handles: ['rajbiswas56', 'foodonik', ...]   (required)
//   skip_already_emailed: boolean (default true) — won't re-send to handles
//                                                  with prior email send_at
// Returns:
//   summary: { sent, skipped_no_email, skipped_already_emailed, failed }
//   results: per-handle outcome
// ─────────────────────────────────────────────────────────────────────
async function actionSendBulkEmail(env, db, body) {
  const handles = Array.isArray(body.handles) ? body.handles.filter(h => typeof h === 'string') : [];
  if (!handles.length) return json({ error: 'handles required' }, 400);
  const skipAlreadyEmailed = body.skip_already_emailed !== false;

  // Load template + subject
  const cfgRows = await db.prepare(`SELECT config_key, config_value FROM programme_config WHERE config_key IN ('outreach_template_body','outreach_subject_email')`).all();
  const cfg = {};
  for (const r of (cfgRows.results || [])) cfg[r.config_key] = r.config_value;
  const tmplBody = cfg.outreach_template_body;
  const tmplSubject = cfg.outreach_subject_email || 'An invitation from Hamza Hotel — est. 1918, Shivajinagar';
  if (!tmplBody) return json({ error: 'template_not_set', detail: 'Save the outreach template via save-config first.' }, 400);

  if (!env.GMAIL_REFRESH_TOKEN) return json({ error: 'gmail_not_configured', detail: 'Run /api/email-auth first.' }, 500);

  // Hydrate creator details + prior email send state
  const placeholders = handles.map(() => '?').join(',');
  const cre = await db.prepare(`
    SELECT bp.username, bp.full_name, bp.followers_count,
           bp.extracted_emails_json,
           (SELECT sent_at FROM creator_outreach_log WHERE handle=bp.username AND channel='email') AS email_sent_at
    FROM influencer_bio_pulse bp
    WHERE bp.username IN (${placeholders})
  `).bind(...handles).all();

  const summary = { sent: 0, skipped_no_email: 0, skipped_already_emailed: 0, failed: 0 };
  const results = [];

  // Tier helper
  const tierOf = (f) => {
    f = f || 0;
    if (f < 1000)   return 'T0 · Newbie';
    if (f < 5000)   return 'T1 · Nano';
    if (f < 15000)  return 'T2 · Micro';
    if (f < 30000)  return 'T3 · Mid-Micro';
    if (f < 60000)  return 'T4 · Upper-Micro';
    if (f < 100000) return 'T5 · Macro-Micro';
    if (f < 250000) return 'T6 · Edge-Macro';
    return 'T7 · Macro';
  };

  // First-name extractor
  const firstName = (full_name, handle) => {
    if (full_name) {
      const cleaned = String(full_name)
        .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/[|\-_·•★⭐👑📍🇮🇳]/g, ' ').trim();
      const parts = cleaned.split(/\s+/).filter(p => p.length && /^[a-zA-Z]/.test(p));
      if (parts[0]) return parts[0];
    }
    return (handle || 'there').split(/[._]/)[0];
  };

  // Send sequentially with a small gap to be respectful of Gmail rate limits
  for (const c of (cre.results || [])) {
    if (skipAlreadyEmailed && c.email_sent_at) {
      summary.skipped_already_emailed++;
      results.push({ handle: c.username, status: 'skipped_already_emailed' });
      continue;
    }
    let email = null;
    try {
      const list = JSON.parse(c.extracted_emails_json || '[]');
      if (list.length) email = list[0];
    } catch {}
    if (!email) {
      summary.skipped_no_email++;
      results.push({ handle: c.username, status: 'skipped_no_email' });
      continue;
    }

    const fname = firstName(c.full_name, c.username);
    const tierLabel = tierOf(c.followers_count);
    const payload = buildOutreachEmail({
      first_name: fname,
      handle: c.username,
      tier: tierLabel,
      full_name: c.full_name || '',
      body_text: tmplBody,
      subject: tmplSubject,
    });

    const r = await sendEmail(env, {
      to: email,
      subject: payload.subject,
      html: payload.html,
      from_name: 'Abdul Nihaf',
    });

    if (r.ok) {
      summary.sent++;
      results.push({ handle: c.username, status: 'sent', message_id: r.message_id, email });
      // Log the send
      try {
        await db.prepare(`
          INSERT INTO creator_outreach_log (handle, channel, sent_at, sent_by, send_count, snapshot_text, contact_value)
          VALUES (?, 'email', datetime('now'), 'bulk', 1, ?, ?)
          ON CONFLICT(handle, channel) DO UPDATE SET
            sent_at=datetime('now'), send_count=send_count+1,
            snapshot_text=excluded.snapshot_text, contact_value=excluded.contact_value, updated_at=datetime('now')
        `).bind(c.username, payload.subject + '\n\n' + tmplBody.slice(0, 1000), email).run();
      } catch {}
    } else {
      summary.failed++;
      results.push({ handle: c.username, status: 'failed', error: r.error || JSON.stringify(r.detail || r).slice(0, 200), email });
    }
    // Small gap — avoid Gmail rate limit (200ms = max 5/sec, well under 250/sec quota)
    await new Promise(res => setTimeout(res, 250));
  }

  return json({ success: true, summary, results });
}
