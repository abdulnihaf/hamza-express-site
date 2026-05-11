// Google Ads Cockpit API — Unified analytics for /ops/google-cockpit/
// GET /api/google-cockpit?period=today|7d|30d|all
// Returns: campaign KPIs, ad group breakdown, keyword performance, daily trend, search terms

const API = 'https://googleads.googleapis.com/v23';
const CID = '3681710084';
// Fallback only — actual primary picked dynamically at request time from the
// full campaign list. Prefer the first ENABLED+SERVING campaign; this hardcode
// is only used if the campaign-list query fails entirely.
const FALLBACK_CAMPAIGN_ID = '23748431244';

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

    // Switched to googleAds:searchStream for reliability — :search silently
    // 400s on certain valid v23 queries (e.g., FROM campaign without WHERE)
    // because of GoogleAdsService:search idempotency requirements that
    // searchStream doesn't enforce. Stream returns { results: [...] } batches
    // which we flatten.
    const query = async (gaql) => {
      const resp = await fetch(`${API}/customers/${CID}/googleAds:searchStream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'developer-token': devToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: gaql }),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      const batches = Array.isArray(data) ? data : [data];
      const rows = [];
      for (const b of batches) for (const r of (b.results || [])) rows.push(r);
      return rows;
    };

    // ── Phase 1: pick primary campaign dynamically ──
    // Prefer the first ENABLED+SERVING campaign — that's what's actually
    // spending money. Fall back to oldest non-removed, then hardcoded ID.
    // Without this the cockpit header was locked to the paused Search
    // campaign even after PMax 23834053403 started running, showing the
    // misleading "campaign PAUSED — not running" banner.
    const allCampaignsData = await query(`
      SELECT
        campaign.id, campaign.name, campaign.status, campaign.serving_status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.id DESC
    `);

    let primary = allCampaignsData.find(r =>
      r.campaign?.status === 'ENABLED' && r.campaign?.servingStatus === 'SERVING'
    );
    if (!primary) primary = allCampaignsData[0];
    const primaryCampaignId   = primary?.campaign?.id || FALLBACK_CAMPAIGN_ID;
    const primaryCampaignName = primary?.campaign?.name || '';
    const primaryCampaignType = primary?.campaign?.advertisingChannelType || 'SEARCH';

    // ── Phase 2: parallel queries using the primary campaign ──
    // Ad-group / keyword / search-term queries return [] for PMax (it uses
    // asset_group instead). The UI hides those sections when type=PERFORMANCE_MAX.
    const [
      adGroupData, keywordData, dailyData, searchTermData, positionData,
      campaignStatus, negativeData, campaignMetrics,
      userListsData, customAudData, sharedSetsData, sharedCritData
    ] = await Promise.all([

      // 1. Ad group breakdown — Search-only (PMax has asset_groups)
      query(`
        SELECT
          ad_group.id, ad_group.name, ad_group.status,
          ad_group.cpc_bid_micros,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.ctr, metrics.average_cpc, metrics.conversions
        FROM ad_group
        WHERE campaign.id = ${primaryCampaignId} AND ${dateFilter}
        ORDER BY metrics.impressions DESC
      `),

      // 2. Keyword performance (includes quality_info + position_estimates)
      //    quality_info.quality_score — 1-10 Google's prediction of keyword quality
      //    position_estimates.first_page_cpc_micros — what you'd need to bid to show on page 1
      //    position_estimates.top_of_page_cpc_micros — bid to show above organic
      query(`
        SELECT
          ad_group_criterion.criterion_id,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          ad_group_criterion.cpc_bid_micros,
          ad_group_criterion.quality_info.quality_score,
          ad_group_criterion.quality_info.creative_quality_score,
          ad_group_criterion.quality_info.post_click_quality_score,
          ad_group_criterion.quality_info.search_predicted_ctr,
          ad_group_criterion.position_estimates.first_page_cpc_micros,
          ad_group_criterion.position_estimates.top_of_page_cpc_micros,
          ad_group.id,
          ad_group.name,
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.ctr, metrics.average_cpc, metrics.conversions,
          metrics.search_impression_share
        FROM keyword_view
        WHERE campaign.id = ${primaryCampaignId} AND ${dateFilter}
        ORDER BY metrics.impressions DESC
      `),

      // 3. Daily trend
      query(`
        SELECT
          segments.date,
          metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM ad_group
        WHERE campaign.id = ${primaryCampaignId} AND ${dateFilter}
        ORDER BY segments.date ASC
      `),

      // 4. Search terms — what people actually typed
      query(`
        SELECT
          search_term_view.search_term,
          segments.search_term_match_type,
          metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM search_term_view
        WHERE campaign.id = ${primaryCampaignId} AND ${dateFilter}
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
        WHERE campaign.id = ${primaryCampaignId} AND ${dateFilter}
      `),

      // 6. Campaign status (no date filter — always current)
      query(`
        SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status
        FROM campaign
        WHERE campaign.id = ${primaryCampaignId}
      `),

      // 7. Existing negative keywords — so the UI can flip search-terms to "Blocked"
      query(`
        SELECT
          campaign_criterion.keyword.text,
          campaign_criterion.keyword.match_type,
          campaign_criterion.status
        FROM campaign_criterion
        WHERE campaign.id = ${primaryCampaignId}
          AND campaign_criterion.type = 'KEYWORD'
          AND campaign_criterion.negative = true
      `),

      // 8. Campaign-level metrics — works for BOTH Search and PMax (PMax has no
      //    ad_groups so summing query #1 returns 0). Use this as the overview
      //    source of truth; sum-of-ad-groups is now a Search-only fallback.
      query(`
        SELECT
          metrics.impressions, metrics.clicks, metrics.cost_micros,
          metrics.conversions, metrics.ctr, metrics.average_cpc
        FROM campaign
        WHERE campaign.id = ${primaryCampaignId} AND ${dateFilter}
      `),

      // 9. Customer Match user lists (audience signals for PMax)
      query(`
        SELECT
          user_list.id, user_list.name, user_list.description,
          user_list.size_for_display, user_list.size_for_search,
          user_list.membership_status, user_list.membership_life_span,
          user_list.crm_based_user_list.upload_key_type,
          user_list.read_only
        FROM user_list
        WHERE user_list.read_only = false
        ORDER BY user_list.id DESC
      `),

      // 10. Custom audiences (keyword-based intent segments)
      query(`
        SELECT
          custom_audience.id, custom_audience.name, custom_audience.description,
          custom_audience.status, custom_audience.type
        FROM custom_audience
        WHERE custom_audience.status != 'REMOVED'
      `),

      // 11. Shared sets (negative keyword lists, etc.)
      query(`
        SELECT
          shared_set.id, shared_set.name, shared_set.type,
          shared_set.member_count, shared_set.reference_count, shared_set.status
        FROM shared_set
        WHERE shared_set.status != 'REMOVED'
      `),

      // 12. Shared criteria — actual keywords inside the shared sets
      query(`
        SELECT
          shared_set.id, shared_set.name,
          shared_criterion.keyword.text, shared_criterion.keyword.match_type,
          shared_criterion.type
        FROM shared_criterion
        WHERE shared_set.status != 'REMOVED'
        LIMIT 200
      `),
    ]);

    // Build the audience-layer view (PMax signals + lookalike seed + neg list)
    const allCampaigns = allCampaignsData.map(r => {
      const c = r.campaign || {};
      const b = r.campaignBudget || {};
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        servingStatus: c.servingStatus,
        channelType: c.advertisingChannelType,
        channelSubType: c.advertisingChannelSubType,
        startDate: c.startDate,
        endDate: c.endDate,
        budgetINR: b.amountMicros ? +(parseInt(b.amountMicros) / 1e6).toFixed(0) : null,
      };
    });

    const userLists = userListsData.map(r => {
      const u = r.userList || {};
      return {
        id: u.id,
        name: u.name,
        description: u.description,
        sizeForDisplay: parseInt(u.sizeForDisplay) || 0,
        sizeForSearch: parseInt(u.sizeForSearch) || 0,
        membershipStatus: u.membershipStatus,
        membershipLifeSpan: u.membershipLifeSpan,
        uploadKeyType: u.crmBasedUserList?.uploadKeyType,
      };
    });

    const customAudiences = customAudData.map(r => {
      const c = r.customAudience || {};
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        status: c.status,
        type: c.type,
      };
    });

    // Build shared sets with their criteria attached (group sharedCritData by sharedSet.id)
    const critsBySetId = sharedCritData.reduce((acc, r) => {
      const setId = r.sharedSet?.id;
      const kw = r.sharedCriterion?.keyword?.text;
      if (!setId || !kw) return acc;
      if (!acc[setId]) acc[setId] = [];
      acc[setId].push({ text: kw, matchType: r.sharedCriterion.keyword.matchType, type: r.sharedCriterion.type });
      return acc;
    }, {});
    const sharedSets = sharedSetsData.map(r => {
      const s = r.sharedSet || {};
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        memberCount: parseInt(s.memberCount) || 0,
        referenceCount: parseInt(s.referenceCount) || 0,
        keywords: critsBySetId[s.id] || [],
      };
    });

    // Build overview — prefer campaign-level metrics (works for both Search +
    // PMax). Sum of ad_group data is the Search-only fallback when the
    // campaign-level row is empty (e.g. brand-new campaigns).
    const cm = campaignMetrics[0]?.metrics || {};
    const aggAdGroupImpr  = adGroupData.reduce((s, r) => s + int(r.metrics?.impressions), 0);
    const aggAdGroupClks  = adGroupData.reduce((s, r) => s + int(r.metrics?.clicks), 0);
    const aggAdGroupCost  = adGroupData.reduce((s, r) => s + (parseInt(r.metrics?.costMicros) || 0), 0);
    const aggAdGroupConv  = adGroupData.reduce((s, r) => s + float(r.metrics?.conversions), 0);

    const aggImpressions = int(cm.impressions)  || aggAdGroupImpr;
    const aggClicks      = int(cm.clicks)       || aggAdGroupClks;
    const aggCostMicros  = parseInt(cm.costMicros) || aggAdGroupCost;
    const aggConversions = float(cm.conversions) || aggAdGroupConv;

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

    // Parse keywords — include quality_info + position_estimates
    const keywords = keywordData.map(r => {
      const qi = r.adGroupCriterion?.qualityInfo || {};
      const pe = r.adGroupCriterion?.positionEstimates || {};
      return {
        keyword: r.adGroupCriterion?.keyword?.text || '',
        matchType: r.adGroupCriterion?.keyword?.matchType || '',
        criterionId: r.adGroupCriterion?.criterionId || null,
        adGroupId: r.adGroup?.id || null,
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
        // Quality signals — qualityScore is the composite 1-10 rating
        qualityScore: int(qi.qualityScore),
        creativeQuality: qi.creativeQualityScore || '',       // ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE
        landingQuality: qi.postClickQualityScore || '',
        predictedCtr: qi.searchPredictedCtr || '',
        // Bid estimates — what it takes to show
        firstPageCpc: pe.firstPageCpcMicros ? +(parseInt(pe.firstPageCpcMicros) / 1e6).toFixed(1) : null,
        topOfPageCpc: pe.topOfPageCpcMicros ? +(parseInt(pe.topOfPageCpcMicros) / 1e6).toFixed(1) : null,
      };
    });

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

    // Existing negative keywords — lets the UI flip blocked rows without a round-trip
    const negatives = (negativeData || []).map(r => ({
      text: r.campaignCriterion?.keyword?.text || '',
      matchType: r.campaignCriterion?.keyword?.matchType || '',
      status: r.campaignCriterion?.status || '',
    })).filter(n => n.text);

    return new Response(JSON.stringify({
      success: true,
      period,
      asOf: todayIST(),
      campaignId: primaryCampaignId,
      campaignName: primaryCampaignName,
      campaignType: primaryCampaignType,  // 'SEARCH' | 'PERFORMANCE_MAX' | etc.
      overview,
      adGroups,
      keywords,
      daily,
      searchTerms,
      negatives,
      // Layered intelligence — surfaces the PMax-readiness state
      allCampaigns,
      audiences: {
        userLists,
        customAudiences,
      },
      sharedSets,
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
