// Unified ads control surface — /api/ads-control
// One POST endpoint to pause/resume campaigns, change budgets, tweak bids,
// and add negative keywords across Meta (CTWA) + Google Ads.
//
// Why: the three dashboards (leads, ctwa-cockpit, google-cockpit) all need to
// *act* on ad state, not just view it. Instead of scattering mutation code
// everywhere, every change flows through here and lands in one audit table
// (ads_control_log) so we always know who changed what when.
//
// ─── Requests ───────────────────────────────────────────────────────────
//   POST /api/ads-control
//   body: {
//     platform: 'meta' | 'google',
//     action:   'pause' | 'resume' | 'budget' | 'bid' | 'negative' | 'status',
//     id:       <resource id> (campaign / adset / adgroup / criterion),
//     value:    <new value>    (number for budget/bid, string for negative kw),
//     actor?:   'Basheer' | 'Faheem' | 'Nihaf' | 'System',
//     reason?:  'why this change'
//   }
//
//   GET /api/ads-control?action=log&limit=50
//   → returns last N audit rows
//
// ─── Meta mappings (Graph API v25.0) ────────────────────────────────────
//   pause/resume campaign → POST /{campaign_id}  status=PAUSED|ACTIVE
//   budget on campaign   → POST /{campaign_id}  daily_budget=<paise>
//   budget on adset      → POST /{adset_id}    daily_budget=<paise>
//   bid on adset         → POST /{adset_id}    bid_amount=<paise>
//   negative keywords    → Meta CTWA uses audience targeting, not keywords.
//                          We do NOT implement Meta negative keywords here —
//                          it would require mutating targeting_spec, which is
//                          risky and almost never what the operator wants at
//                          2PM on a service day. Returns 400.
//
// ─── Google mappings (v23 mutate) ───────────────────────────────────────
//   pause/resume campaign → campaigns:mutate  update status
//   budget on campaign    → look up linked campaign_budget, then
//                           campaignBudgets:mutate  update amount_micros
//   bid on adGroup        → adGroups:mutate   update cpc_bid_micros
//   bid on criterion      → adGroupCriteria:mutate  update cpc_bid_micros
//   negative keyword      → campaignCriteria:mutate  create negative=true
//
// INR handling:
//   Meta account is INR — minor unit is paise, so ₹1500 = 150000.
//   Google API uses micros — ₹1500 = 1,500,000,000 micros.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';
const GOOGLE_CUSTOMER_ID = '3681710084';
const META_API = 'https://graph.facebook.com/v25.0';

// Known campaign IDs — used when id param omitted
const DEFAULT_META_CAMPAIGN = '120243729366800505';
const DEFAULT_GOOGLE_CAMPAIGN = '23748431244';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(request.url);

  // ── GET: audit log viewer ──
  if (request.method === 'GET') {
    const sub = url.searchParams.get('action');
    if (sub === 'log') return await getLog(env, url.searchParams);
    return json({
      error: 'Use POST to mutate. GET supports ?action=log for the audit feed.',
      actions: ['pause', 'resume', 'budget', 'bid', 'negative'],
    }, 400);
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  const { platform, action } = body || {};
  if (!platform || !action) {
    return json({ error: 'platform and action required' }, 400);
  }
  if (!['meta', 'google'].includes(platform)) {
    return json({ error: `unknown platform "${platform}"` }, 400);
  }
  if (!['pause', 'resume', 'budget', 'bid', 'negative', 'status'].includes(action)) {
    return json({ error: `unknown action "${action}"` }, 400);
  }

  // Dispatch + audit
  const actor = (body.actor || 'unknown').toString().slice(0, 40);
  const reason = (body.reason || '').toString().slice(0, 200);
  const start = Date.now();

  try {
    const result = platform === 'meta'
      ? await doMeta(env, action, body)
      : await doGoogle(env, action, body);

    await audit(env, {
      platform, action,
      resource_id: result.resourceId || body.id || null,
      before: result.before, after: result.after,
      actor, reason, success: 1, response: result.raw,
    });

    return json({
      success: true,
      platform, action,
      resourceId: result.resourceId,
      before: result.before,
      after: result.after,
      latencyMs: Date.now() - start,
    });
  } catch (err) {
    await audit(env, {
      platform, action,
      resource_id: body.id || null,
      before: null, after: body.value ?? null,
      actor, reason, success: 0, error: err.message,
    });
    return json({
      success: false, platform, action,
      error: err.message,
      latencyMs: Date.now() - start,
    }, 500);
  }
}

// ═══ Meta dispatch ══════════════════════════════════════════════════════
async function doMeta(env, action, body) {
  const token = env.WA_ACCESS_TOKEN;
  if (!token) throw new Error('WA_ACCESS_TOKEN not set');

  const id = (body.id || DEFAULT_META_CAMPAIGN).toString();

  if (action === 'pause' || action === 'resume') {
    const status = action === 'pause' ? 'PAUSED' : 'ACTIVE';
    const before = await metaGet(id, 'status,effective_status', token);
    const raw = await metaPost(id, { status }, token);
    const after = await metaGet(id, 'status,effective_status', token);
    return { resourceId: id, before, after, raw };
  }

  if (action === 'status') {
    const data = await metaGet(id, 'name,status,effective_status,daily_budget,budget_remaining', token);
    return { resourceId: id, before: null, after: data, raw: data };
  }

  if (action === 'budget') {
    const rupees = parseFloat(body.value);
    if (!isFinite(rupees) || rupees < 50) throw new Error('budget must be >= ₹50');
    // Meta INR account → paise (×100)
    const paise = Math.round(rupees * 100).toString();
    const before = await metaGet(id, 'daily_budget', token);
    const raw = await metaPost(id, { daily_budget: paise }, token);
    const after = await metaGet(id, 'daily_budget', token);
    return { resourceId: id, before, after, raw };
  }

  if (action === 'bid') {
    const rupees = parseFloat(body.value);
    if (!isFinite(rupees) || rupees <= 0) throw new Error('bid must be > 0');
    const paise = Math.round(rupees * 100).toString();
    const before = await metaGet(id, 'bid_amount,bid_strategy', token);
    const raw = await metaPost(id, { bid_amount: paise }, token);
    const after = await metaGet(id, 'bid_amount,bid_strategy', token);
    return { resourceId: id, before, after, raw };
  }

  if (action === 'negative') {
    throw new Error(
      'Meta CTWA does not use negative keywords — adjust ad-set targeting via the Meta UI instead'
    );
  }

  throw new Error(`meta action ${action} not implemented`);
}

async function metaGet(id, fields, token) {
  const resp = await fetch(`${META_API}/${id}?fields=${encodeURIComponent(fields)}&access_token=${token}`);
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Meta GET ${id} failed: ${data.error?.message || resp.status}`);
  return data;
}

async function metaPost(id, params, token) {
  const form = new URLSearchParams({ ...params, access_token: token });
  const resp = await fetch(`${META_API}/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(`Meta POST ${id} failed: ${data.error?.message || resp.status}`);
  }
  return data;
}

// ═══ Google dispatch ════════════════════════════════════════════════════
async function doGoogle(env, action, body) {
  const accessToken = await getGoogleToken(env);
  const id = (body.id || DEFAULT_GOOGLE_CAMPAIGN).toString();

  if (action === 'pause' || action === 'resume') {
    const status = action === 'pause' ? 'PAUSED' : 'ENABLED';
    const before = await googleQuery(accessToken, env,
      `SELECT campaign.id, campaign.status FROM campaign WHERE campaign.id = '${id}'`);
    const resourceName = `customers/${GOOGLE_CUSTOMER_ID}/campaigns/${id}`;
    const raw = await googleMutate(accessToken, env, 'campaigns', [{
      update: { resourceName, status },
      updateMask: 'status',
    }]);
    return {
      resourceId: id,
      before: before[0]?.campaign || null,
      after: { id, status },
      raw,
    };
  }

  if (action === 'status') {
    const rows = await googleQuery(accessToken, env, `
      SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status,
             campaign.primary_status, campaign_budget.amount_micros
      FROM campaign WHERE campaign.id = '${id}'`);
    return { resourceId: id, before: null, after: rows[0] || null, raw: rows };
  }

  if (action === 'budget') {
    const rupees = parseFloat(body.value);
    if (!isFinite(rupees) || rupees < 50) throw new Error('budget must be >= ₹50');
    const micros = Math.round(rupees * 1e6).toString();

    // Find the linked budget resource name for this campaign
    const rows = await googleQuery(accessToken, env,
      `SELECT campaign_budget.resource_name, campaign_budget.amount_micros
         FROM campaign WHERE campaign.id = '${id}'`);
    const budgetResource = rows[0]?.campaignBudget?.resourceName;
    const beforeMicros = rows[0]?.campaignBudget?.amountMicros;
    if (!budgetResource) throw new Error(`No budget linked to campaign ${id}`);

    const raw = await googleMutate(accessToken, env, 'campaignBudgets', [{
      update: { resourceName: budgetResource, amountMicros: micros },
      updateMask: 'amount_micros',
    }]);
    return {
      resourceId: id,
      before: { amountMicros: beforeMicros, amountINR: beforeMicros ? parseInt(beforeMicros) / 1e6 : null },
      after:  { amountMicros: micros,       amountINR: rupees },
      raw,
    };
  }

  if (action === 'bid') {
    const rupees = parseFloat(body.value);
    if (!isFinite(rupees) || rupees <= 0) throw new Error('bid must be > 0');
    const micros = Math.round(rupees * 1e6).toString();
    const scope = body.scope || 'ad_group';  // 'ad_group' | 'keyword'

    if (scope === 'keyword') {
      // id is "adGroupId~criterionId"  e.g.  "180123~987654321"
      const [agId, critId] = id.split('~');
      if (!agId || !critId) throw new Error('keyword bid id must be "<adGroupId>~<criterionId>"');
      const resourceName = `customers/${GOOGLE_CUSTOMER_ID}/adGroupCriteria/${agId}~${critId}`;
      const raw = await googleMutate(accessToken, env, 'adGroupCriteria', [{
        update: { resourceName, cpcBidMicros: micros },
        updateMask: 'cpc_bid_micros',
      }]);
      return { resourceId: id, before: null, after: { cpcBidINR: rupees }, raw };
    }

    // default: ad group bid
    const resourceName = `customers/${GOOGLE_CUSTOMER_ID}/adGroups/${id}`;
    const before = await googleQuery(accessToken, env,
      `SELECT ad_group.id, ad_group.cpc_bid_micros FROM ad_group WHERE ad_group.id = '${id}'`);
    const raw = await googleMutate(accessToken, env, 'adGroups', [{
      update: { resourceName, cpcBidMicros: micros },
      updateMask: 'cpc_bid_micros',
    }]);
    return {
      resourceId: id,
      before: before[0]?.adGroup || null,
      after: { cpcBidMicros: micros, cpcBidINR: rupees },
      raw,
    };
  }

  if (action === 'negative') {
    const text = (body.value || '').toString().trim();
    if (!text) throw new Error('negative keyword text required in value');
    const matchType = (body.matchType || 'PHRASE').toUpperCase();
    if (!['PHRASE', 'EXACT', 'BROAD'].includes(matchType)) {
      throw new Error('matchType must be PHRASE | EXACT | BROAD');
    }
    const campaignResource = `customers/${GOOGLE_CUSTOMER_ID}/campaigns/${id}`;
    const raw = await googleMutate(accessToken, env, 'campaignCriteria', [{
      create: {
        campaign: campaignResource,
        negative: true,
        keyword: { text, matchType },
      },
    }]);
    return {
      resourceId: id,
      before: null,
      after: { campaign: id, negativeKeyword: text, matchType },
      raw,
    };
  }

  throw new Error(`google action ${action} not implemented`);
}

async function getGoogleToken(env) {
  if (!env.GOOGLE_ADS_CLIENT_ID || !env.GOOGLE_ADS_REFRESH_TOKEN) {
    throw new Error('Google Ads OAuth env missing');
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Google OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function googleQuery(accessToken, env, query) {
  const resp = await fetch(`${GOOGLE_ADS_API}/customers/${GOOGLE_CUSTOMER_ID}/googleAds:search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`Google query failed (${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  return data.results || [];
}

async function googleMutate(accessToken, env, resource, operations) {
  const resp = await fetch(`${GOOGLE_ADS_API}/customers/${GOOGLE_CUSTOMER_ID}/${resource}:mutate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operations }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Google mutate ${resource} failed (${resp.status}): ${text}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ═══ Audit log ══════════════════════════════════════════════════════════
async function audit(env, row) {
  if (!env.DB) return;
  try {
    const truncate = s => {
      if (s == null) return null;
      const str = typeof s === 'string' ? s : JSON.stringify(s);
      return str.length > 2000 ? str.slice(0, 2000) + '…' : str;
    };
    await env.DB.prepare(`
      INSERT INTO ads_control_log
        (platform, action, resource_id, before_val, after_val,
         actor, reason, success, error, response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.platform,
      row.action,
      row.resource_id || null,
      row.before != null ? JSON.stringify(row.before).slice(0, 2000) : null,
      row.after != null ? JSON.stringify(row.after).slice(0, 2000) : null,
      row.actor || null,
      row.reason || null,
      row.success ? 1 : 0,
      row.error || null,
      truncate(row.response),
    ).run();
  } catch (e) {
    // Audit failures never block the actual ad change — they surface as response latency.
    console.error('ads_control_log insert failed:', e.message);
  }
}

async function getLog(env, params) {
  if (!env.DB) return json({ items: [], note: 'DB binding missing' });
  const limit = Math.min(parseInt(params.get('limit') || '50', 10) || 50, 500);
  const platform = params.get('platform');
  const action = params.get('action');
  const where = [];
  const binds = [];
  if (platform) { where.push('platform = ?'); binds.push(platform); }
  if (action)   { where.push('action = ?');   binds.push(action); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rs = await env.DB.prepare(`
    SELECT id, ts, platform, action, resource_id, before_val, after_val,
           actor, reason, success, error
      FROM ads_control_log
    ${whereSql}
    ORDER BY id DESC
    LIMIT ?
  `).bind(...binds, limit).all();

  const items = (rs.results || []).map(r => ({
    id: r.id,
    ts: r.ts,
    platform: r.platform,
    action: r.action,
    resourceId: r.resource_id,
    before: safeParse(r.before_val),
    after: safeParse(r.after_val),
    actor: r.actor,
    reason: r.reason,
    success: !!r.success,
    error: r.error,
  }));
  return json({ items, count: items.length });
}

function safeParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return s; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: CORS,
  });
}
