// Organic Insights API — Google Search Console + Google Business Profile
// GET /api/organic-insights?period=7d|28d|90d
// Returns: GSC (organic search impressions/clicks/position) + GBP (Maps views, direction requests, calls)
// Requires secret: GOOGLE_ORGANIC_REFRESH_TOKEN (separate from Ads token — needs webmasters + business.manage scopes)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const SITE_URL    = 'sc-domain:hamzaexpress.in'; // Search Console verified property
const GBP_ACCOUNT = 'accounts/112179357124952476831'; // update after first run

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const { env } = context;
  const url = new URL(context.request.url);
  const period = url.searchParams.get('period') || '28d';

  // Dates
  const nowIST  = new Date(Date.now() + 5.5 * 3600000);
  const todayStr = nowIST.toISOString().slice(0, 10);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 28;
  const startStr = new Date(Date.now() + 5.5 * 3600000 - days * 86400000).toISOString().slice(0, 10);

  const refreshToken = env.GOOGLE_ORGANIC_REFRESH_TOKEN;
  if (!refreshToken) {
    return new Response(JSON.stringify({
      available: false,
      reason: 'GOOGLE_ORGANIC_REFRESH_TOKEN not set — run scripts/generate-organic-token.js',
    }), { headers: CORS });
  }

  try {
    const token = await getToken(env, refreshToken);

    const [gscData, gbpData] = await Promise.allSettled([
      fetchGSC(token, startStr, todayStr),
      fetchGBP(token, startStr, todayStr),
    ]);

    return new Response(JSON.stringify({
      available: true,
      period,
      startDate: startStr,
      endDate: todayStr,
      gsc: gscData.status === 'fulfilled' ? gscData.value : { error: gscData.reason?.message },
      gbp: gbpData.status === 'fulfilled' ? gbpData.value : { error: gbpData.reason?.message },
    }, null, 2), { headers: CORS });

  } catch (err) {
    return new Response(JSON.stringify({ available: false, error: err.message }), { status: 500, headers: CORS });
  }
}

// ── Google Search Console ─────────────────────────────────────────────────
async function fetchGSC(token, startDate, endDate) {
  // Overall totals
  const overallResp = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate, endDate,
        dimensions: [],
        rowLimit: 1,
      }),
    }
  );

  // Top queries
  const queriesResp = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate, endDate,
        dimensions: ['query'],
        rowLimit: 20,
        orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
      }),
    }
  );

  // Daily trend
  const dailyResp = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate, endDate,
        dimensions: ['date'],
        rowLimit: 90,
        orderBy: [{ fieldName: 'date', sortOrder: 'ASCENDING' }],
      }),
    }
  );

  const [overall, queries, daily] = await Promise.all([
    overallResp.json(), queriesResp.json(), dailyResp.json(),
  ]);

  const o = (overall.rows || [])[0] || {};
  return {
    impressions: Math.round(o.impressions || 0),
    clicks: Math.round(o.clicks || 0),
    ctr: +((o.ctr || 0) * 100).toFixed(2),
    avgPosition: +((o.position || 0)).toFixed(1),
    topQueries: (queries.rows || []).map(r => ({
      query: r.keys[0],
      impressions: Math.round(r.impressions),
      clicks: Math.round(r.clicks),
      ctr: +((r.ctr || 0) * 100).toFixed(1),
      position: +(r.position || 0).toFixed(1),
    })),
    daily: (daily.rows || []).map(r => ({
      date: r.keys[0],
      impressions: Math.round(r.impressions),
      clicks: Math.round(r.clicks),
    })),
  };
}

// ── Google Business Profile ───────────────────────────────────────────────
async function fetchGBP(token, startDate, endDate) {
  // First, list accounts to get the location resource name
  const accountsResp = await fetch(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const accounts = await accountsResp.json();
  const account = (accounts.accounts || [])[0];
  if (!account) throw new Error(`No GBP account found — raw: ${JSON.stringify(accounts).slice(0, 300)}`);

  // List locations
  const locsResp = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const locs = await locsResp.json();
  const location = (locs.locations || []).find(l => l.title?.toLowerCase().includes('hamza')) || (locs.locations || [])[0];
  if (!location) throw new Error('No HE location found in GBP');

  // Fetch performance metrics
  // Available metrics: BUSINESS_IMPRESSIONS_DESKTOP_MAPS, BUSINESS_IMPRESSIONS_MOBILE_MAPS,
  //   BUSINESS_IMPRESSIONS_DESKTOP_SEARCH, BUSINESS_IMPRESSIONS_MOBILE_SEARCH,
  //   CALL_CLICKS, DIRECTION_REQUESTS, WEBSITE_CLICKS, BUSINESS_BOOKINGS
  const perfResp = await fetch(
    `https://businessprofileperformance.googleapis.com/v1/${location.name}:fetchMultiDailyMetricsTimeSeries?` +
    `dailyMetrics=BUSINESS_IMPRESSIONS_DESKTOP_MAPS` +
    `&dailyMetrics=BUSINESS_IMPRESSIONS_MOBILE_MAPS` +
    `&dailyMetrics=BUSINESS_IMPRESSIONS_DESKTOP_SEARCH` +
    `&dailyMetrics=BUSINESS_IMPRESSIONS_MOBILE_SEARCH` +
    `&dailyMetrics=CALL_CLICKS` +
    `&dailyMetrics=DIRECTION_REQUESTS` +
    `&dailyMetrics=WEBSITE_CLICKS` +
    `&dailyRange.startDate.year=${startDate.slice(0, 4)}` +
    `&dailyRange.startDate.month=${parseInt(startDate.slice(5, 7))}` +
    `&dailyRange.startDate.day=${parseInt(startDate.slice(8, 10))}` +
    `&dailyRange.endDate.year=${endDate.slice(0, 4)}` +
    `&dailyRange.endDate.month=${parseInt(endDate.slice(5, 7))}` +
    `&dailyRange.endDate.day=${parseInt(endDate.slice(8, 10))}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const perf = await perfResp.json();

  // Parse metric time series
  const totals = {};
  const metricSeries = (perf.multiDailyMetricTimeSeries || []);
  for (const series of metricSeries) {
    for (const ts of (series.dailyMetricTimeSeries || [])) {
      const metric = ts.dailyMetric;
      const total = (ts.timeSeries?.datedValues || []).reduce((s, v) => s + (parseInt(v.value) || 0), 0);
      totals[metric] = (totals[metric] || 0) + total;
    }
  }

  return {
    locationName: location.title,
    locationId: location.name,
    mapsImpressions: (totals['BUSINESS_IMPRESSIONS_DESKTOP_MAPS'] || 0) + (totals['BUSINESS_IMPRESSIONS_MOBILE_MAPS'] || 0),
    searchImpressions: (totals['BUSINESS_IMPRESSIONS_DESKTOP_SEARCH'] || 0) + (totals['BUSINESS_IMPRESSIONS_MOBILE_SEARCH'] || 0),
    directionRequests: totals['DIRECTION_REQUESTS'] || 0,
    callClicks: totals['CALL_CLICKS'] || 0,
    websiteClicks: totals['WEBSITE_CLICKS'] || 0,
  };
}

// ── OAuth ─────────────────────────────────────────────────────────────────
async function getToken(env, refreshToken) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}
