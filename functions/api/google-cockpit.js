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

    // Date range — always IST
    const today = todayIST();
    let dateFilter;
    if (period === 'today') dateFilter = `segments.date = '${today}'`;
    else if (period === '7d') dateFilter = `segments.date BETWEEN '${daysAgo(7)}' AND '${today}'`;
    else if (period === '30d') dateFilter = `segments.date BETWEEN '${daysAgo(30)}' AND '${today}'`;
    else dateFilter = `segments.date BETWEEN '2026-04-14' AND '${today}'`; // campaign start

    const query = async (gaql) => {
      const resp = await fetch(`${API}/customers/${CID}/googleAds:search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'developer-token': devToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: gaql }),
      });
      if (!resp.ok) return [];
      return (await resp.json()).results || [];
    };

    // Run all queries in parallel
    // NOTE: Campaign overview is split into 2 queries:
    //   - Basic metrics (impressions/clicks/spend) — reliable even with new campaigns
    //   - Position metrics (impression share) — may return null on new campaigns, handled gracefully
    const [adGroupData, keywordData, dailyData, searchTermData, positionData, campaignStatus] = await Promise.all([

      // 1. Ad group breakdown — source of truth for aggregate metrics
      query(`
        SELECT
          ad_group.id, ad_group.name, ad_group.status,
          ad_group.cpc_bid_micros,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.ctr, metrics.average_cpc, metrics.conversions
        FROM ad_group
        WHERE campaign.id = ${CAMPAIGN_ID} AND ${dateFilter}
        ORDER BY metrics.impressions DESC
      `),

      // 2. Keyword performance
      query(`
        SELECT
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          ad_group_criterion.cpc_bid_micros,
          ad_group.name,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.ctr, metrics.average_cpc, metrics.conversions,
          metrics.search_impression_share
        FROM keyword_view
        WHERE campaign.id = ${CAMPAIGN_ID} AND ${dateFilter}
        ORDER BY metrics.impressions DESC
      `),

      // 3. Daily trend
      query(`
        SELECT
          segments.date,
          metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM ad_group
        WHERE campaign.id = ${CAMPAIGN_ID} AND ${dateFilter}
        ORDER BY segments.date ASC
      `),

      // 4. Search terms — what people actually typed
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

      // 5. Position metrics — separate query, may return empty for new campaigns
      query(`
        SELECT
          metrics.search_impression_share,
          metrics.search_top_impression_percentage,
          metrics.search_absolute_top_impression_percentage,
          metrics.average_cpm,
          metrics.interactions
        FROM campaign
        WHERE campaign.id = ${CAMPAIGN_ID} AND ${dateFilter}
      `),

      // 6. Campaign status (no date filter — always current)
      query(`
        SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status
        FROM campaign
        WHERE campaign.id = ${CAMPAIGN_ID}
      `),
    ]);

    // Build overview by summing ad group data (reliable source)
    const aggImpressions = adGroupData.reduce((s, r) => s + int(r.metrics?.impressions), 0);
    const aggClicks = adGroupData.reduce((s, r) => s + int(r.metrics?.clicks), 0);
    const aggCostMicros = adGroupData.reduce((s, r) => s + (parseInt(r.metrics?.costMicros) || 0), 0);
    const aggConversions = adGroupData.reduce((s, r) => s + float(r.metrics?.conversions), 0);

    // Position metrics — graceful fallback
    const pm = positionData[0]?.metrics || {};
    const cs = campaignStatus[0]?.campaign || {};

    const overview = {
      impressions: aggImpressions,
      clicks: aggClicks,
      spend: +(aggCostMicros / 1000000).toFixed(2),
      ctr: aggClicks > 0 && aggImpressions > 0 ? +((aggClicks / aggImpressions) * 100).toFixed(2) : 0,
      avgCPC: aggClicks > 0 ? +(aggCostMicros / aggClicks / 1000000).toFixed(2) : 0,
      avgCPM: micros(pm.averageCpm),
      conversions: +aggConversions.toFixed(2),
      interactions: int(pm.interactions),
      searchImprShare: pct(pm.searchImpressionShare),
      topImprPct: pct(pm.searchTopImpressionPercentage),
      absTopImprPct: pct(pm.searchAbsoluteTopImpressionPercentage),
      status: cs.status || 'UNKNOWN',
      servingStatus: cs.servingStatus || '',
    };

    // Parse ad groups
    const adGroups = adGroupData.reduce((acc, r) => {
      const name = r.adGroup?.name || '';
      const existing = acc.find(a => a.name === name);
      if (existing) {
        existing.impressions += int(r.metrics?.impressions);
        existing.clicks += int(r.metrics?.clicks);
        existing.spend += micros(r.metrics?.costMicros);
        existing.conversions += float(r.metrics?.conversions);
      } else {
        acc.push({
          name,
          status: r.adGroup?.status || '',
          bidINR: r.adGroup?.cpcBidMicros ? +(parseInt(r.adGroup.cpcBidMicros) / 1e6).toFixed(0) : null,
          impressions: int(r.metrics?.impressions),
          clicks: int(r.metrics?.clicks),
          spend: micros(r.metrics?.costMicros),
          ctr: pct(r.metrics?.ctr),
          avgCPC: micros(r.metrics?.averageCpc),
          conversions: float(r.metrics?.conversions),
        });
      }
      return acc;
    }, []).sort((a, b) => b.impressions - a.impressions);

    // Parse keywords
    const keywords = keywordData.map(r => ({
      keyword: r.adGroupCriterion?.keyword?.text || '',
      matchType: r.adGroupCriterion?.keyword?.matchType || '',
      bidINR: r.adGroupCriterion?.cpcBidMicros
        ? +(parseInt(r.adGroupCriterion.cpcBidMicros) / 1e6).toFixed(0)
        : null,
      adGroup: r.adGroup?.name || '',
      impressions: int(r.metrics?.impressions),
      clicks: int(r.metrics?.clicks),
      spend: micros(r.metrics?.costMicros),
      ctr: pct(r.metrics?.ctr),
      avgCPC: micros(r.metrics?.averageCpc),
      conversions: float(r.metrics?.conversions),
      imprShare: pct(r.metrics?.searchImpressionShare),
    }));

    // Parse daily trend — deduplicate by date (sum across ad groups)
    const dailyMap = {};
    for (const r of dailyData) {
      const date = r.segments?.date || '';
      if (!date) continue;
      if (!dailyMap[date]) dailyMap[date] = { date, impressions: 0, clicks: 0, spend: 0, conversions: 0 };
      dailyMap[date].impressions += int(r.metrics?.impressions);
      dailyMap[date].clicks += int(r.metrics?.clicks);
      dailyMap[date].spend += micros(r.metrics?.costMicros);
      dailyMap[date].conversions += float(r.metrics?.conversions);
    }
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Parse search terms — readable match type labels
    const matchTypeLabel = {
      NEAR_EXACT: 'Exact~', NEAR_PHRASE: 'Phrase~',
      EXACT: 'Exact', PHRASE: 'Phrase', BROAD: 'Broad',
    };
    const searchTerms = searchTermData.map(r => ({
      term: r.searchTermView?.searchTerm || '',
      matchType: matchTypeLabel[r.segments?.searchTermMatchType] || r.segments?.searchTermMatchType || '',
      impressions: int(r.metrics?.impressions),
      clicks: int(r.metrics?.clicks),
      spend: micros(r.metrics?.costMicros),
      conversions: float(r.metrics?.conversions),
    }));

    return new Response(JSON.stringify({
      success: true,
      period,
      asOf: todayIST(),
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
