// Google Ads API — Campaign Management + Performance Metrics (v7)
// GET  /api/google-ads?action=campaigns|metrics|today|keywords|keyword-volumes
// POST /api/google-ads?action=create-search-campaign|pause-campaign|enable-campaign
// Requires secrets: GOOGLE_ADS_DEV_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';
const CUSTOMER_ID = '3681710084'; // 368-171-0084 without dashes

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      case 'create-search-campaign':
        return await createSearchCampaign(accessToken, env);
      case 'pause-campaign':
        return await setCampaignStatus(accessToken, env, url.searchParams.get('id'), 'PAUSED');
      case 'enable-campaign':
        return await setCampaignStatus(accessToken, env, url.searchParams.get('id'), 'ENABLED');
      default:
        return json({ error: 'Unknown action' }, 400);
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

// Google Ads API mutate helper — for creating/updating resources
async function mutateGoogleAds(accessToken, env, resource, operations) {
  const resp = await fetch(
    `${GOOGLE_ADS_API}/customers/${CUSTOMER_ID}/${resource}:mutate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operations }),
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Mutate ${resource} failed (${resp.status}): ${errorText}`);
  }

  const data = await resp.json();
  return data.results || [];
}

// Action: Pause or enable a campaign by ID
async function setCampaignStatus(accessToken, env, campaignId, status) {
  if (!campaignId) return json({ error: 'id param required (campaign ID)' }, 400);
  const resourceName = `customers/${CUSTOMER_ID}/campaigns/${campaignId}`;
  const results = await mutateGoogleAds(accessToken, env, 'campaigns', [{
    update: { resourceName, status },
    updateMask: 'status',
  }]);
  return json({ success: true, campaignId, status, result: results[0] });
}

// ============================================================
// CREATE SEARCH CAMPAIGN — Full 8-step sequential creation
// HE — Ghee Rice & Kabab — Local Search
// 5km radius from Hamza Express (12.9868°N, 77.6044°E)
// ============================================================
async function createSearchCampaign(accessToken, env) {
  const log = [];
  const step = (n, msg) => log.push(`Step ${n}: ${msg}`);

  try {
    // ── Step 1: Campaign Budget ──
    step(1, 'Creating campaign budget ₹500/day');
    const budgetResults = await mutateGoogleAds(accessToken, env, 'campaignBudgets', [{
      create: {
        name: 'HE Search ₹500/day',
        amountMicros: '500000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
    }]);
    const budgetResource = budgetResults[0].resourceName;
    step(1, `Budget created: ${budgetResource}`);

    // ── Step 2: Campaign ──
    step(2, 'Creating campaign');
    const campaignResults = await mutateGoogleAds(accessToken, env, 'campaigns', [{
      create: {
        name: 'HE — Ghee Rice & Kabab — Local Search',
        status: 'PAUSED',
        advertisingChannelType: 'SEARCH',
        campaignBudget: budgetResource,
        manualCpc: { enhancedCpcEnabled: false },
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: false,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
        geoTargetTypeSetting: {
          positiveGeoTargetType: 'PRESENCE',
          negativeGeoTargetType: 'PRESENCE',
        },
      },
    }]);
    const campaignResource = campaignResults[0].resourceName;
    step(2, `Campaign created: ${campaignResource}`);

    // ── Step 3: Two Ad Groups ──
    step(3, 'Creating ad groups');
    const adGroupResults = await mutateGoogleAds(accessToken, env, 'adGroups', [
      {
        create: {
          name: 'Near Me — Ghee Rice Kabab Biryani',
          campaign: campaignResource,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpcBidMicros: '8000000',
        },
      },
      {
        create: {
          name: 'Shivajinagar — Destination Intent',
          campaign: campaignResource,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpcBidMicros: '5000000',
        },
      },
    ]);
    const ag1 = adGroupResults[0].resourceName;
    const ag2 = adGroupResults[1].resourceName;
    step(3, `Ad groups created: ${ag1}, ${ag2}`);

    // ── Step 4: Keywords ──
    step(4, 'Creating keywords');
    const nearMeKeywords = [
      'best restaurant near me',
      'best biryani near me',
      'best ghee rice near me',
      'best kabab near me',
    ];
    const shivajiKeywords = [
      'shivajinagar restaurant',
      'shivajinagar biryani',
      'shivajinagar food',
      'restaurants in shivajinagar',
    ];
    const kwOps = [
      ...nearMeKeywords.map(kw => ({
        create: { adGroup: ag1, status: 'ENABLED', keyword: { text: kw, matchType: 'PHRASE' } },
      })),
      ...shivajiKeywords.map(kw => ({
        create: { adGroup: ag2, status: 'ENABLED', keyword: { text: kw, matchType: 'PHRASE' } },
      })),
    ];
    await mutateGoogleAds(accessToken, env, 'adGroupCriteria', kwOps);
    step(4, `8 keywords created (4 near-me + 4 shivajinagar)`);

    // ── Step 5: Responsive Search Ads ──
    step(5, 'Creating responsive search ads');
    const headlines = [
      { text: 'Hamza Express — Est. 1918', pinnedField: 'HEADLINE_1' },
      { text: 'Ghee Rice. Kebab. Bheja Fry.' },
      { text: '5.0★ Google (70+ Reviews)' },
      { text: 'Best Ghee Rice in Bangalore' },
      { text: 'HKP Road, Shivajinagar' },
      { text: 'Legendary Kabab Since 1918' },
      { text: 'Combo Meals from ₹139' },
      { text: 'Open 12 PM to 12:30 AM' },
      { text: 'Free Dal, Sherwa & Salad' },
      { text: '108 Years, Same Kitchen' },
      { text: 'Order on WhatsApp' },
      { text: 'Drive-Worthy Bheja Fry' },
      { text: 'Walk In or Takeaway' },
      { text: 'Near Russell Market' },
      { text: 'Dakhni Cuisine Since 1918' },
    ];
    const descriptions = [
      { text: 'Ghee rice that glistens, charcoal kebabs people queue for, bheja fry worth the drive. Since 1918.' },
      { text: '5.0 on Google, 70+ reviews. Combos from ₹139 with free Dal, Sherwa & Salad. Walk in anytime.' },
      { text: '108-year Dakhni legacy on HKP Road. Ghee Rice, Kebab, Brain Fry, Shawarma. Open 12PM-12:30AM.' },
      { text: 'WhatsApp us, pay UPI, collect in 15 min. Or walk in for dine-in. Near Russell Market.' },
    ];
    const adBody = {
      responsiveSearchAd: { headlines, descriptions, path1: 'ghee-rice', path2: 'kebab' },
      finalUrls: ['https://hamzaexpress.in'],
    };
    await mutateGoogleAds(accessToken, env, 'adGroupAds', [
      { create: { adGroup: ag1, status: 'ENABLED', ad: adBody } },
      { create: { adGroup: ag2, status: 'ENABLED', ad: adBody } },
    ]);
    step(5, '2 responsive search ads created (1 per ad group)');

    // ── Step 6: Campaign Criteria — Location + Schedule + Negatives ──
    step(6, 'Setting location, schedule, and negative keywords');
    const c = campaignResource;
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

    // Location: 5km radius from Hamza Express 12.9868°N, 77.6044°E
    const locationCriterion = {
      create: {
        campaign: c,
        proximity: {
          geoPoint: {
            latitudeInMicroDegrees: 12986800,
            longitudeInMicroDegrees: 77604400,
          },
          radius: 5.0,
          radiusUnits: 'KILOMETERS',
        },
      },
    };

    // Ad schedules: 11:00-14:00 + 18:00-22:30, all 7 days
    const scheduleOps = days.flatMap(day => [
      { create: { campaign: c, adSchedule: { dayOfWeek: day, startHour: 11, startMinute: 'ZERO', endHour: 14, endMinute: 'ZERO' } } },
      { create: { campaign: c, adSchedule: { dayOfWeek: day, startHour: 18, startMinute: 'ZERO', endHour: 22, endMinute: 'THIRTY' } } },
    ]);

    // Negative keywords (campaign-level)
    const negatives = [
      'recipe', 'how to make', 'ingredients', 'cooking', 'homemade',
      'movie', 'download', 'streaming', 'watch online',
      'Swiggy', 'Zomato', 'jobs', 'hiring', 'franchise',
      'calories', 'nutrition', 'diet', 'veg', 'vegetarian',
    ];
    const negOps = negatives.map(kw => ({
      create: { campaign: c, negative: true, keyword: { text: kw, matchType: 'PHRASE' } },
    }));

    await mutateGoogleAds(accessToken, env, 'campaignCriteria', [
      locationCriterion,
      ...scheduleOps,
      ...negOps,
    ]);
    step(6, `Location (5km radius), 14 schedules, ${negatives.length} negative keywords set`);

    // ── Step 7: Assets ──
    step(7, 'Creating sitelink, callout, structured snippet assets');
    const assetResults = await mutateGoogleAds(accessToken, env, 'assets', [
      // 4 Sitelinks
      { create: { sitelinkAsset: { linkText: 'View Our Menu', description1: '100+ dishes across 9 categories', description2: 'Ghee Rice, Kebab, Biryani & more', finalUrls: ['https://hamzaexpress.in/#menu'] } } },
      { create: { sitelinkAsset: { linkText: 'Order on WhatsApp', description1: 'Skip the queue', description2: 'Pay UPI, collect in 15 min', finalUrls: ['https://hamzaexpress.in/go/google-ad'] } } },
      { create: { sitelinkAsset: { linkText: 'Our 108-Year Legacy', description1: 'Same recipes since 1918', description2: 'Dakhni cuisine heritage', finalUrls: ['https://hamzaexpress.in/#legacy'] } } },
      { create: { sitelinkAsset: { linkText: 'Get Directions', description1: 'HKP Road, Shivajinagar', description2: 'Near Russell Market', finalUrls: ['https://hamzaexpress.in/go/maps'] } } },
      // 5 Callouts
      { create: { calloutAsset: { calloutText: 'Est. 1918' } } },
      { create: { calloutAsset: { calloutText: '5.0 on Google' } } },
      { create: { calloutAsset: { calloutText: '108-Year Legacy' } } },
      { create: { calloutAsset: { calloutText: 'HKP Road' } } },
      { create: { calloutAsset: { calloutText: 'Free Salad & Sherwa' } } },
      // 1 Structured Snippet
      { create: { structuredSnippetAsset: { header: 'Menu', values: ['Ghee Rice', 'Chicken Kebab', 'Bheja Fry', 'Biryani', 'Shawarma', 'Tandoori'] } } },
    ]);
    step(7, `${assetResults.length} assets created`);

    // ── Step 8: Link Assets to Campaign ──
    step(8, 'Linking assets to campaign');
    const assetLinkOps = assetResults.map((r, i) => {
      let fieldType;
      if (i < 4) fieldType = 'SITELINK';
      else if (i < 9) fieldType = 'CALLOUT';
      else fieldType = 'STRUCTURED_SNIPPET';
      return { create: { campaign: c, asset: r.resourceName, fieldType } };
    });
    await mutateGoogleAds(accessToken, env, 'campaignAssets', assetLinkOps);
    step(8, `${assetLinkOps.length} assets linked to campaign`);

    return json({
      success: true,
      campaignName: 'HE — Ghee Rice & Kabab — Local Search',
      status: 'PAUSED (enable when ready)',
      budget: '₹500/day',
      location: '5km radius from 12.9868°N, 77.6044°E',
      schedule: '11AM-2PM + 6PM-10:30PM daily',
      adGroups: ['Near Me (4 keywords, ₹8 max CPC)', 'Shivajinagar (4 keywords, ₹5 max CPC)'],
      negativeKeywords: negatives.length,
      assets: '4 sitelinks + 5 callouts + 1 structured snippet',
      resources: { budget: budgetResource, campaign: campaignResource, adGroup1: ag1, adGroup2: ag2 },
      log,
    });
  } catch (err) {
    return json({ success: false, error: err.message, stepsCompleted: log, stack: err.stack }, 500);
  }
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
