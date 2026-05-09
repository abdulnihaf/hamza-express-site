// Google Ads Campaign Health Diagnostic
// GET /api/google-ads-health
// Checks: campaign serving status, ad approval/policy, keyword quality scores + bid landscape, budget

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';
const CUSTOMER_ID = '3681710084';
const CAMPAIGN_ID = '23748431244';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const token = await getToken(env);

    const [adsRows, campaignRows, adGroupRows, criteriaRows, budgetRows] = await Promise.all([
      gaql(token, env, `
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
      gaql(token, env, `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.serving_status
        FROM campaign
        WHERE campaign.id = '${CAMPAIGN_ID}'
      `),
      gaql(token, env, `
        SELECT
          ad_group.id,
          ad_group.name,
          ad_group.status,
          ad_group.effective_cpc_bid_micros
        FROM ad_group
        WHERE campaign.id = '${CAMPAIGN_ID}'
      `),
      gaql(token, env, `
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
      gaql(token, env, `
        SELECT
          campaign.id,
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

    // Parse campaign
    const c = campaignRows[0]?.campaign || {};
    const campaign = {
      status: c.status,
      servingStatus: c.servingStatus,
    };

    // Parse ad groups
    const adGroups = adGroupRows.map(r => ({
      name: r.adGroup?.name,
      status: r.adGroup?.status,
      effectiveCpcINR: r.adGroup?.effectiveCpcBidMicros
        ? (parseInt(r.adGroup.effectiveCpcBidMicros) / 1e6).toFixed(2)
        : null,
    }));

    // Parse ads
    const ads = adsRows.map(r => ({
      adId: r.adGroupAd?.ad?.id,
      adStatus: r.adGroupAd?.status,
      approvalStatus: r.adGroupAd?.policySummary?.approvalStatus,
      reviewStatus: r.adGroupAd?.policySummary?.reviewStatus,
      policyTopics: r.adGroupAd?.policySummary?.policyTopicEntries || [],
      adGroupName: r.adGroup?.name,
      adGroupStatus: r.adGroup?.status,
      cpcBidINR: r.adGroup?.cpcBidMicros
        ? (parseInt(r.adGroup.cpcBidMicros) / 1e6).toFixed(2)
        : null,
    }));

    // Parse keywords with bid landscape
    const keywords = criteriaRows.map(r => {
      const k = r.adGroupCriterion || {};
      const qi = k.qualityInfo || {};
      const pe = k.positionEstimates || {};
      return {
        text: k.keyword?.text,
        matchType: k.keyword?.matchType,
        status: k.status,
        approvalStatus: k.approvalStatus,
        bidINR: k.cpcBidMicros ? (parseInt(k.cpcBidMicros) / 1e6).toFixed(2) : null,
        effectiveBidINR: k.effectiveCpcBidMicros
          ? (parseInt(k.effectiveCpcBidMicros) / 1e6).toFixed(2)
          : null,
        qualityScore: qi.qualityScore ?? 'N/A',
        predictedCTR: qi.searchPredictedCtr || null,
        creativeQuality: qi.creativeQualityScore || null,
        firstPageBidINR: pe.firstPositionCpcMicros
          ? (parseInt(pe.firstPositionCpcMicros) / 1e6).toFixed(2)
          : null,
        topOfPageBidINR: pe.topOfPageCpcMicros
          ? (parseInt(pe.topOfPageCpcMicros) / 1e6).toFixed(2)
          : null,
        adGroup: r.adGroup?.name,
      };
    });

    // Parse budget
    const b = budgetRows[0]?.campaignBudget || {};
    const budget = {
      amountINR: b.amountMicros ? (parseInt(b.amountMicros) / 1e6).toFixed(2) : null,
      status: b.status,
      deliveryMethod: b.deliveryMethod,
      hasRecommendedBudget: b.hasRecommendedBudget,
      recommendedBudgetINR: b.recommendedBudgetAmountMicros
        ? (parseInt(b.recommendedBudgetAmountMicros) / 1e6).toFixed(2)
        : null,
    };

    return new Response(
      JSON.stringify({ campaign, adGroups, ads, keywords, budget }, null, 2),
      { headers: CORS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: CORS }
    );
  }
}

async function getToken(env) {
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
  if (!data.access_token) throw new Error(`OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function gaql(token, env, query) {
  const resp = await fetch(
    `${GOOGLE_ADS_API}/customers/${CUSTOMER_ID}/googleAds:search`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`GAQL error (${resp.status}): ${t}`);
  }
  const data = await resp.json();
  return data.results || [];
}
