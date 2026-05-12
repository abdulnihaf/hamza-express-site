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
      case 'ad-health':
        return await getAdHealth(accessToken, env);
      case 'list-all-campaigns':
        return await listAllCampaigns(accessToken, env);
      case 'campaign-criteria':
        return await getCampaignCriteria(accessToken, env, url.searchParams.get('id'));
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
      item.address = c.proximity?.address;
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
