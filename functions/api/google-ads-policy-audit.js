// Google Ads policy diagnostic — read-only.
// Lists ad/asset policy summaries and checks whether declared URLs redirect away
// from hamzaexpress.in, which is the common cause of Destination mismatch.

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';
const CUSTOMER_ID = '3681710084';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== 'GET') return json({ error: 'GET only' }, 405);

  try {
    const url = new URL(request.url);
    const campaignId = url.searchParams.get('campaign');
    const accessToken = await getAccessToken(env);
    const where = campaignId
      ? `campaign.id = ${escapeNumber(campaignId)}`
      : `campaign.status != 'REMOVED'`;

    const [campaigns, ads, campaignAssets, adGroupAssets, assetGroupAssets] = await Promise.all([
      runQuery(accessToken, env, 'campaigns', `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign.primary_status,
          campaign.primary_status_reasons,
          campaign.serving_status
        FROM campaign
        WHERE ${where}
        ORDER BY campaign.id DESC
      `),
      runQuery(accessToken, env, 'ad_group_ads', `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          ad_group.id,
          ad_group.name,
          ad_group.status,
          ad_group_ad.ad.id,
          ad_group_ad.status,
          ad_group_ad.ad.final_urls,
          ad_group_ad.ad.tracking_url_template,
          ad_group_ad.policy_summary.approval_status,
          ad_group_ad.policy_summary.review_status,
          ad_group_ad.policy_summary.policy_topic_entries
        FROM ad_group_ad
        WHERE ${where}
      `),
      runQuery(accessToken, env, 'campaign_assets', `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign_asset.asset,
          campaign_asset.field_type,
          campaign_asset.status,
          campaign_asset.policy_summary.approval_status,
          campaign_asset.policy_summary.review_status,
          campaign_asset.policy_summary.policy_topic_entries,
          asset.id,
          asset.name,
          asset.final_urls,
          asset.tracking_url_template,
          asset.sitelink_asset.link_text,
          asset.sitelink_asset.description1,
          asset.sitelink_asset.description2,
          asset.callout_asset.callout_text
        FROM campaign_asset
        WHERE ${where}
      `),
      runQuery(accessToken, env, 'ad_group_assets', `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          ad_group.id,
          ad_group.name,
          ad_group_asset.asset,
          ad_group_asset.field_type,
          ad_group_asset.status,
          ad_group_asset.policy_summary.approval_status,
          ad_group_asset.policy_summary.review_status,
          ad_group_asset.policy_summary.policy_topic_entries,
          asset.id,
          asset.name,
          asset.final_urls,
          asset.tracking_url_template,
          asset.sitelink_asset.link_text,
          asset.callout_asset.callout_text
        FROM ad_group_asset
        WHERE ${where}
      `),
      runQuery(accessToken, env, 'asset_group_assets', `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          asset_group.id,
          asset_group.name,
          asset_group_asset.asset,
          asset_group_asset.field_type,
          asset_group_asset.status,
          asset_group_asset.policy_summary.approval_status,
          asset_group_asset.policy_summary.review_status,
          asset_group_asset.policy_summary.policy_topic_entries,
          asset.id,
          asset.name,
          asset.final_urls,
          asset.tracking_url_template,
          asset.text_asset.text,
          asset.youtube_video_asset.youtube_video_id
        FROM asset_group_asset
        WHERE ${where}
      `),
    ]);

    const issues = [
      ...collectPolicyIssues('ad', ads.rows),
      ...collectPolicyIssues('campaign_asset', campaignAssets.rows),
      ...collectPolicyIssues('ad_group_asset', adGroupAssets.rows),
      ...collectPolicyIssues('asset_group_asset', assetGroupAssets.rows),
    ];
    const urls = uniqueUrls([
      ...collectUrls(ads.rows),
      ...collectUrls(campaignAssets.rows),
      ...collectUrls(adGroupAssets.rows),
      ...collectUrls(assetGroupAssets.rows),
    ]);
    const urlAudit = await auditUrls(urls);

    return json({
      success: true,
      generatedAt: new Date().toISOString(),
      customerId: CUSTOMER_ID,
      campaignFilter: campaignId || 'all_non_removed',
      summary: {
        campaigns: campaigns.rows.length,
        policyIssues: issues.length,
        urlChecks: urlAudit.length,
        queryErrors: [campaigns, ads, campaignAssets, adGroupAssets, assetGroupAssets]
          .filter(q => !q.ok)
          .map(q => ({ name: q.name, error: q.error })),
      },
      issues,
      urlAudit,
      campaigns: campaigns.rows.map(row => ({
        id: row.campaign?.id,
        name: row.campaign?.name,
        status: row.campaign?.status,
        type: row.campaign?.advertisingChannelType,
        primaryStatus: row.campaign?.primaryStatus,
        primaryStatusReasons: row.campaign?.primaryStatusReasons || [],
        servingStatus: row.campaign?.servingStatus,
      })),
      queryStatus: [campaigns, ads, campaignAssets, adGroupAssets, assetGroupAssets].map(q => ({
        name: q.name,
        ok: q.ok,
        rows: q.rows.length,
        error: q.error || null,
      })),
    });
  } catch (err) {
    return json({ success: false, error: err.message, stack: err.stack }, 500);
  }
}

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
  if (!data.access_token) throw new Error(`OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function runQuery(accessToken, env, name, query) {
  try {
    const resp = await fetch(`${GOOGLE_ADS_API}/customers/${CUSTOMER_ID}/googleAds:search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!resp.ok) return { name, ok: false, rows: [], error: await resp.text() };
    const data = await resp.json();
    return { name, ok: true, rows: data.results || [] };
  } catch (err) {
    return { name, ok: false, rows: [], error: err.message };
  }
}

function collectPolicyIssues(source, rows) {
  return rows
    .map(row => {
      const carrier = row.adGroupAd || row.campaignAsset || row.adGroupAsset || row.assetGroupAsset || {};
      const policy = carrier.policySummary || {};
      const approval = policy.approvalStatus || '';
      const review = policy.reviewStatus || '';
      const topics = policyTopicNames(policy.policyTopicEntries || []);
      const isIssue = approval && !['APPROVED', 'APPROVED_LIMITED'].includes(approval);
      if (!isIssue && !topics.length) return null;
      return {
        source,
        campaignId: row.campaign?.id,
        campaignName: row.campaign?.name,
        campaignStatus: row.campaign?.status,
        campaignType: row.campaign?.advertisingChannelType,
        adGroupId: row.adGroup?.id || row.assetGroup?.id || null,
        adGroupName: row.adGroup?.name || row.assetGroup?.name || null,
        adId: row.adGroupAd?.ad?.id || null,
        asset: carrier.asset || null,
        assetId: row.asset?.id || null,
        assetName: row.asset?.name || null,
        fieldType: carrier.fieldType || null,
        status: carrier.status || row.adGroupAd?.status || null,
        approvalStatus: approval || null,
        reviewStatus: review || null,
        policyTopics: topics,
        finalUrls: finalUrls(row),
        trackingUrlTemplate: row.adGroupAd?.ad?.trackingUrlTemplate || row.asset?.trackingUrlTemplate || null,
        text: row.asset?.sitelinkAsset?.linkText || row.asset?.calloutAsset?.calloutText || row.asset?.textAsset?.text || null,
        rawPolicy: policy,
      };
    })
    .filter(Boolean);
}

function collectUrls(rows) {
  return rows.flatMap(finalUrls).filter(Boolean);
}

function finalUrls(row) {
  return row.adGroupAd?.ad?.finalUrls || row.asset?.finalUrls || [];
}

function policyTopicNames(entries) {
  return entries.map(entry => ({
    type: entry.type || null,
    topic: entry.policyTopicEntry?.topic || entry.topic || null,
    evidences: entry.policyTopicEntry?.evidences || entry.evidences || [],
    constraints: entry.policyTopicEntry?.constraints || entry.constraints || [],
  }));
}

function uniqueUrls(urls) {
  return [...new Set(urls)].slice(0, 40);
}

async function auditUrls(urls) {
  const checks = await Promise.all(urls.map(async finalUrl => {
    const declared = safeUrl(finalUrl);
    if (!declared) return { finalUrl, ok: false, error: 'invalid_url' };
    try {
      const resp = await fetch(finalUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'HN-Google-Ads-Policy-Audit/1.0' },
      });
      const landing = safeUrl(resp.url || finalUrl);
      return {
        finalUrl,
        status: resp.status,
        declaredHost: declared.hostname,
        landingUrl: resp.url || finalUrl,
        landingHost: landing?.hostname || null,
        destinationMismatchRisk: Boolean(landing && declared.hostname !== landing.hostname),
        ok: resp.ok,
      };
    } catch (err) {
      return {
        finalUrl,
        declaredHost: declared.hostname,
        ok: false,
        error: err.message,
      };
    }
  }));
  return checks;
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function escapeNumber(value) {
  if (!/^\d+$/.test(String(value || ''))) throw new Error('campaign must be numeric');
  return value;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
