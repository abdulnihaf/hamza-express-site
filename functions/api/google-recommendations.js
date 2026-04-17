// Google Ads Recommendations — /api/google-recommendations
// Surfaces Google's native recommendation feed (the same one you see in the
// Google Ads UI under "Recommendations") and lets the operator Apply or
// Dismiss each one in a single click.
//
// Why: Google's recommendations engine flags budget-limited campaigns, weak
// ad strength, missing sitelinks, bid tweaks, new keyword ideas, etc. It's
// genuinely useful — but only if you actually look at it. Pulling it into
// the cockpit means it shows up next to the metrics it's reacting to.
//
// Role boundary: this endpoint lives in /ops/google-cockpit/ (Nihaf only).
// Basheer's team never sees it. Every apply/dismiss lands in ads_control_log
// with actor attribution.
//
// ─── Requests ───────────────────────────────────────────────────────────
//   GET  /api/google-recommendations
//     → { items: [...], count }
//     Returns all active (non-dismissed) recommendations for the campaign,
//     with parsed title + current→potential metric delta per card.
//
//   GET  /api/google-recommendations?include_dismissed=1
//     → includes previously-dismissed recs (useful for audit)
//
//   POST /api/google-recommendations
//     body: {
//       action:       'apply' | 'dismiss',
//       resourceName: 'customers/3681710084/recommendations/<hash>',
//       actor:        'Nihaf' | 'Basheer' | 'Faheem' | 'System',
//       reason?:      'why',
//       // Some recs (KEYWORD, CAMPAIGN_BUDGET) accept an override at apply time.
//       // If omitted, Google uses its recommended default.
//       parameters?:  { ... type-specific ... }
//     }
//     → { success, result }
//
// ─── Apply endpoint shape (v23) ─────────────────────────────────────────
//   POST /customers/{cid}/recommendations:apply
//   {
//     "operations": [{ "resourceName": "...", "<type>Parameters": { ... } }]
//   }
//   POST /customers/{cid}/recommendations:dismiss
//   {
//     "operations": [{ "resourceName": "..." }]
//   }

const API = 'https://googleads.googleapis.com/v23';
const CID = '3681710084';
const CAMPAIGN_ID = '23748431244';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const token = await getToken(env);

    if (request.method === 'GET') {
      return await listRecs(token, env, new URL(request.url).searchParams);
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: 'Body must be JSON' }, 400);
      return await mutateRec(token, env, body);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}

// ─── GET: list recommendations ──────────────────────────────────────────
async function listRecs(token, env, params) {
  const includeDismissed = params.get('include_dismissed') === '1';

  const dismissedFilter = includeDismissed
    ? ''
    : 'AND recommendation.dismissed = FALSE';

  // Broad SELECT — most type-specific sub-fields are optional. Google
  // returns null for the ones that don't apply to a given recommendation's
  // type, so we can safely ask for all of them at once.
  const gaql = `
    SELECT
      recommendation.resource_name,
      recommendation.type,
      recommendation.dismissed,
      recommendation.campaign,
      recommendation.ad_group,
      recommendation.impact.base_metrics.impressions,
      recommendation.impact.base_metrics.clicks,
      recommendation.impact.base_metrics.cost_micros,
      recommendation.impact.base_metrics.conversions,
      recommendation.impact.potential_metrics.impressions,
      recommendation.impact.potential_metrics.clicks,
      recommendation.impact.potential_metrics.cost_micros,
      recommendation.impact.potential_metrics.conversions,
      recommendation.keyword_recommendation.keyword.text,
      recommendation.keyword_recommendation.keyword.match_type,
      recommendation.keyword_recommendation.recommended_cpc_bid_micros,
      recommendation.campaign_budget_recommendation.current_budget_amount_micros,
      recommendation.campaign_budget_recommendation.recommended_budget_amount_micros,
      recommendation.forecasting_campaign_budget_recommendation.current_budget_amount_micros,
      recommendation.forecasting_campaign_budget_recommendation.recommended_budget_amount_micros,
      recommendation.text_ad_recommendation.ad.final_urls,
      recommendation.text_ad_recommendation.ad.display_url,
      recommendation.keyword_match_type_recommendation.keyword.text,
      recommendation.keyword_match_type_recommendation.keyword.match_type,
      recommendation.keyword_match_type_recommendation.recommended_match_type
    FROM recommendation
    WHERE campaign.id = ${CAMPAIGN_ID}
      ${dismissedFilter}
  `;

  const rows = await query(token, env, gaql);
  const items = rows.map(parseRec);
  return json({
    success: true,
    count: items.length,
    items,
    campaignId: CAMPAIGN_ID,
    asOf: new Date().toISOString(),
  });
}

// ─── POST: apply / dismiss ──────────────────────────────────────────────
async function mutateRec(token, env, body) {
  const action = body.action;
  const resourceName = body.resourceName;
  const actor = (body.actor || 'unknown').toString().slice(0, 40);
  const reason = (body.reason || '').toString().slice(0, 200);

  if (!['apply', 'dismiss'].includes(action)) {
    return json({ error: `unknown action "${action}"` }, 400);
  }
  if (!resourceName || !resourceName.startsWith(`customers/${CID}/recommendations/`)) {
    return json({ error: 'resourceName required and must belong to this account' }, 400);
  }

  const start = Date.now();
  const endpoint = action === 'apply' ? 'recommendations:apply' : 'recommendations:dismiss';

  // Build the operation. For apply, we may pass type-specific parameters;
  // for now we rely on Google's recommended defaults unless caller provides
  // an override (future: surface editable bid/budget values in the UI).
  const operation = { resourceName };
  if (action === 'apply' && body.parameters) {
    Object.assign(operation, body.parameters);
  }

  const resp = await fetch(`${API}/customers/${CID}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operations: [operation] }),
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  const success = resp.ok;
  await audit(env, {
    platform: 'google',
    action: action === 'apply' ? 'rec_apply' : 'rec_dismiss',
    resource_id: resourceName,
    before: null,
    after: action === 'apply' ? (body.parameters || { default: true }) : null,
    actor, reason,
    success: success ? 1 : 0,
    error: success ? null : (data.error?.message || `HTTP ${resp.status}`),
    response: data,
  });

  if (!success) {
    return json({
      success: false,
      error: data.error?.message || `HTTP ${resp.status}`,
      details: data,
      latencyMs: Date.now() - start,
    }, 500);
  }

  return json({
    success: true,
    action,
    resourceName,
    result: data,
    latencyMs: Date.now() - start,
  });
}

// ─── Parser: turn raw GAQL row into a UI-ready card ─────────────────────
function parseRec(row) {
  const r = row.recommendation || {};
  const type = r.type || 'UNKNOWN';
  const base = r.impact?.baseMetrics || {};
  const pot  = r.impact?.potentialMetrics || {};

  // Build a readable title + subtitle per type. When we don't know the type
  // we fall back to "Google suggests: <type>" so new types still show up.
  const { title, subtitle, icon } = titleFor(type, r);

  return {
    resourceName: r.resourceName,
    type,
    dismissed: !!r.dismissed,
    title,
    subtitle,
    icon,
    campaign: r.campaign || null,
    adGroup: r.adGroup || null,
    impact: {
      base: {
        impressions: int(base.impressions),
        clicks: int(base.clicks),
        costINR: micros(base.costMicros),
        conversions: float(base.conversions),
      },
      potential: {
        impressions: int(pot.impressions),
        clicks: int(pot.clicks),
        costINR: micros(pot.costMicros),
        conversions: float(pot.conversions),
      },
      delta: {
        impressions: int(pot.impressions) - int(base.impressions),
        clicks: int(pot.clicks) - int(base.clicks),
        costINR: +(micros(pot.costMicros) - micros(base.costMicros)).toFixed(2),
        conversions: +(float(pot.conversions) - float(base.conversions)).toFixed(2),
      },
    },
    // Type-specific payload surfaces (optional, used for UI details)
    keyword: r.keywordRecommendation ? {
      text: r.keywordRecommendation.keyword?.text || '',
      matchType: r.keywordRecommendation.keyword?.matchType || '',
      recommendedBidINR: r.keywordRecommendation.recommendedCpcBidMicros
        ? +(parseInt(r.keywordRecommendation.recommendedCpcBidMicros) / 1e6).toFixed(2)
        : null,
    } : null,
    budget: r.campaignBudgetRecommendation || r.forecastingCampaignBudgetRecommendation
      ? parseBudgetRec(r.campaignBudgetRecommendation || r.forecastingCampaignBudgetRecommendation)
      : null,
    matchTypeRec: r.keywordMatchTypeRecommendation ? {
      text: r.keywordMatchTypeRecommendation.keyword?.text || '',
      fromMatch: r.keywordMatchTypeRecommendation.keyword?.matchType || '',
      toMatch: r.keywordMatchTypeRecommendation.recommendedMatchType || '',
    } : null,
  };
}

function parseBudgetRec(b) {
  if (!b) return null;
  const cur = b.currentBudgetAmountMicros ? +(parseInt(b.currentBudgetAmountMicros) / 1e6).toFixed(0) : null;
  const rec = b.recommendedBudgetAmountMicros ? +(parseInt(b.recommendedBudgetAmountMicros) / 1e6).toFixed(0) : null;
  return { currentINR: cur, recommendedINR: rec };
}

// Plain-English titles per rec type. Google's types list is long; we cover
// the common ones and fall back gracefully.
function titleFor(type, r) {
  const T = {
    KEYWORD: {
      icon: '🎯',
      title: 'Add a new keyword',
      subtitle: r.keywordRecommendation?.keyword?.text
        ? `"${r.keywordRecommendation.keyword.text}" (${r.keywordRecommendation.keyword.matchType || 'PHRASE'})`
        : 'Google found a keyword that matches your product',
    },
    KEYWORD_MATCH_TYPE: {
      icon: '🔁',
      title: 'Change keyword match type',
      subtitle: r.keywordMatchTypeRecommendation
        ? `"${r.keywordMatchTypeRecommendation.keyword?.text}" → ${r.keywordMatchTypeRecommendation.recommendedMatchType}`
        : '',
    },
    CAMPAIGN_BUDGET: {
      icon: '💰',
      title: 'Campaign is limited by budget',
      subtitle: 'Raising daily budget would capture more impressions',
    },
    FORECASTING_CAMPAIGN_BUDGET: {
      icon: '📈',
      title: 'Budget forecast',
      subtitle: 'Consider adjusting daily budget based on forecasted demand',
    },
    MOVE_UNUSED_BUDGET: {
      icon: '↔️',
      title: 'Move unused budget',
      subtitle: 'Shift spend from underperforming campaigns to this one',
    },
    TEXT_AD: {
      icon: '📝',
      title: 'Create a new ad',
      subtitle: 'Google suggests an additional ad variation',
    },
    RESPONSIVE_SEARCH_AD: {
      icon: '🤖',
      title: 'Create a responsive search ad',
      subtitle: 'A new RSA variation for this ad group',
    },
    RESPONSIVE_SEARCH_AD_ASSET: {
      icon: '✏️',
      title: 'Add headlines or descriptions',
      subtitle: 'Improve existing RSA coverage',
    },
    RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH: {
      icon: '💪',
      title: 'Improve ad strength',
      subtitle: 'Current RSA is rated below Good — Google has fixes',
    },
    SITELINK_ASSET: {
      icon: '🔗',
      title: 'Add sitelink extensions',
      subtitle: 'Extra links under your ad boost CTR',
    },
    CALLOUT_ASSET: {
      icon: '🏷️',
      title: 'Add callout extensions',
      subtitle: 'Short phrases highlighting what makes you different',
    },
    CALL_ASSET: {
      icon: '📞',
      title: 'Add a call extension',
      subtitle: 'Let customers tap-to-call directly from the ad',
    },
    STRUCTURED_SNIPPET_ASSET: {
      icon: '📋',
      title: 'Add structured snippets',
      subtitle: 'Lists of menu items / categories under the ad',
    },
    TARGET_CPA_OPT_IN: {
      icon: '🎯',
      title: 'Switch to Target CPA bidding',
      subtitle: 'Google optimises bids for conversion cost',
    },
    MAXIMIZE_CLICKS_OPT_IN: {
      icon: '👆',
      title: 'Switch to Maximise Clicks',
      subtitle: 'Let Google auto-bid for maximum click volume',
    },
    MAXIMIZE_CONVERSIONS_OPT_IN: {
      icon: '✅',
      title: 'Switch to Maximise Conversions',
      subtitle: 'Google optimises bids for conversion count',
    },
    USE_BROAD_MATCH_KEYWORD: {
      icon: '🌐',
      title: 'Try broad match keywords',
      subtitle: 'Reach more related searches',
    },
    LOWER_CPC: {
      icon: '⬇️',
      title: 'Lower your max CPC',
      subtitle: 'You could save money without losing clicks',
    },
    ENHANCED_CPC_OPT_IN: {
      icon: '⚡',
      title: 'Turn on Enhanced CPC',
      subtitle: 'Google adjusts your manual bids automatically',
    },
    SEARCH_PARTNERS_OPT_IN: {
      icon: '🤝',
      title: 'Opt in to Search Partners',
      subtitle: 'Show your ad on Google partner search sites',
    },
    DISPLAY_EXPANSION_OPT_IN: {
      icon: '📺',
      title: 'Opt in to Display expansion',
      subtitle: 'Extend reach to Google Display Network',
    },
    UPGRADE_LOCAL_CAMPAIGN_TO_PERFORMANCE_MAX: {
      icon: '⏫',
      title: 'Upgrade Local to Performance Max',
      subtitle: 'Unified campaign across all Google surfaces',
    },
  };
  return T[type] || {
    icon: '💡',
    title: `Google suggests: ${type.replace(/_/g, ' ').toLowerCase()}`,
    subtitle: '',
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────
async function getToken(env) {
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

async function query(token, env, gaql) {
  const resp = await fetch(`${API}/customers/${CID}/googleAds:search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: gaql }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`GAQL query failed (${resp.status}): ${t}`);
  }
  const data = await resp.json();
  return data.results || [];
}

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
      row.platform, row.action, row.resource_id || null,
      row.before != null ? JSON.stringify(row.before).slice(0, 2000) : null,
      row.after != null ? JSON.stringify(row.after).slice(0, 2000) : null,
      row.actor || null, row.reason || null,
      row.success ? 1 : 0, row.error || null, truncate(row.response),
    ).run();
  } catch (e) {
    console.error('ads_control_log (rec) insert failed:', e.message);
  }
}

function int(v) { return parseInt(v) || 0; }
function float(v) { return parseFloat(v) || 0; }
function micros(v) { return v ? +(parseInt(v) / 1000000).toFixed(2) : 0; }

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS });
}
