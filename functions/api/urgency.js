// Cross-dashboard urgency bar — /api/urgency
// Aggregates signals that need a human action right now, across all 3 cockpits.
// Rendered as a thin strip at the top of /ops/leads/, /ops/ctwa-cockpit/, /ops/google-cockpit/.
//
// Severity: critical (red) > warning (orange) > info (blue)
// Each item has: { severity, source, text, action: <url>, count? }
//
// GET /api/urgency

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const META_CAMPAIGN_ID = '120243729366800505';
const META_DAILY_BUDGET_INR = 1500;
const GOOGLE_DAILY_BUDGET_INR = 500;
const GOOGLE_CUSTOMER_ID = '3681710084';
const GOOGLE_CAMPAIGN_ID = '23748431244';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const { env } = context;
  const db = env.DB;

  // Fire everything in parallel, swallow individual failures — urgency bar must never hard-fail.
  const [leadSignals, metaSignals, googleSignals] = await Promise.all([
    safe(() => leadUrgency(db)),
    safe(() => metaUrgency(env)),
    safe(() => googleUrgency(env)),
  ]);

  const items = [...(leadSignals || []), ...(metaSignals || []), ...(googleSignals || [])];
  // Sort: critical > warning > info, then by count desc
  const sevOrder = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => {
    const s = (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9);
    if (s !== 0) return s;
    return (b.count || 0) - (a.count || 0);
  });

  return new Response(JSON.stringify({
    success: true,
    items,
    count: items.length,
    generatedAt: new Date().toISOString(),
  }), { headers: CORS });
}

// ─── Lead-side signals ───────────────────────────────────────────────
async function leadUrgency(db) {
  const signals = [];

  // A. Leads stuck in payment > 30 min
  const stuckPay = await db.prepare(`
    SELECT COUNT(*) as n FROM leads
    WHERE stage = 'payment_pending'
      AND datetime(last_seen_at) < datetime('now', '-30 minutes')
      AND datetime(last_seen_at) > datetime('now', '-6 hours')
  `).first();
  if (stuckPay?.n > 0) {
    signals.push({
      severity: stuckPay.n >= 3 ? 'critical' : 'warning',
      source: 'leads',
      text: `${stuckPay.n} lead${stuckPay.n > 1 ? 's' : ''} stuck in payment >30min`,
      action: '/ops/leads/?filter=payment_pending',
      count: stuckPay.n,
    });
  }

  // B. Booking drops — try wa_sessions state (booking tables may not exist yet)
  const bookDrop = await db.prepare(`
    SELECT COUNT(*) as n FROM leads
    WHERE stage = 'booking_dropped'
      AND datetime(last_seen_at) > datetime('now', '-4 hours')
  `).first();
  if (bookDrop?.n > 0) {
    signals.push({
      severity: bookDrop.n >= 2 ? 'warning' : 'info',
      source: 'leads',
      text: `${bookDrop.n} booking drop${bookDrop.n > 1 ? 's' : ''} awaiting call`,
      action: '/ops/leads/?filter=booking_dropped',
      count: bookDrop.n,
    });
  }

  // C. Unassigned hot leads
  const unassigned = await db.prepare(`
    SELECT COUNT(*) as n FROM leads
    WHERE (assignee IS NULL OR assignee = '')
      AND status IN ('new', 'hot')
      AND stage IN ('engaged', 'payment_pending', 'booking_dropped')
      AND datetime(last_seen_at) > datetime('now', '-24 hours')
  `).first();
  if (unassigned?.n >= 3) {
    signals.push({
      severity: 'warning',
      source: 'leads',
      text: `${unassigned.n} hot leads unassigned`,
      action: '/ops/leads/',
      count: unassigned.n,
    });
  }

  // D. Fresh CTWA leads in last 5 min (someone scanned an ad NOW)
  const fresh = await db.prepare(`
    SELECT COUNT(*) as n FROM leads
    WHERE source = 'ctwa_paid'
      AND datetime(first_seen_at) > datetime('now', '-5 minutes')
  `).first();
  if (fresh?.n >= 2) {
    signals.push({
      severity: 'info',
      source: 'leads',
      text: `${fresh.n} new CTWA leads in last 5min — reply fast`,
      action: '/ops/leads/?filter=ctwa',
      count: fresh.n,
    });
  }

  return signals;
}

// ─── Meta Ads signals ────────────────────────────────────────────────
async function metaUrgency(env) {
  const token = env.WA_ACCESS_TOKEN;
  if (!token) return [];
  const signals = [];

  // Today's spend + frequency for campaign
  const nowIST = new Date(Date.now() + 5.5 * 3600 * 1000);
  const todayIST = nowIST.toISOString().slice(0, 10);
  const range = `time_range={"since":"${todayIST}","until":"${todayIST}"}`;

  const campResp = await fetch(
    `https://graph.facebook.com/v25.0/${META_CAMPAIGN_ID}/insights?${range}&fields=spend,frequency,cpm,cost_per_action_type&access_token=${token}`
  );
  if (campResp.ok) {
    const j = await campResp.json();
    const c = (j.data || [])[0] || {};
    const spend = parseFloat(c.spend || 0);
    const freq = parseFloat(c.frequency || 0);
    const pct = (spend / META_DAILY_BUDGET_INR) * 100;

    if (pct >= 90) {
      signals.push({
        severity: 'warning',
        source: 'meta',
        text: `Meta budget ${pct.toFixed(0)}% spent (₹${Math.round(spend)}/${META_DAILY_BUDGET_INR})`,
        action: '/ops/ctwa-cockpit/',
        count: Math.round(pct),
      });
    } else if (pct < 20 && nowIST.getHours() >= 18) {
      signals.push({
        severity: 'info',
        source: 'meta',
        text: `Meta underspending — only ₹${Math.round(spend)} used by ${nowIST.getHours()}h`,
        action: '/ops/ctwa-cockpit/',
      });
    }

    if (freq >= 3.5) {
      signals.push({
        severity: 'warning',
        source: 'meta',
        text: `Meta ad fatigue — frequency ${freq.toFixed(1)}x (audience saturated)`,
        action: '/ops/ctwa-cockpit/',
      });
    }
  }

  return signals;
}

// ─── Google Ads signals ──────────────────────────────────────────────
async function googleUrgency(env) {
  if (!env.GOOGLE_ADS_CLIENT_ID || !env.GOOGLE_ADS_REFRESH_TOKEN) return [];
  const signals = [];

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_ADS_CLIENT_ID,
        client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
        refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    const tokenJ = await tokenResp.json();
    if (!tokenJ.access_token) return signals;

    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const gaql = `
      SELECT
        campaign.status,
        campaign.serving_status,
        metrics.cost_micros,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share
      FROM campaign
      WHERE campaign.id = ${GOOGLE_CAMPAIGN_ID} AND segments.date = '${today}'
    `;
    const resp = await fetch(
      `https://googleads.googleapis.com/v23/customers/${GOOGLE_CUSTOMER_ID}/googleAds:search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenJ.access_token}`,
          'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: gaql }),
      }
    );
    if (!resp.ok) return signals;
    const j = await resp.json();
    const r = (j.results || [])[0];
    if (!r) return signals;

    const spend = (parseInt(r.metrics?.costMicros) || 0) / 1e6;
    const budgetLost = parseFloat(r.metrics?.searchBudgetLostImpressionShare || 0);
    const status = r.campaign?.status;
    const serving = r.campaign?.servingStatus;
    const pct = (spend / GOOGLE_DAILY_BUDGET_INR) * 100;

    if (status !== 'ENABLED') {
      signals.push({
        severity: 'critical',
        source: 'google',
        text: `Google campaign is ${status} — not running`,
        action: '/ops/google-cockpit/',
      });
    } else if (serving && serving !== 'SERVING' && serving !== 'ELIGIBLE') {
      signals.push({
        severity: 'warning',
        source: 'google',
        text: `Google serving status: ${serving}`,
        action: '/ops/google-cockpit/',
      });
    }

    if (pct >= 90) {
      signals.push({
        severity: 'warning',
        source: 'google',
        text: `Google budget ${pct.toFixed(0)}% spent (₹${Math.round(spend)}/${GOOGLE_DAILY_BUDGET_INR})`,
        action: '/ops/google-cockpit/',
        count: Math.round(pct),
      });
    }

    if (budgetLost > 0.15) {
      signals.push({
        severity: 'warning',
        source: 'google',
        text: `Losing ${(budgetLost * 100).toFixed(0)}% of Google impressions to low budget`,
        action: '/ops/google-cockpit/',
      });
    }
  } catch (e) {
    // Silent — urgency bar should not surface its own errors
  }
  return signals;
}

async function safe(fn) {
  try { return await fn(); } catch (e) { return []; }
}
