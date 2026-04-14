// Google Ads Cockpit API — Unified analytics for /ops/google-cockpit/
// GET /api/google-cockpit?period=today|7d|30d|all
// Returns: campaign KPIs, ad group breakdown, keyword performance, daily trend, search terms

const API = 'https://googleads.googleapis.com/v23';
const CID = '3681710084';
const CAMPAIGN_ID = '23748431244'; // HE — Ghee Rice & Kabab — Local Search

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const { env } = context;
  const url = new URL(context.request.url);
  const period = url.searchParams.get('period') || 'today';

  try {
    // OAuth
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
        refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) throw new Error('OAuth failed');
    const token = tokenData.access_token;
    const devToken = env.GOOGLE_ADS_DEV_TOKEN;

    // Date range
    const today = todayIST();
    let dateFilter;
    if (period === 'today') dateFilter = `segments.date = '${today}'`;
    else if (period === '7d') dateFilter = `segments.date BETWEEN '${daysAgo(7)}' AND '${today}'`;
    else if (period === '30d') dateFilter = `segments.date BETWEEN '${daysAgo(30)}' AND '${today}'`;
    else dateFilter = `segments.date BETWEEN '2026-04-14' AND '${today}'`; // campaign start

    const query = async (gaql) => {
      const resp = await fetch(`${API}/customers/${CID}/googleAds:search`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'developer-token': devToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gaql }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        console.log('GAQL error:', err.slice(0, 300));
        return [];
      }
      return (await resp.json()).results || [];
    };

    // Run all queries in parallel
    const [campaignData, adGroupData, keywordData, dailyData, searchTermData] = await Promise.all([
      // 1. Campaign overview
      query(`
        SELECT
          campaign.id, campaign.name, campaign.status,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.ctr, metrics.average_cpc, metrics.average_cpm,
          metrics.conversions, metrics.interactions,
          metrics.search_impression_share, metrics.search_top_impression_percentage,
          metrics.search_absolute_top_impression_percentage
        FROM campaign
        WHERE campaign.id = ${CAMPAIGN_ID} AND ${dateFilter}
      `),

      // 2. Ad group breakdown
      query(`
        SELECT
          ad_group.id, ad_group.name, ad_group.status,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.ctr, metrics.average_cpc, metrics.conversions
        FROM ad_group
        WHERE campaign.id = ${CAMPAIGN_ID} AND ${dateFilter}
        ORDER BY metrics.impressions DESC
      `),

      // 3. Keyword performance
      query(`
        SELECT
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          ad_group.name,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.ctr, metrics.average_cpc, metrics.conversions,
          metrics.search_impression_share
        FROM keyword_view
        WHERE campaign.id = ${CAMPAIGN_ID} AND ${dateFilter}
        ORDER BY metrics.impressions DESC
      `),

      // 4. Daily trend
      query(`
        SELECT
          segments.date,
          metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM campaign
        WHERE campaign.id = ${CAMPAIGN_ID} AND ${dateFilter}
        ORDER BY segments.date ASC
      `),

      // 5. Search terms (what people actually typed)
      query(`
        SELECT
          search_term_view.search_term,
          segments.search_term_match_type,
          metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM search_term_view
        WHERE campaign.id = ${CAMPAIGN_ID} AND ${dateFilter}
        ORDER BY metrics.impressions DESC
        LIMIT 30
      `),
    ]);

    // Parse campaign overview
    const c = campaignData[0] || {};
    const cm = c.metrics || {};
    const overview = {
      impressions: int(cm.impressions),
      clicks: int(cm.clicks),
      spend: micros(cm.costMicros),
      ctr: pct(cm.ctr),
      avgCPC: micros(cm.averageCpc),
      avgCPM: micros(cm.averageCpm),
      conversions: float(cm.conversions),
      interactions: int(cm.interactions),
      searchImprShare: pct(cm.searchImpressionShare),
      topImprPct: pct(cm.searchTopImpressionPercentage),
      absTopImprPct: pct(cm.searchAbsoluteTopImpressionPercentage),
      status: c.campaign?.status || 'UNKNOWN',
    };

    // Parse ad groups
    const adGroups = adGroupData.map(r => ({
      name: r.adGroup?.name || '',
      impressions: int(r.metrics?.impressions),
      clicks: int(r.metrics?.clicks),
      spend: micros(r.metrics?.costMicros),
      ctr: pct(r.metrics?.ctr),
      avgCPC: micros(r.metrics?.averageCpc),
      conversions: float(r.metrics?.conversions),
    }));

    // Parse keywords
    const keywords = keywordData.map(r => ({
      keyword: r.adGroupCriterion?.keyword?.text || '',
      matchType: r.adGroupCriterion?.keyword?.matchType || '',
      adGroup: r.adGroup?.name || '',
      impressions: int(r.metrics?.impressions),
      clicks: int(r.metrics?.clicks),
      spend: micros(r.metrics?.costMicros),
      ctr: pct(r.metrics?.ctr),
      avgCPC: micros(r.metrics?.averageCpc),
      conversions: float(r.metrics?.conversions),
      imprShare: pct(r.metrics?.searchImpressionShare),
    }));

    // Parse daily trend
    const daily = dailyData.map(r => ({
      date: r.segments?.date || '',
      impressions: int(r.metrics?.impressions),
      clicks: int(r.metrics?.clicks),
      spend: micros(r.metrics?.costMicros),
      conversions: float(r.metrics?.conversions),
    }));

    // Parse search terms
    const searchTerms = searchTermData.map(r => ({
      term: r.searchTermView?.searchTerm || '',
      matchType: r.segments?.searchTermMatchType || '',
      impressions: int(r.metrics?.impressions),
      clicks: int(r.metrics?.clicks),
      spend: micros(r.metrics?.costMicros),
      conversions: float(r.metrics?.conversions),
    }));

    return new Response(JSON.stringify({
      success: true,
      period,
      campaignId: CAMPAIGN_ID,
      campaignName: 'HE — Ghee Rice & Kabab — Local Search',
      overview,
      adGroups,
      keywords,
      daily,
      searchTerms,
    }, null, 2), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
}

// Helpers
function todayIST() {
  return new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0];
}
function daysAgo(n) {
  return new Date(Date.now() + 5.5 * 3600000 - n * 86400000).toISOString().split('T')[0];
}
function int(v) { return parseInt(v) || 0; }
function float(v) { return parseFloat(v) || 0; }
function micros(v) { return v ? +(parseInt(v) / 1000000).toFixed(2) : 0; }
function pct(v) { return v ? +(parseFloat(v) * 100).toFixed(2) : 0; }
