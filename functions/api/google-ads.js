// Google Ads API — Campaign Performance Metrics
// GET /api/google-ads?action=campaigns|metrics|today
// Requires secrets: GOOGLE_ADS_DEV_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';
const CUSTOMER_ID = '3681710084'; // 368-171-0084 without dashes

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'campaigns';

  try {
    // Get fresh access token
    const accessToken = await getAccessToken(env);

    switch (action) {
      case 'campaigns':
        return await getCampaigns(accessToken, env);
      case 'metrics':
        return await getCampaignMetrics(accessToken, env, url.searchParams);
      case 'today':
        return await getTodayMetrics(accessToken, env);
      case 'keywords':
        return await getKeywordIdeas(accessToken, env, url.searchParams);
      case 'keyword-volumes':
        return await getKeywordVolumes(accessToken, env, url.searchParams);
      default:
        return json({ error: 'Unknown action. Use: campaigns, metrics, today, keywords, keyword-volumes' }, 400);
    }
  } catch (err) {
    return json({ error: err.message, stack: err.stack }, 500);
  }
}

// OAuth2: Exchange refresh token for access token
async function getAccessToken(env) {
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
  if (!data.access_token) {
    throw new Error(`OAuth failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// Google Ads API query helper
async function queryGoogleAds(accessToken, env, query) {
  const resp = await fetch(
    `${GOOGLE_ADS_API}/customers/${CUSTOMER_ID}/googleAds:search`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Google Ads API error (${resp.status}): ${errorText}`);
  }

  const data = await resp.json();
  return data.results || [];
}

// Action: Get all campaigns with status
async function getCampaigns(accessToken, env) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      campaign_budget.type
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY campaign.id DESC
  `;

  const results = await queryGoogleAds(accessToken, env, query);

  const campaigns = results.map(r => ({
    id: r.campaign.id,
    name: r.campaign.name,
    status: r.campaign.status,
    type: r.campaign.advertisingChannelType,
    budgetMicros: r.campaignBudget?.amountMicros,
    budgetType: r.campaignBudget?.type,
    budgetINR: r.campaignBudget?.amountMicros ? (parseInt(r.campaignBudget.amountMicros) / 1000000).toFixed(2) : null,
  }));

  return json({ campaigns, count: campaigns.length });
}

// Action: Get campaign metrics for a date range
async function getCampaignMetrics(accessToken, env, params) {
  const from = params.get('from') || todayIST();
  const to = params.get('to') || todayIST();

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.interactions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  const results = await queryGoogleAds(accessToken, env, query);

  const campaigns = results.map(r => ({
    id: r.campaign.id,
    name: r.campaign.name,
    status: r.campaign.status,
    type: r.campaign.advertisingChannelType,
    impressions: parseInt(r.metrics.impressions) || 0,
    clicks: parseInt(r.metrics.clicks) || 0,
    costINR: r.metrics.costMicros ? (parseInt(r.metrics.costMicros) / 1000000).toFixed(2) : '0.00',
    conversions: parseFloat(r.metrics.conversions) || 0,
    ctr: r.metrics.ctr ? (parseFloat(r.metrics.ctr) * 100).toFixed(2) : '0.00',
    avgCPC: r.metrics.averageCpc ? (parseInt(r.metrics.averageCpc) / 1000000).toFixed(2) : '0.00',
    avgCPM: r.metrics.averageCpm ? (parseInt(r.metrics.averageCpm) / 1000000).toFixed(2) : '0.00',
    interactions: parseInt(r.metrics.interactions) || 0,
  }));

  // Aggregate totals
  const totals = {
    impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    costINR: campaigns.reduce((s, c) => s + parseFloat(c.costINR), 0).toFixed(2),
    conversions: campaigns.reduce((s, c) => s + c.conversions, 0),
    ctr: 0,
    avgCPC: 0,
    avgCPM: 0,
  };
  if (totals.impressions > 0) {
    totals.ctr = ((totals.clicks / totals.impressions) * 100).toFixed(2);
    totals.avgCPM = ((parseFloat(totals.costINR) / totals.impressions) * 1000).toFixed(2);
  }
  if (totals.clicks > 0) {
    totals.avgCPC = (parseFloat(totals.costINR) / totals.clicks).toFixed(2);
  }

  return json({ campaigns, totals, dateRange: { from, to } });
}

// Action: Get today's metrics (quick summary)
async function getTodayMetrics(accessToken, env) {
  const today = todayIST();

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date = '${today}'
      AND campaign.status != 'REMOVED'
  `;

  const results = await queryGoogleAds(accessToken, env, query);

  const campaigns = results.map(r => ({
    name: r.campaign.name,
    status: r.campaign.status,
    impressions: parseInt(r.metrics.impressions) || 0,
    clicks: parseInt(r.metrics.clicks) || 0,
    costINR: r.metrics.costMicros ? (parseInt(r.metrics.costMicros) / 1000000).toFixed(2) : '0.00',
    conversions: parseFloat(r.metrics.conversions) || 0,
    ctr: r.metrics.ctr ? (parseFloat(r.metrics.ctr) * 100).toFixed(2) : '0.00',
    avgCPC: r.metrics.averageCpc ? (parseInt(r.metrics.averageCpc) / 1000000).toFixed(2) : '0.00',
  }));

  const totals = {
    impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    costINR: campaigns.reduce((s, c) => s + parseFloat(c.costINR), 0).toFixed(2),
    conversions: campaigns.reduce((s, c) => s + c.conversions, 0),
  };

  return json({ date: today, campaigns, totals });
}

// Action: Get keyword ideas with search volumes from Keyword Planner
// Usage: /api/google-ads?action=keywords&seeds=biryani+shivajinagar,ghee+rice,kabab+near+me
// Optional: &location=1007768 (default: Bangalore), &language=1000 (default: English)
async function getKeywordIdeas(accessToken, env, params) {
  const seedsParam = params.get('seeds') || 'biryani shivajinagar,restaurant shivajinagar';
  const seeds = seedsParam.split(',').map(s => s.trim());
  const locationId = params.get('location') || '1007768'; // 1007768 = Bangalore
  const languageId = params.get('language') || '1000'; // 1000 = English

  // Keyword Planner API — generateKeywordIdeas
  const resp = await fetch(
    `${GOOGLE_ADS_API}/customers/${CUSTOMER_ID}:generateKeywordIdeas`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywordSeed: { keywords: seeds },
        geoTargetConstants: [`geoTargetConstants/${locationId}`],
        language: `languageConstants/${languageId}`,
        keywordPlanNetwork: 'GOOGLE_SEARCH',
        includeAdultKeywords: false,
      }),
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Keyword Planner error (${resp.status}): ${errorText}`);
  }

  const data = await resp.json();
  const results = (data.results || []).map(r => {
    const metrics = r.keywordIdeaMetrics || {};
    return {
      keyword: r.text || '',
      avgMonthlySearches: parseInt(metrics.avgMonthlySearches) || 0,
      competition: metrics.competition || 'UNSPECIFIED',
      competitionIndex: parseInt(metrics.competitionIndex) || 0,
      lowTopOfPageBidMicros: metrics.lowTopOfPageBidMicros ? (parseInt(metrics.lowTopOfPageBidMicros) / 1000000).toFixed(2) : null,
      highTopOfPageBidMicros: metrics.highTopOfPageBidMicros ? (parseInt(metrics.highTopOfPageBidMicros) / 1000000).toFixed(2) : null,
      monthlySearchVolumes: (metrics.monthlySearchVolumes || []).slice(-6).map(m => ({
        month: m.month, year: m.year, searches: parseInt(m.monthlySearches) || 0,
      })),
    };
  });

  // Sort by volume descending
  results.sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches);

  return json({
    seeds,
    location: locationId === '1007768' ? 'Bangalore' : locationId,
    language: languageId === '1000' ? 'English' : languageId,
    totalIdeas: results.length,
    keywords: results,
  });
}

// Also: Get historical metrics for SPECIFIC keywords (exact volumes)
// Usage: /api/google-ads?action=keyword-volumes&keywords=biryani+shivajinagar,ghee+rice+bangalore
async function getKeywordVolumes(accessToken, env, params) {
  const keywordsParam = params.get('keywords') || '';
  if (!keywordsParam) return json({ error: 'keywords param required' }, 400);
  const keywords = keywordsParam.split(',').map(s => s.trim());
  const locationId = params.get('location') || '1007768';
  const languageId = params.get('language') || '1000';

  const resp = await fetch(
    `${GOOGLE_ADS_API}/customers/${CUSTOMER_ID}:generateKeywordHistoricalMetrics`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywords,
        geoTargetConstants: [`geoTargetConstants/${locationId}`],
        language: `languageConstants/${languageId}`,
        keywordPlanNetwork: 'GOOGLE_SEARCH',
      }),
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Keyword Historical Metrics error (${resp.status}): ${errorText}`);
  }

  const data = await resp.json();
  const results = (data.results || []).map(r => {
    const metrics = r.keywordMetrics || {};
    return {
      keyword: r.text || '',
      avgMonthlySearches: parseInt(metrics.avgMonthlySearches) || 0,
      competition: metrics.competition || 'UNSPECIFIED',
      competitionIndex: parseInt(metrics.competitionIndex) || 0,
      lowBidINR: metrics.lowTopOfPageBidMicros ? (parseInt(metrics.lowTopOfPageBidMicros) / 1000000).toFixed(2) : null,
      highBidINR: metrics.highTopOfPageBidMicros ? (parseInt(metrics.highTopOfPageBidMicros) / 1000000).toFixed(2) : null,
      monthly: (metrics.monthlySearchVolumes || []).slice(-6).map(m => ({
        month: m.month, year: m.year, searches: parseInt(m.monthlySearches) || 0,
      })),
    };
  });

  return json({
    keywords: results,
    location: locationId === '1007768' ? 'Bangalore' : locationId,
  });
}

// Helpers
function todayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  return ist.toISOString().split('T')[0];
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
