// Google Ads API — Campaign Management + Performance Metrics (v7)
// GET  /api/google-ads?action=campaigns|metrics|today|keywords|keyword-volumes
// POST /api/google-ads?action=create-search-campaign|pause-campaign|enable-campaign
// Requires secrets: GOOGLE_ADS_DEV_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';
const CUSTOMER_ID = '3681710084'; // 368-171-0084 without dashes
const PMAX_CAMPAIGN_ID = '23834053403';
const PMAX_FIRST_TRAFFIC_DATE = '2026-05-10';
const PMAX_CORRECTED_GEO_DATE = '2026-05-13';
const HAMZA_PIN = { lat: 12.9868469, lng: 77.6044088 };
const LEGACY_SEARCH_CAMPAIGN_ID = '23748431244';
const LATE_NIGHT_SEARCH_CAMPAIGN_NAME = 'HE — Late Night Maps Footfall Search — v1';
const LATE_NIGHT_SEARCH_CONFIRM = 'RESET_LATE_NIGHT_SEARCH_V1';
const LATE_NIGHT_SEARCH_FINAL_URL = 'https://hamzaexpress.in/go/google-night';
const LATE_NIGHT_SEARCH_BUDGET_INR = 300;
const LATE_NIGHT_SEARCH_RADIUS_KM = 7;
const HE_WALK_IN_NEGATIVE_SET_ID = '12074853990';
const ADS_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const LATE_NIGHT_AD_GROUPS = [
  {
    key: 'open_now_near_me',
    name: 'Open Now Near Me',
    cpcINR: 35,
    path1: 'open-now',
    path2: 'maps',
    keywords: [
      ['restaurants near me open now', 'PHRASE'],
      ['food open now near me', 'PHRASE'],
      ['restaurants open now near me', 'PHRASE'],
      ['open restaurant near me', 'PHRASE'],
      ['food places near me open now', 'PHRASE'],
      ['restaurants nearby open now', 'PHRASE'],
      ['restaurants near me open now', 'EXACT'],
      ['food open now near me', 'EXACT'],
    ],
    headlines: [
      'Late Night Non-Veg',
      'Open Now Near You',
      'Hamza Express HKP Road',
      'Get Directions Now',
      'Ghee Rice & Kabab',
      'Biryani Near Shivajinagar',
      'Dine-In Or Parcel',
      'Same Hamza Food Memory',
      'Near Commercial Street',
      'Since 1918',
    ],
  },
  {
    key: 'biryani_kabab_now',
    name: 'Biryani Kabab Late Night',
    cpcINR: 30,
    path1: 'biryani',
    path2: 'kabab',
    keywords: [
      ['biryani near me open now', 'PHRASE'],
      ['biryani near me', 'PHRASE'],
      ['kabab near me', 'PHRASE'],
      ['chicken kabab near me', 'PHRASE'],
      ['chicken kebab near me', 'PHRASE'],
      ['ghee rice near me', 'PHRASE'],
      ['biryani near me open now', 'EXACT'],
      ['kabab near me', 'EXACT'],
    ],
    headlines: [
      'Biryani & Kabab Nearby',
      'Ghee Rice & Kabab',
      'Hamza Express HKP Road',
      'Get Directions Now',
      'Late Night Biryani',
      'Kabab Near Shivajinagar',
      'Dine-In Or Parcel',
      'Same Hamza Food Memory',
      'Since 1918',
      'HKP Road Non-Veg',
    ],
  },
  {
    key: 'non_veg_halal',
    name: 'Non Veg Halal',
    cpcINR: 25,
    path1: 'non-veg',
    path2: 'halal',
    keywords: [
      ['non veg restaurant near me', 'PHRASE'],
      ['non veg restaurants near me open now', 'PHRASE'],
      ['halal restaurant near me', 'PHRASE'],
      ['muslim restaurant near me', 'PHRASE'],
      ['non veg restaurant near me', 'EXACT'],
      ['halal restaurant near me', 'EXACT'],
    ],
    headlines: [
      'Late Night Non-Veg',
      'Halal Food Near You',
      'Hamza Express HKP Road',
      'Get Directions Now',
      'Ghee Rice & Kabab',
      'Biryani Near Shivajinagar',
      'Dine-In Or Parcel',
      'Same Hamza Food Memory',
      'Since 1918',
      'HKP Road Non-Veg',
    ],
  },
  {
    key: 'late_night_bangalore',
    name: 'Late Night Bangalore',
    cpcINR: 22,
    path1: 'late-night',
    path2: 'hkp-road',
    keywords: [
      ['late night food bangalore', 'PHRASE'],
      ['late night restaurants bangalore', 'PHRASE'],
      ['midnight food bangalore', 'PHRASE'],
      ['late night biryani bangalore', 'PHRASE'],
      ['late night food near me', 'PHRASE'],
      ['late night food bangalore', 'EXACT'],
      ['late night food near me', 'EXACT'],
    ],
    headlines: [
      'Late Night Food',
      'Late Night Non-Veg',
      'Hamza Express HKP Road',
      'Get Directions Now',
      'Ghee Rice & Kabab',
      'Biryani Near Shivajinagar',
      'Near Commercial Street',
      'Dine-In Or Parcel',
      'Since 1918',
      'Same Hamza Food Memory',
    ],
  },
];
const LATE_NIGHT_DESCRIPTIONS = [
  'Late-night hunger near Shivajinagar? Ghee Rice, Kabab and Biryani at Hamza Express.',
  'Tap for directions to HKP Road. Dine-in, parcel, calls and menu from one place.',
  'Same Hamza food memory, new Express face. Non-veg meals on HKP Road.',
  'Near Commercial Street and Shivajinagar. Get directions before you come.',
];
const LATE_NIGHT_EXTRA_NEGATIVES = [
  'hotel room',
  'rooms',
  'lodge',
  'lodging',
  'pg',
  'hostel',
  'oyo',
  'recipe',
  'how to make',
  'jobs',
  'salary',
  'franchise',
  'swiggy',
  'zomato',
  'home delivery',
  'online order',
  'veg only',
  'vegetarian',
];

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
      case 'late-night-search-intelligence':
        return await getLateNightSearchIntelligence(accessToken, env);
      case 'reset-late-night-search':
        return await resetLateNightSearch(accessToken, env, request);
      case 'pause-campaign':
        return await setCampaignStatus(accessToken, env, url.searchParams.get('id'), 'PAUSED');
      case 'enable-campaign':
        return await setCampaignStatus(accessToken, env, url.searchParams.get('id'), 'ENABLED');
      case 'ad-health':
        return await getAdHealth(accessToken, env);
      case 'list-all-campaigns':
        return await listAllCampaigns(accessToken, env);
      case 'campaign-criteria':
        return await getCampaignCriteria(accessToken, env, url.searchParams.get('id'));
      case 'pmax-observability':
        return await getPmaxObservability(accessToken, env, url.searchParams);
      case 'geo-suggest':
        return await geoSuggest(accessToken, env, url.searchParams.get('q'), url.searchParams.get('cc') || 'IN');
      case 'set-campaign-location':
        return await setCampaignLocation(accessToken, env, url.searchParams.get('id'), url.searchParams.get('geo'), url.searchParams.get('remove'));
      case 'set-campaign-proximity':
        return await setCampaignProximity(accessToken, env, url.searchParams);
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

// Action: Full ad health check — serving status, policy, bid landscape, schedule
async function getAdHealth(accessToken, env) {
  const CAMPAIGN_ID = '23748431244';

  const [adsRows, campaignRows, adGroupRows, criteriaRows, budgetRows] = await Promise.all([
    // Ad approval + policy status
    queryGoogleAds(accessToken, env, `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.status,
        ad_group_ad.policy_summary.approval_status,
        ad_group_ad.policy_summary.review_status,
        ad_group_ad.policy_summary.policy_topic_entries,
        ad_group.name,
        ad_group.status,
        ad_group.cpc_bid_micros,
        ad_group.effective_cpc_bid_micros
      FROM ad_group_ad
      WHERE campaign.id = '${CAMPAIGN_ID}'
    `),
    // Campaign serving status + account-level issues
    queryGoogleAds(accessToken, env, `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.serving_status,
        campaign.primary_status,
        campaign.primary_status_reasons
      FROM campaign
      WHERE campaign.id = '${CAMPAIGN_ID}'
    `),
    // Ad group effective status
    queryGoogleAds(accessToken, env, `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.effective_cpc_bid_micros,
        ad_group.primary_status,
        ad_group.primary_status_reasons
      FROM ad_group
      WHERE campaign.id = '${CAMPAIGN_ID}'
    `),
    // Keywords — match types, quality score, first page bid
    queryGoogleAds(accessToken, env, `
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.approval_status,
        ad_group_criterion.cpc_bid_micros,
        ad_group_criterion.effective_cpc_bid_micros,
        ad_group_criterion.quality_info.quality_score,
        ad_group_criterion.quality_info.search_predicted_ctr,
        ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.position_estimates.first_position_cpc_micros,
        ad_group_criterion.position_estimates.top_of_page_cpc_micros,
        ad_group.name
      FROM ad_group_criterion
      WHERE campaign.id = '${CAMPAIGN_ID}'
        AND ad_group_criterion.type = 'KEYWORD'
        AND ad_group_criterion.negative = false
    `),
    // Budget details
    queryGoogleAds(accessToken, env, `
      SELECT
        campaign_budget.id,
        campaign_budget.name,
        campaign_budget.amount_micros,
        campaign_budget.status,
        campaign_budget.period,
        campaign_budget.delivery_method,
        campaign_budget.has_recommended_budget,
        campaign_budget.recommended_budget_amount_micros
      FROM campaign_budget
      WHERE campaign.id = '${CAMPAIGN_ID}'
    `),
  ]);

  // Parse ads
  const ads = adsRows.map(r => ({
    adId: r.adGroupAd?.ad?.id,
    adStatus: r.adGroupAd?.status,
    approvalStatus: r.adGroupAd?.policySummary?.approvalStatus,
    reviewStatus: r.adGroupAd?.policySummary?.reviewStatus,
    policyTopics: r.adGroupAd?.policySummary?.policyTopicEntries || [],
    adGroupName: r.adGroup?.name,
    adGroupStatus: r.adGroup?.status,
    cpcBidINR: r.adGroup?.cpcBidMicros ? (parseInt(r.adGroup.cpcBidMicros) / 1e6).toFixed(2) : null,
  }));

  // Parse campaign
  const camp = campaignRows[0]?.campaign || {};
  const campaign = {
    status: camp.status,
    servingStatus: camp.servingStatus,
    primaryStatus: camp.primaryStatus,
    primaryStatusReasons: camp.primaryStatusReasons || [],
  };

  // Parse ad groups
  const adGroups = adGroupRows.map(r => ({
    name: r.adGroup?.name,
    status: r.adGroup?.status,
    primaryStatus: r.adGroup?.primaryStatus,
    primaryStatusReasons: r.adGroup?.primaryStatusReasons || [],
    effectiveCpcINR: r.adGroup?.effectiveCpcBidMicros ? (parseInt(r.adGroup.effectiveCpcBidMicros) / 1e6).toFixed(2) : null,
  }));

  // Parse keywords with bid landscape
  const keywords = criteriaRows.map(r => {
    const c = r.adGroupCriterion || {};
    const qi = c.qualityInfo || {};
    const pe = c.positionEstimates || {};
    return {
      text: c.keyword?.text,
      matchType: c.keyword?.matchType,
      status: c.status,
      approvalStatus: c.approvalStatus,
      bidINR: c.cpcBidMicros ? (parseInt(c.cpcBidMicros) / 1e6).toFixed(2) : null,
      effectiveBidINR: c.effectiveCpcBidMicros ? (parseInt(c.effectiveCpcBidMicros) / 1e6).toFixed(2) : null,
      qualityScore: qi.qualityScore || 'N/A',
      predictedCTR: qi.searchPredictedCtr,
      creativeQuality: qi.creativeQualityScore,
      firstPageBidINR: pe.firstPositionCpcMicros ? (parseInt(pe.firstPositionCpcMicros) / 1e6).toFixed(2) : null,
      topOfPageBidINR: pe.topOfPageCpcMicros ? (parseInt(pe.topOfPageCpcMicros) / 1e6).toFixed(2) : null,
      adGroup: r.adGroup?.name,
    };
  });

  // Parse budget
  const bud = budgetRows[0]?.campaignBudget || {};
  const budget = {
    amountINR: bud.amountMicros ? (parseInt(bud.amountMicros) / 1e6).toFixed(2) : null,
    status: bud.status,
    period: bud.period,
    deliveryMethod: bud.deliveryMethod,
    hasRecommendedBudget: bud.hasRecommendedBudget,
    recommendedBudgetINR: bud.recommendedBudgetAmountMicros ? (parseInt(bud.recommendedBudgetAmountMicros) / 1e6).toFixed(2) : null,
  };

  return json({ campaign, adGroups, ads, keywords, budget });
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
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
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
      { create: { finalUrls: ['https://hamzaexpress.in/#menu'], sitelinkAsset: { linkText: 'View Our Menu', description1: '100+ dishes across 9 categories', description2: 'Ghee Rice, Kebab, Biryani & more' } } },
      { create: { finalUrls: ['https://hamzaexpress.in/go/google-ad'], sitelinkAsset: { linkText: 'Order on WhatsApp', description1: 'Skip the queue', description2: 'Pay UPI, collect in 15 min' } } },
      { create: { finalUrls: ['https://hamzaexpress.in/#legacy'], sitelinkAsset: { linkText: 'Our 108-Year Legacy', description1: 'Same recipes since 1918', description2: 'Dakhni cuisine heritage' } } },
      { create: { finalUrls: ['https://hamzaexpress.in/go/maps'], sitelinkAsset: { linkText: 'Get Directions', description1: 'HKP Road, Shivajinagar', description2: 'Near Russell Market' } } },
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

// ============================================================
// LATE NIGHT MAPS FOOTFALL SEARCH — Intelligence + safe reset
// Creates the fresh campaign PAUSED first, then removes only the old paused Search.
// No enable/resume is performed here.
// ============================================================
function lateNightSearchSpec() {
  return {
    campaignName: LATE_NIGHT_SEARCH_CAMPAIGN_NAME,
    ownerObjective: 'Maximum physical footfall to Hamza Express from late-night hungry customers.',
    roleInAccount: 'Surgical Search + Maps-intent layer. Existing PMax remains broad discovery.',
    budgetINR: LATE_NIGHT_SEARCH_BUDGET_INR,
    createStatus: 'PAUSED',
    finalUrl: LATE_NIGHT_SEARCH_FINAL_URL,
    geo: {
      type: 'PROXIMITY_ONLY',
      lat: HAMZA_PIN.lat,
      lng: HAMZA_PIN.lng,
      radiusKm: LATE_NIGHT_SEARCH_RADIUS_KM,
      locationOption: 'PRESENCE',
      blockedGeoShape: 'No city geo target. No Bengaluru city ID. No Gurugram ID.',
    },
    schedule: {
      timezone: 'Asia/Calcutta',
      ownerWindow: '22:00-03:00 daily',
      apiShape: ADS_DAYS.flatMap(day => [
        { day, startHour: 0, startMinute: 'ZERO', endHour: 3, endMinute: 'ZERO' },
        { day, startHour: 22, startMinute: 'ZERO', endHour: 24, endMinute: 'ZERO' },
      ]),
    },
    mapsFocus: [
      'Account-level Google Business Profile location asset must remain linked.',
      'Final URL is a direction-first late-night page.',
      'Ad copy pushes Get Directions, HKP Road, Shivajinagar, dine-in and parcel.',
      'Direction/call/menu local actions remain the realistic proxy conversions until Store Visits unlocks.',
    ],
    adGroups: LATE_NIGHT_AD_GROUPS.map(g => ({
      name: g.name,
      cpcINR: g.cpcINR,
      path1: g.path1,
      path2: g.path2,
      keywordCount: g.keywords.length,
      keywords: g.keywords.map(([text, matchType]) => ({ text, matchType })),
      headlines: g.headlines,
      descriptions: LATE_NIGHT_DESCRIPTIONS,
    })),
    sharedNegativeListId: HE_WALK_IN_NEGATIVE_SET_ID,
    extraNegativeKeywords: LATE_NIGHT_EXTRA_NEGATIVES,
    safetyRules: [
      `Delete old Search only if campaign ${LEGACY_SEARCH_CAMPAIGN_ID} is PAUSED.`,
      'Abort if a same-name late-night campaign already exists and replaceExisting is not true.',
      'Create the new campaign PAUSED first; enabling is a separate owner action after audit.',
      'Use exact Hamza micro-degree pin from Google Maps metadata, not geo-target city IDs.',
      'Use Search Network only; no Display Network and no Search Partners at launch.',
    ],
  };
}

function validateLateNightSearchSpec(spec) {
  const issues = [];
  for (const g of spec.adGroups || []) {
    for (const h of g.headlines || []) {
      if (h.length > 30) issues.push(`Headline too long in ${g.name}: "${h}" (${h.length}/30)`);
    }
    for (const d of g.descriptions || []) {
      if (d.length > 90) issues.push(`Description too long in ${g.name}: "${d}" (${d.length}/90)`);
    }
  }
  if (spec.geo.radiusKm !== 7) issues.push(`Expected 7km radius, got ${spec.geo.radiusKm}`);
  if (spec.budgetINR !== 300) issues.push(`Expected ₹300/day, got ₹${spec.budgetINR}`);
  if (spec.createStatus !== 'PAUSED') issues.push('New campaign must be created PAUSED');
  return issues;
}

async function getLateNightSearchIntelligence(accessToken, env) {
  const spec = lateNightSearchSpec();
  const textIssues = validateLateNightSearchSpec(spec);
  const safeQuery = async (name, query) => {
    try {
      return { name, rows: await queryGoogleAds(accessToken, env, query), error: null };
    } catch (e) {
      return { name, rows: [], error: e.message };
    }
  };

  const [campaignQ, locationQ, conversionQ, sharedSetQ, sharedCritQ] = await Promise.all([
    safeQuery('campaigns', `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.serving_status,
        campaign.advertising_channel_type,
        campaign.geo_target_type_setting.positive_geo_target_type,
        campaign.geo_target_type_setting.negative_geo_target_type,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.id DESC
    `),
    safeQuery('locationAssets', `
      SELECT
        asset.id,
        asset.type,
        asset.location_asset.business_profile_locations,
        asset.location_asset.location_ownership_type
      FROM asset
      WHERE asset.type = 'LOCATION'
    `),
    safeQuery('conversionActions', `
      SELECT
        conversion_action.id,
        conversion_action.name,
        conversion_action.status,
        conversion_action.type,
        conversion_action.category,
        conversion_action.primary_for_goal
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
    `),
    safeQuery('sharedSets', `
      SELECT
        shared_set.id,
        shared_set.name,
        shared_set.type,
        shared_set.member_count,
        shared_set.reference_count,
        shared_set.status
      FROM shared_set
      WHERE shared_set.status != 'REMOVED'
    `),
    safeQuery('sharedCriteria', `
      SELECT
        shared_set.id,
        shared_set.name,
        shared_criterion.keyword.text,
        shared_criterion.keyword.match_type,
        shared_criterion.type
      FROM shared_criterion
      WHERE shared_set.id = ${HE_WALK_IN_NEGATIVE_SET_ID}
      LIMIT 200
    `),
  ]);

  const errors = [campaignQ, locationQ, conversionQ, sharedSetQ, sharedCritQ]
    .filter(q => q.error)
    .map(q => ({ name: q.name, error: q.error }));

  const campaigns = campaignQ.rows.map(r => ({
    id: r.campaign?.id,
    name: r.campaign?.name,
    status: r.campaign?.status,
    servingStatus: r.campaign?.servingStatus,
    type: r.campaign?.advertisingChannelType,
    positiveGeoTargetType: r.campaign?.geoTargetTypeSetting?.positiveGeoTargetType,
    negativeGeoTargetType: r.campaign?.geoTargetTypeSetting?.negativeGeoTargetType,
    budgetINR: moneyMicros(r.campaignBudget?.amountMicros),
  }));
  const legacySearch = campaigns.find(c => c.id === LEGACY_SEARCH_CAMPAIGN_ID) || null;
  const currentPmax = campaigns.find(c => c.id === PMAX_CAMPAIGN_ID) || null;
  const existingLateNight = campaigns.find(c => c.name === LATE_NIGHT_SEARCH_CAMPAIGN_NAME) || null;
  const locationAssets = locationQ.rows.map(r => ({
    id: r.asset?.id,
    type: r.asset?.type,
    ownership: r.asset?.locationAsset?.locationOwnershipType,
    businessProfileLocations: r.asset?.locationAsset?.businessProfileLocations || [],
  }));
  const conversionActions = conversionQ.rows.map(r => ({
    id: r.conversionAction?.id,
    name: r.conversionAction?.name,
    type: r.conversionAction?.type,
    category: r.conversionAction?.category,
    primaryForGoal: !!r.conversionAction?.primaryForGoal,
  }));
  const sharedSets = sharedSetQ.rows.map(r => ({
    id: r.sharedSet?.id,
    name: r.sharedSet?.name,
    type: r.sharedSet?.type,
    memberCount: parseInt(r.sharedSet?.memberCount) || 0,
    referenceCount: parseInt(r.sharedSet?.referenceCount) || 0,
    status: r.sharedSet?.status,
  }));
  const sharedNegatives = sharedCritQ.rows.map(r => ({
    text: r.sharedCriterion?.keyword?.text,
    matchType: r.sharedCriterion?.keyword?.matchType,
  })).filter(k => k.text);
  const sharedSet = sharedSets.find(s => String(s.id) === HE_WALK_IN_NEGATIVE_SET_ID) || null;
  const localActionCount = conversionActions.filter(a =>
    ['GET_DIRECTIONS', 'CONTACT', 'PHONE_CALL_LEAD', 'PAGE_VIEW', 'ENGAGEMENT'].includes(a.category)
  ).length;

  const guardrails = [
    {
      id: 'pmax-kept',
      label: 'PMax remains base layer',
      state: currentPmax?.status === 'ENABLED' ? 'ok' : 'warn',
      detail: currentPmax ? `${currentPmax.status} / ₹${currentPmax.budgetINR}/day` : 'PMax missing',
    },
    {
      id: 'old-search-removable',
      label: 'Old Search safe to delete',
      state: !legacySearch || legacySearch.status === 'PAUSED' ? 'ok' : 'bad',
      detail: legacySearch ? `${legacySearch.name} is ${legacySearch.status}` : 'already removed',
    },
    {
      id: 'no-duplicate-late-night',
      label: 'No duplicate late-night campaign',
      state: existingLateNight ? 'warn' : 'ok',
      detail: existingLateNight ? `${existingLateNight.id} is ${existingLateNight.status}` : 'none exists',
    },
    {
      id: 'exact-pin',
      label: 'Exact pin locked',
      state: spec.geo.lat === HAMZA_PIN.lat && spec.geo.lng === HAMZA_PIN.lng ? 'ok' : 'bad',
      detail: `${spec.geo.lat},${spec.geo.lng}`,
    },
    {
      id: 'radius',
      label: 'Launch radius',
      state: spec.geo.radiusKm === 7 ? 'ok' : 'bad',
      detail: `${spec.geo.radiusKm} km proximity only`,
    },
    {
      id: 'schedule',
      label: 'Late-night only',
      state: spec.schedule.apiShape.length === 14 ? 'ok' : 'bad',
      detail: '22:00-03:00 daily, split across midnight',
    },
    {
      id: 'location-asset',
      label: 'GBP location asset',
      state: locationAssets.length ? 'ok' : 'bad',
      detail: locationAssets.length ? `${locationAssets.length} asset(s) linked at account` : 'missing',
    },
    {
      id: 'local-actions',
      label: 'Local action goals',
      state: localActionCount >= 3 ? 'ok' : 'warn',
      detail: `${localActionCount} enabled local/call/menu actions`,
    },
    {
      id: 'negative-list',
      label: 'Walk-in negative list',
      state: sharedSet && sharedNegatives.length >= 30 ? 'ok' : 'warn',
      detail: sharedSet ? `${sharedNegatives.length} keywords · ${sharedSet.referenceCount} refs` : 'missing',
    },
    {
      id: 'ad-text-policy-shape',
      label: 'Ad text length check',
      state: textIssues.length ? 'bad' : 'ok',
      detail: textIssues.length ? `${textIssues.length} issue(s)` : 'all headlines/descriptions within limits',
    },
  ];

  return json({
    ok: true,
    asOf: todayIST(),
    decision: {
      recommendation: 'Use fresh Late Night Maps Footfall Search, not another PMax, for the ₹300/day layer.',
      reason: 'PMax is already live as broad discovery; the new layer needs keyword, schedule, query, and Maps-action control.',
    },
    spec,
    live: {
      campaigns,
      currentPmax,
      legacySearch,
      existingLateNight,
      locationAssets,
      conversionActions,
      sharedNegativeList: sharedSet,
      sharedNegatives,
    },
    guardrails,
    textIssues,
    execution: {
      endpoint: '/api/google-ads?action=reset-late-night-search',
      method: 'POST',
      requiredBody: { confirm: LATE_NIGHT_SEARCH_CONFIRM },
      result: 'Creates the new Search campaign PAUSED, then removes old paused Search if still present, and returns resource IDs for audit.',
    },
    errors,
  });
}

async function resetLateNightSearch(accessToken, env, request) {
  if (request.method !== 'POST') {
    return json({ error: 'POST required', requiredBody: { confirm: LATE_NIGHT_SEARCH_CONFIRM } }, 405);
  }
  const body = await request.json().catch(() => ({}));
  if (body.confirm !== LATE_NIGHT_SEARCH_CONFIRM) {
    return json({
      error: 'confirmation_required',
      required: LATE_NIGHT_SEARCH_CONFIRM,
      note: 'This endpoint removes the old paused Search campaign and creates the new campaign PAUSED. Re-submit with confirm after reviewing late-night-search-intelligence.',
    }, 409);
  }

  const log = [];
  const step = msg => log.push(`[${new Date().toISOString()}] ${msg}`);
  const spec = lateNightSearchSpec();
  const textIssues = validateLateNightSearchSpec(spec);
  if (textIssues.length) return json({ success: false, error: 'spec_validation_failed', textIssues }, 500);

  const campaignRows = await queryGoogleAds(accessToken, env, `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY campaign.id DESC
  `);
  const campaigns = campaignRows.map(r => ({
    id: r.campaign?.id,
    name: r.campaign?.name,
    status: r.campaign?.status,
    type: r.campaign?.advertisingChannelType,
    budgetINR: moneyMicros(r.campaignBudget?.amountMicros),
  }));
  const legacySearch = campaigns.find(c => c.id === LEGACY_SEARCH_CAMPAIGN_ID);
  const existingLateNight = campaigns.find(c => c.name === LATE_NIGHT_SEARCH_CAMPAIGN_NAME);

  if (legacySearch && legacySearch.status !== 'PAUSED') {
    return json({
      success: false,
      error: 'legacy_search_not_paused',
      detail: `Refusing to remove ${LEGACY_SEARCH_CAMPAIGN_ID} because it is ${legacySearch.status}. Pause it first.`,
      legacySearch,
      log,
    }, 409);
  }

  if (existingLateNight && !body.replaceExisting) {
    return json({
      success: false,
      error: 'late_night_campaign_already_exists',
      detail: 'Refusing to create a duplicate. Pass replaceExisting:true only if the existing late-night campaign is PAUSED and should be removed first.',
      existingLateNight,
      log,
    }, 409);
  }

  if (existingLateNight && body.replaceExisting) {
    if (existingLateNight.status !== 'PAUSED') {
      return json({
        success: false,
        error: 'existing_late_night_not_paused',
        detail: `Refusing to replace existing late-night campaign ${existingLateNight.id} because it is ${existingLateNight.status}.`,
        existingLateNight,
        log,
      }, 409);
    }
    await removeCampaign(accessToken, env, existingLateNight.id);
    step(`Removed existing paused late-night campaign ${existingLateNight.id}`);
  }

  const budgetResults = await mutateGoogleAds(accessToken, env, 'campaignBudgets', [{
    create: {
      name: `HE Late Night Search INR${LATE_NIGHT_SEARCH_BUDGET_INR}/day ${todayIST()} ${Date.now()}`,
      amountMicros: rupeesToMicros(LATE_NIGHT_SEARCH_BUDGET_INR),
      deliveryMethod: 'STANDARD',
      explicitlyShared: false,
    },
  }]);
  const budgetResource = budgetResults[0].resourceName;
  step(`Created ₹${LATE_NIGHT_SEARCH_BUDGET_INR}/day budget ${budgetResource}`);

  const campaignResults = await mutateGoogleAds(accessToken, env, 'campaigns', [{
    create: {
      name: LATE_NIGHT_SEARCH_CAMPAIGN_NAME,
      status: 'PAUSED',
      advertisingChannelType: 'SEARCH',
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
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
  const campaignId = campaignResource.split('/').pop();
  step(`Created new Search campaign ${campaignId} as PAUSED`);

  const adGroupResults = await mutateGoogleAds(accessToken, env, 'adGroups',
    LATE_NIGHT_AD_GROUPS.map(g => ({
      create: {
        name: g.name,
        campaign: campaignResource,
        status: 'ENABLED',
        type: 'SEARCH_STANDARD',
        cpcBidMicros: rupeesToMicros(g.cpcINR),
      },
    })),
  );
  const adGroupResources = Object.fromEntries(
    LATE_NIGHT_AD_GROUPS.map((g, i) => [g.key, adGroupResults[i].resourceName]),
  );
  step(`Created ${adGroupResults.length} ad groups`);

  const keywordOps = [];
  for (const group of LATE_NIGHT_AD_GROUPS) {
    for (const [text, matchType] of group.keywords) {
      keywordOps.push({
        create: {
          adGroup: adGroupResources[group.key],
          status: 'ENABLED',
          keyword: { text, matchType },
        },
      });
    }
  }
  await mutateGoogleAds(accessToken, env, 'adGroupCriteria', keywordOps);
  step(`Created ${keywordOps.length} exact/phrase keywords`);

  const adOps = LATE_NIGHT_AD_GROUPS.map(group => ({
    create: {
      adGroup: adGroupResources[group.key],
      status: 'ENABLED',
      ad: {
        responsiveSearchAd: {
          headlines: group.headlines.map(text => ({
            text,
            ...(text === 'Hamza Express HKP Road' ? { pinnedField: 'HEADLINE_1' } : {}),
          })),
          descriptions: LATE_NIGHT_DESCRIPTIONS.map(text => ({ text })),
          path1: group.path1,
          path2: group.path2,
        },
        finalUrls: [LATE_NIGHT_SEARCH_FINAL_URL],
      },
    },
  }));
  await mutateGoogleAds(accessToken, env, 'adGroupAds', adOps);
  step(`Created ${adOps.length} responsive search ads`);

  const proximityOp = {
    create: {
      campaign: campaignResource,
      proximity: {
        geoPoint: {
          latitudeInMicroDegrees: Math.round(HAMZA_PIN.lat * 1_000_000),
          longitudeInMicroDegrees: Math.round(HAMZA_PIN.lng * 1_000_000),
        },
        radius: LATE_NIGHT_SEARCH_RADIUS_KM,
        radiusUnits: 'KILOMETERS',
      },
    },
  };
  const scheduleOps = ADS_DAYS.flatMap(day => [
    { create: { campaign: campaignResource, adSchedule: { dayOfWeek: day, startHour: 0, startMinute: 'ZERO', endHour: 3, endMinute: 'ZERO' } } },
    { create: { campaign: campaignResource, adSchedule: { dayOfWeek: day, startHour: 22, startMinute: 'ZERO', endHour: 24, endMinute: 'ZERO' } } },
  ]);
  const negativeOps = LATE_NIGHT_EXTRA_NEGATIVES.map(kw => ({
    create: {
      campaign: campaignResource,
      negative: true,
      keyword: { text: kw, matchType: 'PHRASE' },
    },
  }));
  await mutateGoogleAds(accessToken, env, 'campaignCriteria', [
    proximityOp,
    ...scheduleOps,
    ...negativeOps,
  ]);
  step(`Set exact ${LATE_NIGHT_SEARCH_RADIUS_KM}km proximity, ${scheduleOps.length} schedule blocks, ${negativeOps.length} extra negatives`);

  await mutateGoogleAds(accessToken, env, 'campaignSharedSets', [{
    create: {
      campaign: campaignResource,
      sharedSet: `customers/${CUSTOMER_ID}/sharedSets/${HE_WALK_IN_NEGATIVE_SET_ID}`,
    },
  }]);
  step(`Attached shared negative list ${HE_WALK_IN_NEGATIVE_SET_ID}`);

  const assetResults = await mutateGoogleAds(accessToken, env, 'assets', [
    { create: { finalUrls: ['https://hamzaexpress.in/go/maps'], sitelinkAsset: { linkText: 'Get Directions', description1: 'Open Maps', description2: 'HKP Road pin' } } },
    { create: { finalUrls: [LATE_NIGHT_SEARCH_FINAL_URL], sitelinkAsset: { linkText: 'Late Night Menu', description1: 'Ghee Rice & Kabab', description2: 'Biryani and parcel' } } },
    { create: { finalUrls: ['https://hamzaexpress.in/menu/'], sitelinkAsset: { linkText: 'View Full Menu', description1: 'Non-veg favorites', description2: 'Before you visit' } } },
    { create: { calloutAsset: { calloutText: 'HKP Road' } } },
    { create: { calloutAsset: { calloutText: 'Since 1918' } } },
    { create: { calloutAsset: { calloutText: 'Dine-In' } } },
    { create: { calloutAsset: { calloutText: 'Parcel' } } },
    { create: { calloutAsset: { calloutText: 'Directions' } } },
  ]);
  await mutateGoogleAds(accessToken, env, 'campaignAssets', assetResults.map((r, i) => ({
    create: {
      campaign: campaignResource,
      asset: r.resourceName,
      fieldType: i < 3 ? 'SITELINK' : 'CALLOUT',
    },
  })));
  step(`Created and linked ${assetResults.length} sitelink/callout assets`);

  let oldSearchRemoved = false;
  if (legacySearch) {
    await removeCampaign(accessToken, env, LEGACY_SEARCH_CAMPAIGN_ID);
    oldSearchRemoved = true;
    step(`Removed old paused Search campaign ${LEGACY_SEARCH_CAMPAIGN_ID} after new campaign creation succeeded`);
  } else {
    step(`Old Search campaign ${LEGACY_SEARCH_CAMPAIGN_ID} already removed or not visible`);
  }

  return json({
    success: true,
    campaignName: LATE_NIGHT_SEARCH_CAMPAIGN_NAME,
    status: 'PAUSED',
    oldSearchRemoved,
    budgetINR: LATE_NIGHT_SEARCH_BUDGET_INR,
    finalUrl: LATE_NIGHT_SEARCH_FINAL_URL,
    geo: spec.geo,
    schedule: spec.schedule.ownerWindow,
    resources: {
      budget: budgetResource,
      campaign: campaignResource,
      campaignId,
      adGroups: adGroupResources,
    },
    auditLinks: {
      criteria: `/api/google-ads?action=campaign-criteria&id=${campaignId}`,
      intelligence: '/api/google-ads?action=late-night-search-intelligence',
      cockpit: '/ops/google-cockpit/',
    },
    log,
  });
}

async function removeCampaign(accessToken, env, campaignId) {
  if (!campaignId) throw new Error('campaignId required');
  return await mutateGoogleAds(accessToken, env, 'campaigns', [{
    remove: `customers/${CUSTOMER_ID}/campaigns/${campaignId}`,
  }]);
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

// Action: Diagnostic — list ALL campaigns regardless of status (incl REMOVED + DRAFT).
// `campaign.start_date` was rejected by v23 as UNRECOGNIZED_FIELD when used unfiltered,
// so we rely on `campaign.id` monotonicity (Google generates IDs in creation order)
// to infer chronology. ORDER BY campaign.id DESC gives newest first.
async function listAllCampaigns(accessToken, env) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros
    FROM campaign
    ORDER BY campaign.id DESC
  `;

  const results = await queryGoogleAds(accessToken, env, query);

  const campaigns = results.map(r => ({
    id: r.campaign.id,
    name: r.campaign.name,
    status: r.campaign.status,
    type: r.campaign.advertisingChannelType,
    budgetINR: r.campaignBudget?.amountMicros
      ? (parseInt(r.campaignBudget.amountMicros) / 1000000).toFixed(2)
      : null,
  }));

  return json({ campaigns, count: campaigns.length });
}

// Action: Diagnostic — list all CAMPAIGN-LEVEL criteria (LOCATION / LANGUAGE /
// AUDIENCE / proximity) for a given campaign id, with geo target constants
// resolved to readable names. Answers "is this PMax actually targeting
// Bangalore?" empirically.
async function getCampaignCriteria(accessToken, env, id) {
  if (!id) return json({ error: '?id=<campaign_id> required' }, 400);

  const critRows = await queryGoogleAds(accessToken, env, `
    SELECT
      campaign_criterion.criterion_id,
      campaign_criterion.type,
      campaign_criterion.negative,
      campaign_criterion.location.geo_target_constant,
      campaign_criterion.language.language_constant,
      campaign_criterion.proximity.address.country_code,
      campaign_criterion.proximity.address.postal_code,
      campaign_criterion.proximity.address.city_name,
      campaign_criterion.proximity.geo_point.latitude_in_micro_degrees,
      campaign_criterion.proximity.geo_point.longitude_in_micro_degrees,
      campaign_criterion.proximity.radius,
      campaign_criterion.proximity.radius_units
    FROM campaign_criterion
    WHERE campaign.id = '${id}'
  `);

  // Collect geo target constant resource names to resolve in one batch query.
  const geoConsts = [...new Set(
    critRows
      .map(r => r.campaignCriterion?.location?.geoTargetConstant)
      .filter(Boolean),
  )];

  let geoMap = {};
  if (geoConsts.length) {
    const inClause = geoConsts.map(g => `'${g}'`).join(',');
    const geoRows = await queryGoogleAds(accessToken, env, `
      SELECT
        geo_target_constant.resource_name,
        geo_target_constant.id,
        geo_target_constant.name,
        geo_target_constant.canonical_name,
        geo_target_constant.country_code,
        geo_target_constant.target_type,
        geo_target_constant.status
      FROM geo_target_constant
      WHERE geo_target_constant.resource_name IN (${inClause})
    `);
    for (const r of geoRows) {
      const g = r.geoTargetConstant;
      if (g?.resourceName) geoMap[g.resourceName] = g;
    }
  }

  // Bucket criteria by type for readability.
  const buckets = { LOCATION: [], LANGUAGE: [], PROXIMITY: [], OTHER: [] };
  for (const r of critRows) {
    const c = r.campaignCriterion || {};
    const type = c.type;
    const item = {
      criterionId: c.criterionId,
      type,
      negative: c.negative || false,
    };
    if (type === 'LOCATION') {
      const ref = c.location?.geoTargetConstant;
      const meta = geoMap[ref] || {};
      item.geoTargetConstant = ref;
      item.geoTargetId = meta.id;
      item.name = meta.name;
      item.canonicalName = meta.canonicalName;
      item.countryCode = meta.countryCode;
      item.targetType = meta.targetType;
      buckets.LOCATION.push(item);
    } else if (type === 'LANGUAGE') {
      item.languageConstant = c.language?.languageConstant;
      buckets.LANGUAGE.push(item);
    } else if (type === 'PROXIMITY') {
      const geoPoint = c.proximity?.geoPoint || {};
      const latitude = microToDegrees(geoPoint.latitudeInMicroDegrees);
      const longitude = microToDegrees(geoPoint.longitudeInMicroDegrees);
      item.address = c.proximity?.address;
      item.geoPoint = {
        latitude,
        longitude,
        latitudeInMicroDegrees: geoPoint.latitudeInMicroDegrees,
        longitudeInMicroDegrees: geoPoint.longitudeInMicroDegrees,
      };
      item.hamzaPinDeltaMeters = latitude && longitude
        ? Math.round(distanceMeters(latitude, longitude, HAMZA_PIN.lat, HAMZA_PIN.lng))
        : null;
      item.radius = c.proximity?.radius;
      item.radiusUnits = c.proximity?.radiusUnits;
      buckets.PROXIMITY.push(item);
    } else {
      buckets.OTHER.push(item);
    }
  }

  return json({
    campaignId: id,
    count: critRows.length,
    criteria: buckets,
    summary: {
      locations: buckets.LOCATION.length,
      languages: buckets.LANGUAGE.length,
      proximities: buckets.PROXIMITY.length,
      negativeLocations: buckets.LOCATION.filter(l => l.negative).length,
    },
  });
}

// Action: Read-only PMax observability pack for the cockpit guardrails.
// No mutations, no budget changes, no recommendation application.
async function getPmaxObservability(accessToken, env, params) {
  const campaignId = params.get('id') || PMAX_CAMPAIGN_ID;
  const from = params.get('from') || PMAX_FIRST_TRAFFIC_DATE;
  const to = params.get('to') || todayIST();
  const correctedFrom = params.get('correctedFrom') || PMAX_CORRECTED_GEO_DATE;

  const safeQuery = async (name, query) => {
    try {
      return { name, rows: await queryGoogleAds(accessToken, env, query), error: null };
    } catch (e) {
      return { name, rows: [], error: e.message };
    }
  };

  const [
    campaignQ,
    criteriaQ,
    dailyQ,
    networkQ,
    hourQ,
    conversionQ,
    conversionActionsQ,
    userListQ,
    assetGroupQ,
  ] = await Promise.all([
    safeQuery('campaign', `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.serving_status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.id = '${campaignId}'
    `),
    safeQuery('criteria', `
      SELECT
        campaign_criterion.criterion_id,
        campaign_criterion.type,
        campaign_criterion.negative,
        campaign_criterion.location.geo_target_constant,
        campaign_criterion.language.language_constant,
        campaign_criterion.proximity.geo_point.latitude_in_micro_degrees,
        campaign_criterion.proximity.geo_point.longitude_in_micro_degrees,
        campaign_criterion.proximity.radius,
        campaign_criterion.proximity.radius_units
      FROM campaign_criterion
      WHERE campaign.id = '${campaignId}'
    `),
    safeQuery('daily', `
      SELECT
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.interactions,
        metrics.average_cpc,
        metrics.average_cpm
      FROM campaign
      WHERE campaign.id = '${campaignId}'
        AND segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY segments.date ASC
    `),
    safeQuery('network', `
      SELECT
        segments.ad_network_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.interactions
      FROM campaign
      WHERE campaign.id = '${campaignId}'
        AND segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY metrics.cost_micros DESC
    `),
    safeQuery('hour', `
      SELECT
        segments.hour,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.interactions
      FROM campaign
      WHERE campaign.id = '${campaignId}'
        AND segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY segments.hour ASC
    `),
    safeQuery('conversionSegments', `
      SELECT
        segments.conversion_action,
        segments.conversion_action_name,
        segments.conversion_action_category,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE campaign.id = '${campaignId}'
        AND segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY metrics.conversions DESC
    `),
    safeQuery('conversionActions', `
      SELECT
        conversion_action.id,
        conversion_action.name,
        conversion_action.status,
        conversion_action.type,
        conversion_action.category,
        conversion_action.primary_for_goal
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
    `),
    safeQuery('userLists', `
      SELECT
        user_list.id,
        user_list.name,
        user_list.size_for_display,
        user_list.size_for_search,
        user_list.membership_status
      FROM user_list
      WHERE user_list.read_only = false
      ORDER BY user_list.id DESC
    `),
    safeQuery('assetGroups', `
      SELECT
        asset_group.id,
        asset_group.name,
        asset_group.status,
        asset_group.primary_status,
        asset_group.primary_status_reasons,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM asset_group
      WHERE campaign.id = '${campaignId}'
        AND segments.date BETWEEN '${from}' AND '${to}'
      ORDER BY metrics.impressions DESC
    `),
  ]);

  const campaignRow = campaignQ.rows[0] || {};
  const campaign = {
    id: campaignRow.campaign?.id || campaignId,
    name: campaignRow.campaign?.name || '',
    status: campaignRow.campaign?.status || '',
    servingStatus: campaignRow.campaign?.servingStatus || '',
    type: campaignRow.campaign?.advertisingChannelType || '',
    budgetINR: campaignRow.campaignBudget?.amountMicros
      ? +(parseInt(campaignRow.campaignBudget.amountMicros) / 1e6).toFixed(0)
      : null,
  };

  const criteria = parseCriteriaRows(criteriaQ.rows);
  const daily = dailyQ.rows.map(r => metricRow({
    date: r.segments?.date,
    metrics: r.metrics,
  })).filter(r => r.date);
  const total = aggregateMetrics(daily);
  const preCorrection = aggregateMetrics(daily.filter(r => r.date < correctedFrom));
  const corrected = aggregateMetrics(daily.filter(r => r.date >= correctedFrom));

  const byNetwork = networkQ.rows.map(r => metricRow({
    label: r.segments?.adNetworkType || 'UNKNOWN',
    metrics: r.metrics,
  })).sort((a, b) => b.spend - a.spend);
  const byHour = hourQ.rows.map(r => metricRow({
    label: String(r.segments?.hour ?? ''),
    hour: r.segments?.hour,
    metrics: r.metrics,
  })).filter(r => r.label !== '');

  const conversionsByAction = conversionQ.rows.map(r => ({
    action: r.segments?.conversionActionName || r.segments?.conversionAction || 'UNKNOWN',
    category: r.segments?.conversionActionCategory || '',
    conversions: +(parseFloat(r.metrics?.conversions) || 0).toFixed(2),
    value: +(parseFloat(r.metrics?.conversionsValue) || 0).toFixed(2),
  }));

  const conversionActions = conversionActionsQ.rows.map(r => ({
    id: r.conversionAction?.id,
    name: r.conversionAction?.name,
    status: r.conversionAction?.status,
    type: r.conversionAction?.type,
    category: r.conversionAction?.category,
    primaryForGoal: !!r.conversionAction?.primaryForGoal,
  }));
  const hasStoreVisits = conversionActions.some(a =>
    a.type === 'STORE_VISITS' || a.category === 'STORE_VISIT'
  );

  const userLists = userListQ.rows.map(r => ({
    id: r.userList?.id,
    name: r.userList?.name,
    sizeForDisplay: parseInt(r.userList?.sizeForDisplay) || 0,
    sizeForSearch: parseInt(r.userList?.sizeForSearch) || 0,
    membershipStatus: r.userList?.membershipStatus,
  }));
  const customerMatchSize = Math.max(
    ...userLists.map(u => Math.max(u.sizeForDisplay, u.sizeForSearch)),
    0,
  );

  const assetGroups = assetGroupQ.rows.map(r => ({
    id: r.assetGroup?.id,
    name: r.assetGroup?.name,
    status: r.assetGroup?.status,
    primaryStatus: r.assetGroup?.primaryStatus,
    primaryStatusReasons: r.assetGroup?.primaryStatusReasons || [],
    ...metricRow({ metrics: r.metrics }),
  }));

  const primaryProximity = criteria.proximities[0] || null;
  const pinDelta = primaryProximity?.hamzaPinDeltaMeters;
  const guardrails = [
    {
      id: 'campaign-live',
      label: 'PMax live',
      state: campaign.status === 'ENABLED' && campaign.servingStatus === 'SERVING' ? 'ok' : 'bad',
      detail: `${campaign.status || 'UNKNOWN'} / ${campaign.servingStatus || 'UNKNOWN'}`,
    },
    {
      id: 'exact-pin',
      label: 'Exact Hamza pin',
      state: pinDelta != null && pinDelta <= 25 ? 'ok' : 'warn',
      detail: pinDelta == null
        ? 'proximity center not exposed'
        : `${pinDelta}m from 12.9868469,77.6044088`,
    },
    {
      id: 'no-city-target',
      label: 'No city target',
      state: criteria.locations.length === 0 ? 'ok' : 'bad',
      detail: `${criteria.locations.length} LOCATION criteria`,
    },
    {
      id: 'single-proximity',
      label: 'Single 2 km radius',
      state: criteria.proximities.length === 1
        && Number(primaryProximity?.radius) === 2
        && primaryProximity?.radiusUnits === 'KILOMETERS'
        ? 'ok'
        : 'warn',
      detail: primaryProximity ? `${primaryProximity.radius} ${primaryProximity.radiusUnits}` : 'missing',
    },
    {
      id: 'store-visits',
      label: 'Store Visits',
      state: hasStoreVisits ? 'ok' : 'warn',
      detail: hasStoreVisits ? 'available' : 'missing — Google eligibility gate',
    },
    {
      id: 'conversions',
      label: 'Reported conversions',
      state: total.conversions > 0 ? 'ok' : 'warn',
      detail: `${total.conversions} from ${from} to ${to}`,
    },
    {
      id: 'customer-match',
      label: 'Customer Match',
      state: customerMatchSize >= 100 ? 'ok' : customerMatchSize > 0 ? 'warn' : 'bad',
      detail: `${customerMatchSize} matched users`,
    },
    {
      id: 'corrected-phase',
      label: 'Corrected geo phase',
      state: corrected.spend > 0 ? 'ok' : 'warn',
      detail: `from ${correctedFrom}: ₹${corrected.spend}`,
    },
  ];

  const errors = [
    campaignQ, criteriaQ, dailyQ, networkQ, hourQ, conversionQ,
    conversionActionsQ, userListQ, assetGroupQ,
  ].filter(q => q.error).map(q => ({ section: q.name, error: q.error }));

  return json({
    ok: true,
    asOf: todayIST(),
    campaignId,
    dateRange: { from, to },
    correctedFrom,
    badGeoPhase: { from: PMAX_FIRST_TRAFFIC_DATE, to: previousDate(correctedFrom) },
    canonicalPin: HAMZA_PIN,
    campaign,
    criteria,
    phases: { total, preCorrection, corrected },
    daily,
    byNetwork,
    byHour,
    conversionsByAction,
    conversionActions,
    hasStoreVisits,
    userLists,
    assetGroups,
    guardrails,
    errors,
  });
}

// Action: Resolve a city/location name → Google geo target constant ID.
// Uses geoTargetConstants:suggest REST endpoint. Always cross-check the
// result before using — the May 2026 blunder was the create-pmax code
// commenting "1007765 = Bangalore" when 1007765 is actually Gurugram.
async function geoSuggest(accessToken, env, q, countryCode) {
  if (!q) return json({ error: '?q=<location name> required' }, 400);
  const resp = await fetch(
    `${GOOGLE_ADS_API}/geoTargetConstants:suggest`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locationNames: { names: [q] },
        countryCode,
      }),
    },
  );
  const data = await resp.json();
  if (!resp.ok) return json({ error: `Suggest failed (${resp.status})`, raw: data }, 500);
  // Flatten + sort by reach
  const suggestions = (data.geoTargetConstantSuggestions || []).map(s => ({
    id: s.geoTargetConstant?.id,
    name: s.geoTargetConstant?.name,
    canonicalName: s.geoTargetConstant?.canonicalName,
    countryCode: s.geoTargetConstant?.countryCode,
    targetType: s.geoTargetConstant?.targetType,
    status: s.geoTargetConstant?.status,
    resourceName: s.geoTargetConstant?.resourceName,
    locale: s.locale,
    reach: parseInt(s.reach) || 0,
    searchTerm: s.searchTerm,
  })).sort((a, b) => b.reach - a.reach);
  return json({ query: q, countryCode, count: suggestions.length, suggestions });
}

// Action: Atomic location swap on a campaign — adds the new geo target as a
// LOCATION criterion AND optionally removes existing LOCATION criteria
// (passed as criterion IDs in ?remove=ID1,ID2). Designed for fixing the
// Gurugram → Bangalore blunder cleanly.
//   ?id=<campaign_id>&geo=<new_geo_target_id>&remove=<criterion_id_to_remove>
async function setCampaignLocation(accessToken, env, campaignId, newGeoId, removeIds) {
  if (!campaignId || !newGeoId) return json({ error: '?id=<campaign_id>&geo=<geo_target_id> required' }, 400);
  const customerPrefix = `customers/${CUSTOMER_ID}`;
  const operations = [];

  // Remove old location criteria first (each removal references the existing
  // criterion resource name shape: customers/{cid}/campaignCriteria/{campId}~{critId}).
  const removes = (removeIds || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const critId of removes) {
    operations.push({
      remove: `${customerPrefix}/campaignCriteria/${campaignId}~${critId}`,
    });
  }

  // Create the new location criterion pointing at Bangalore (or whatever).
  operations.push({
    create: {
      campaign: `${customerPrefix}/campaigns/${campaignId}`,
      location: { geoTargetConstant: `geoTargetConstants/${newGeoId}` },
    },
  });

  const raw = await mutateGoogleAds(accessToken, env, 'campaignCriteria', operations);
  return json({
    ok: true,
    campaignId,
    added: newGeoId,
    removed: removes,
    results: raw,
  });
}

// Action: Set a PROXIMITY criterion (lat/lng + radius) on a campaign, atomically
// removing existing LOCATION criteria by criterion id. Use this for hyper-local
// restaurant targeting around a physical store.
//   ?id=<campaign>&lat=12.9861&lng=77.6048&radius=2&units=KILOMETERS&remove=1007768
async function setCampaignProximity(accessToken, env, params) {
  const campaignId = params.get('id');
  const lat = parseFloat(params.get('lat'));
  const lng = parseFloat(params.get('lng'));
  const radius = parseFloat(params.get('radius') || '2');
  const units = (params.get('units') || 'KILOMETERS').toUpperCase();
  const removeIds = (params.get('remove') || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!campaignId) return json({ error: '?id=<campaign> required' }, 400);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return json({ error: '?lat & ?lng required (decimal degrees)' }, 400);
  if (!['KILOMETERS', 'MILES'].includes(units)) return json({ error: 'units must be KILOMETERS or MILES' }, 400);

  const customerPrefix = `customers/${CUSTOMER_ID}`;
  const operations = [];

  for (const critId of removeIds) {
    operations.push({
      remove: `${customerPrefix}/campaignCriteria/${campaignId}~${critId}`,
    });
  }

  operations.push({
    create: {
      campaign: `${customerPrefix}/campaigns/${campaignId}`,
      proximity: {
        geoPoint: {
          latitudeInMicroDegrees: Math.round(lat * 1_000_000),
          longitudeInMicroDegrees: Math.round(lng * 1_000_000),
        },
        radius,
        radiusUnits: units,
      },
    },
  });

  const raw = await mutateGoogleAds(accessToken, env, 'campaignCriteria', operations);
  return json({
    ok: true,
    campaignId,
    proximity: { lat, lng, radius, units },
    removed: removeIds,
    results: raw,
  });
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

function previousDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

function metricRow({ date, label, hour, metrics }) {
  const impressions = parseInt(metrics?.impressions) || 0;
  const clicks = parseInt(metrics?.clicks) || 0;
  const spend = moneyMicros(metrics?.costMicros);
  const conversions = +(parseFloat(metrics?.conversions) || 0).toFixed(2);
  return {
    ...(date ? { date } : {}),
    ...(label != null ? { label } : {}),
    ...(hour != null ? { hour } : {}),
    impressions,
    clicks,
    spend,
    conversions,
    interactions: parseInt(metrics?.interactions) || 0,
    ctr: impressions > 0 ? +((clicks / impressions) * 100).toFixed(2) : 0,
    avgCPC: clicks > 0 ? +(spend / clicks).toFixed(2) : 0,
    avgCPM: impressions > 0 ? +((spend / impressions) * 1000).toFixed(2) : 0,
  };
}

function aggregateMetrics(rows) {
  const impressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
  const clicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
  const spend = +rows.reduce((s, r) => s + (r.spend || 0), 0).toFixed(2);
  const conversions = +rows.reduce((s, r) => s + (r.conversions || 0), 0).toFixed(2);
  return {
    impressions,
    clicks,
    spend,
    conversions,
    interactions: rows.reduce((s, r) => s + (r.interactions || 0), 0),
    ctr: impressions > 0 ? +((clicks / impressions) * 100).toFixed(2) : 0,
    avgCPC: clicks > 0 ? +(spend / clicks).toFixed(2) : 0,
    avgCPM: impressions > 0 ? +((spend / impressions) * 1000).toFixed(2) : 0,
  };
}

function parseCriteriaRows(rows) {
  const out = { locations: [], languages: [], proximities: [], other: [] };
  for (const r of rows) {
    const c = r.campaignCriterion || {};
    const item = {
      criterionId: c.criterionId,
      type: c.type,
      negative: !!c.negative,
    };
    if (c.type === 'LOCATION') {
      item.geoTargetConstant = c.location?.geoTargetConstant;
      out.locations.push(item);
    } else if (c.type === 'LANGUAGE') {
      item.languageConstant = c.language?.languageConstant;
      out.languages.push(item);
    } else if (c.type === 'PROXIMITY') {
      const geoPoint = c.proximity?.geoPoint || {};
      const latitude = microToDegrees(geoPoint.latitudeInMicroDegrees);
      const longitude = microToDegrees(geoPoint.longitudeInMicroDegrees);
      out.proximities.push({
        ...item,
        radius: c.proximity?.radius,
        radiusUnits: c.proximity?.radiusUnits,
        geoPoint: {
          latitude,
          longitude,
          latitudeInMicroDegrees: geoPoint.latitudeInMicroDegrees,
          longitudeInMicroDegrees: geoPoint.longitudeInMicroDegrees,
        },
        hamzaPinDeltaMeters: latitude && longitude
          ? Math.round(distanceMeters(latitude, longitude, HAMZA_PIN.lat, HAMZA_PIN.lng))
          : null,
      });
    } else {
      out.other.push(item);
    }
  }
  return out;
}

function moneyMicros(v) {
  return v ? +(parseInt(v) / 1e6).toFixed(2) : 0;
}

function rupeesToMicros(v) {
  return String(Math.round(Number(v || 0) * 1_000_000));
}

function microToDegrees(v) {
  const n = parseInt(v);
  return Number.isFinite(n) ? +(n / 1_000_000).toFixed(7) : null;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
