// Google Ads — PMax Store Goals Campaign Creator (v23)
//
// Builds a Performance Max campaign for HE walk-in store visits, wiring up:
//   Budget → Campaign → AssetGroup → text/image assets → AssetGroupAsset links →
//   AssetGroupSignal (3 custom audiences) → CampaignSharedSet (negative keywords) →
//   CampaignCriterion (geo + language) → CampaignAsset (GBP location)
//
// Created campaign and asset group are PAUSED — owner flips to ENABLED in Ads UI
// after reviewing assets and final-URL.
//
// Actions:
//   GET  /api/google-ads-create-pmax?action=preflight
//        Readiness report — what's wired, what's missing.
//
//   GET  /api/google-ads-create-pmax?action=list-assets
//        Lists all existing assets (text, image, logo) on the account.
//
//   POST /api/google-ads-create-pmax?action=create-text-assets
//        body: { headlines:[...], longHeadlines:[...], descriptions:[...], businessName }
//        Bulk-creates text assets, returns resource names.
//
//   POST /api/google-ads-create-pmax?action=upload-image-asset
//        body: { imageUrl, name, type:"MARKETING_IMAGE"|"SQUARE_MARKETING_IMAGE"|"LOGO"|"LANDSCAPE_LOGO" }
//        Downloads image from URL and uploads as asset, returns resource name.
//
//   POST /api/google-ads-create-pmax?action=create
//        body: {
//          name: "HE — PMax Store Goals — v1",     // campaign name
//          budgetINR: 300,                         // daily budget in rupees
//          finalUrl: "https://hamzaexpress.in/",
//          assetGroupName: "HE Asset Group v1",
//          textAssets: { headlines:[ids], longHeadlines:[ids], descriptions:[ids], businessNames:[ids] },
//          imageAssets: { marketing:[ids], squareMarketing:[ids], logos:[ids], landscapeLogos:[ids] },
//          videoAssets: [ids],                     // optional, [] is fine — Google auto-generates
//          signals: { audienceIds:[975639929,976493592,976494318], userListIds:["9384755106"] },
//          negativeKeywordSetId: "12074853990",
//          geoTargetIds: [1007765],                // 1007765 = Bangalore. Multiple allowed.
//          languageIds: [1000, 1098, 1023],        // 1000=English, 1098=Hindi, 1023=Kannada
//          locationAssetSetId: null                // optional — for Store Visits goal
//        }
//        Full orchestration. Returns all created resource names.
//
//   GET  /api/google-ads-create-pmax?action=remove-pmax&id=X
//        Marks PMax campaign REMOVED.
//
// Required secrets (same as google-ads.js):
//   GOOGLE_ADS_DEV_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN

const API = 'https://googleads.googleapis.com/v23';
const CID = '3681710084'; // HE Google Ads account

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';

  try {
    const token = await getAccessToken(env);
    const body = request.method === 'POST'
      ? await request.json().catch(() => ({}))
      : {};

    switch (action) {
      case 'preflight':         return await preflight(token, env);
      case 'list-assets':       return await listAssets(token, env);
      case 'create-text-assets':return await createTextAssets(token, env, body);
      case 'upload-image-asset':return await uploadImageAsset(token, env, body);
      case 'create':            return await createPmax(token, env, body);
      case 'enrich-pmax':       return await enrichPmax(token, env, body);
      case 'update-campaign':   return await updateCampaign(token, env, body);
      case 'update-asset-group':return await updateAssetGroup(token, env, body);
      case 'list-campaign-goals':return await listCampaignGoals(token, env, url.searchParams.get('id'));
      case 'remove-pmax':       return await removePmax(token, env, url.searchParams.get('id'));
      default:
        return j({ error: `unknown action: ${action}`, valid: ['preflight','list-assets','create-text-assets','upload-image-asset','create','enrich-pmax','update-campaign','update-asset-group','list-campaign-goals','remove-pmax'] }, 400);
    }
  } catch (err) {
    return j({ error: err.message, stack: env.DEBUG ? err.stack : undefined }, 500);
  }
}

// ─── OAuth ───────────────────────────────────────────────────────────────
async function getAccessToken(env) {
  for (const k of ['GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_DEV_TOKEN']) {
    if (!env[k]) throw new Error(`Missing secret ${k}`);
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`OAuth failed: ${JSON.stringify(d).slice(0,200)}`);
  return d.access_token;
}

async function ads(token, env, path, body, method = 'POST') {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
      'Content-Type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d.error?.message || d.error?.status || `HTTP ${r.status}`;
    // 5000-char window — Ads API can return multiple errorCodes per failure
    // and we need to see all of them to iterate quickly.
    throw new Error(`${method} ${path} → ${r.status}: ${msg}\n${JSON.stringify(d).slice(0,5000)}`);
  }
  return d;
}

async function gaql(token, env, query) {
  const data = await ads(token, env, `/customers/${CID}/googleAds:searchStream`, {
    query: query.replace(/\s+/g, ' ').trim(),
  });
  const batches = Array.isArray(data) ? data : [data];
  const rows = [];
  for (const b of batches) for (const r of (b.results || [])) rows.push(r);
  return rows;
}

// ─── Preflight: readiness report ─────────────────────────────────────────
async function preflight(token, env) {
  const checks = {};
  const gaps = [];

  // 1. Customer info — verification + conversion-tracking
  try {
    const cust = await gaql(token, env, `
      SELECT customer.id, customer.descriptive_name, customer.currency_code,
             customer.time_zone, customer.test_account, customer.manager,
             customer.status, customer.conversion_tracking_setting.conversion_tracking_status
      FROM customer LIMIT 1
    `);
    checks.customer = cust[0]?.customer || null;
    if (!checks.customer) gaps.push('customer record not readable');
    if (checks.customer?.status !== 'ENABLED') gaps.push(`customer status is ${checks.customer?.status}, not ENABLED`);
  } catch (e) { checks.customer = { error: e.message }; gaps.push(`customer query failed: ${e.message}`); }

  // 2. Conversion actions — at least one ENABLED for PMax to optimize against
  try {
    const conv = await gaql(token, env, `
      SELECT conversion_action.id, conversion_action.name, conversion_action.status,
             conversion_action.type, conversion_action.category, conversion_action.primary_for_goal
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
    `);
    checks.conversionActions = conv.map(c => c.conversionAction);
    if (checks.conversionActions.length === 0) {
      gaps.push('no ENABLED conversion actions — PMax needs ≥1 to optimize. Set up "Store visits" or "Calls" conversion in Ads UI → Goals.');
    }
    const storeVisits = checks.conversionActions.find(c => c.type === 'STORE_VISITS' || c.category === 'STORE_VISIT');
    checks.hasStoreVisits = !!storeVisits;
    if (!storeVisits) gaps.push('no STORE_VISITS conversion action — required for Store Goals PMax. Create in Ads UI or wait for Google to auto-create after GBP link.');
  } catch (e) { checks.conversionActions = { error: e.message }; gaps.push(`conversion actions query failed: ${e.message}`); }

  // 3. GBP / location assets at customer level
  try {
    const locAssets = await gaql(token, env, `
      SELECT asset.id, asset.name, asset.type, asset.location_asset.business_profile_locations,
             asset.location_asset.location_ownership_type
      FROM asset
      WHERE asset.type = 'LOCATION'
    `);
    checks.locationAssets = locAssets.map(r => r.asset);
    if (checks.locationAssets.length === 0) {
      gaps.push('no LOCATION assets — GBP not linked to Ads account. Link in Ads UI → Tools → Linked accounts → Google Business Profile.');
    }
  } catch (e) { checks.locationAssets = { error: e.message }; gaps.push(`location assets query failed: ${e.message}`); }

  // 4. Audiences (custom audiences) — should be 3
  try {
    const auds = await gaql(token, env, `
      SELECT custom_audience.id, custom_audience.name, custom_audience.status
      FROM custom_audience
      WHERE custom_audience.status = 'ENABLED'
    `);
    checks.customAudiences = auds.map(r => r.customAudience);
    if (checks.customAudiences.length < 3) gaps.push(`expected ≥3 ENABLED custom audiences, found ${checks.customAudiences.length}`);
  } catch (e) { checks.customAudiences = { error: e.message }; gaps.push(`custom audiences query failed: ${e.message}`); }

  // 5. Shared sets (negative keyword list)
  try {
    const sets = await gaql(token, env, `
      SELECT shared_set.id, shared_set.name, shared_set.type, shared_set.member_count, shared_set.reference_count
      FROM shared_set
      WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
    `);
    checks.negativeKeywordSets = sets.map(r => r.sharedSet);
    if (checks.negativeKeywordSets.length === 0) gaps.push('no NEGATIVE_KEYWORDS shared sets — create via /api/google-ads-audiences?action=create-negative-keyword-list');
  } catch (e) { checks.negativeKeywordSets = { error: e.message }; gaps.push(`shared sets query failed: ${e.message}`); }

  // 6. User lists (Customer Match)
  try {
    const lists = await gaql(token, env, `
      SELECT user_list.id, user_list.name, user_list.size_for_display, user_list.size_for_search,
             user_list.membership_status
      FROM user_list
      WHERE user_list.read_only = false
    `);
    checks.userLists = lists.map(r => r.userList);
  } catch (e) { checks.userLists = { error: e.message }; }

  // 7. Existing PMax campaigns (so we don't duplicate)
  try {
    const camps = await gaql(token, env, `
      SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
    `);
    checks.existingPmaxCampaigns = camps.map(r => r.campaign);
  } catch (e) { checks.existingPmaxCampaigns = { error: e.message }; }

  return j({
    ok: gaps.length === 0,
    summary: gaps.length === 0
      ? 'All checks passed — ready to create PMax campaign.'
      : `${gaps.length} gap(s) — see "gaps" array.`,
    gaps,
    checks,
  });
}

// ─── List existing assets ────────────────────────────────────────────────
// v23 quirk: GAQL WHERE clause rejects 'BUSINESS_NAME' and 'LOGO' as asset.type
// enum values even though they are valid at the resource level. Drop the WHERE
// filter and bucket client-side instead. This may pull a lot of rows on busy
// accounts — cap to ~500 by adding LIMIT.
async function listAssets(token, env) {
  const rows = await gaql(token, env, `
    SELECT asset.id, asset.name, asset.type, asset.resource_name,
           asset.text_asset.text,
           asset.image_asset.full_size.url, asset.image_asset.full_size.width_pixels,
           asset.image_asset.full_size.height_pixels, asset.image_asset.file_size,
           asset.youtube_video_asset.youtube_video_id,
           asset.call_asset.country_code, asset.call_asset.phone_number,
           asset.callout_asset.callout_text,
           asset.call_to_action_asset.call_to_action,
           asset.location_asset.business_profile_locations
    FROM asset
    LIMIT 500
  `);
  // Bucket by type for easy consumption — keep the legacy type names so
  // downstream consumers don't break.
  const byType = { TEXT:[], IMAGE:[], YOUTUBE_VIDEO:[], BUSINESS_NAME:[], LOGO:[], OTHER:[] };
  for (const r of rows) {
    const a = r.asset;
    if (byType[a.type]) byType[a.type].push(a);
    else byType.OTHER.push(a);
  }
  return j({ ok: true, count: rows.length, assets: byType });
}

// ─── Create text assets in bulk ──────────────────────────────────────────
async function createTextAssets(token, env, body) {
  const headlines      = body.headlines      || [];  // ≤30 chars
  const longHeadlines  = body.longHeadlines  || [];  // ≤90 chars
  const descriptions   = body.descriptions   || [];  // ≤90 chars
  const businessNames  = body.businessNames  || [];  // ≤25 chars (typically 1)

  // Validate lengths
  const errs = [];
  headlines.forEach((h,i) => h.length > 30 && errs.push(`headline[${i}] >30 chars: "${h}"`));
  longHeadlines.forEach((h,i) => h.length > 90 && errs.push(`longHeadline[${i}] >90 chars`));
  descriptions.forEach((d,i) => d.length > 90 && errs.push(`description[${i}] >90 chars`));
  businessNames.forEach((b,i) => b.length > 25 && errs.push(`businessName[${i}] >25 chars: "${b}"`));
  if (errs.length) return j({ error: 'validation failed', details: errs }, 400);

  // Build operations. v23 has no businessNameAsset resource — "business name"
  // is just a TEXT asset, bound to the asset group with field_type=BUSINESS_NAME.
  const operations = [];
  const tag = []; // parallel array to track which slot each op is for

  for (const t of headlines)      { operations.push({ create: { textAsset: { text: t } } }); tag.push({ kind: 'headline',      text: t }); }
  for (const t of longHeadlines)  { operations.push({ create: { textAsset: { text: t } } }); tag.push({ kind: 'longHeadline',  text: t }); }
  for (const t of descriptions)   { operations.push({ create: { textAsset: { text: t } } }); tag.push({ kind: 'description',   text: t }); }
  for (const b of businessNames)  { operations.push({ create: { textAsset: { text: b } } }); tag.push({ kind: 'businessName',  text: b }); }

  if (operations.length === 0) return j({ ok: true, message: 'nothing to create', resources: {} });

  const r = await ads(token, env, `/customers/${CID}/assets:mutate`, {
    operations,
    partialFailure: true,
  });

  // Map results back to slots — kind tag is 1:1 with the input order
  const results = (r.results || []).map((res, i) => ({ ...tag[i], resourceName: res.resourceName }));
  const buckets = {
    headlines:     results.filter(x => x.kind === 'headline'),
    longHeadlines: results.filter(x => x.kind === 'longHeadline'),
    descriptions:  results.filter(x => x.kind === 'description'),
    businessNames: results.filter(x => x.kind === 'businessName'),
  };
  return j({ ok: true, partialFailureError: r.partialFailureError, resources: buckets });
}

// ─── Upload image asset (from URL) ───────────────────────────────────────
async function uploadImageAsset(token, env, body) {
  const { imageUrl, name } = body;
  const fieldType = body.type || 'MARKETING_IMAGE';
  if (!imageUrl) return j({ error: 'imageUrl required' }, 400);
  if (!name) return j({ error: 'name required' }, 400);

  // Download image
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`image fetch ${imgResp.status} for ${imageUrl}`);
  const buf = await imgResp.arrayBuffer();
  const sizeKb = (buf.byteLength / 1024).toFixed(1);
  if (buf.byteLength > 5_242_880) throw new Error(`image too large (${sizeKb}kb, max 5120kb)`);

  // Base64-encode for API
  const bytes = new Uint8Array(buf);
  const b64 = btoa(String.fromCharCode(...bytes));

  // API — note image type is just 'IMAGE'; the field-type binding happens later in AssetGroupAsset
  const r = await ads(token, env, `/customers/${CID}/assets:mutate`, {
    operations: [{
      create: {
        name,
        type: 'IMAGE',
        imageAsset: { data: b64 },
      }
    }],
  });
  const resource = r.results?.[0]?.resourceName;
  return j({ ok: true, resource, sizeKb, intendedFieldType: fieldType });
}

// ─── Full PMax create orchestration ──────────────────────────────────────
// Atomic: builds budget + campaign + brand-guidelines campaign-asset links +
// asset group + asset-group asset bindings + audience signals + neg-kw set +
// geo/language criteria — all in ONE googleAds:mutate call. Required because
// PMax campaigns with Brand Guidelines validate the BUSINESS_NAME / LOGO
// CampaignAsset links during campaign create — separate-step builds hit
// REQUIRED_BUSINESS_NAME_ASSET_NOT_LINKED / REQUIRED_LOGO_ASSET_NOT_LINKED.
//
// Cross-references between operations use negative temp IDs that the API
// rewrites to real resource names atomically. If any operation fails, the
// whole transaction rolls back.
async function createPmax(token, env, body) {
  // Validate inputs
  const required = ['name','budgetINR','finalUrl','assetGroupName','textAssets','imageAssets','signals','geoTargetIds','languageIds'];
  for (const k of required) if (!(k in body)) return j({ error: `body.${k} required` }, 400);

  const { textAssets, imageAssets, signals, negativeKeywordSetId, locationAssetSetId } = body;
  if (!textAssets.headlines?.length || textAssets.headlines.length < 3)         return j({ error: 'need ≥3 headline asset resources' }, 400);
  if (!textAssets.longHeadlines?.length || textAssets.longHeadlines.length < 1) return j({ error: 'need ≥1 longHeadline asset resource' }, 400);
  if (!textAssets.descriptions?.length || textAssets.descriptions.length < 2)   return j({ error: 'need ≥2 description asset resources' }, 400);
  if (!textAssets.businessNames?.length)                                        return j({ error: 'need ≥1 businessName asset resource' }, 400);
  if (!imageAssets.marketing?.length)                                           return j({ error: 'need ≥1 marketing image asset' }, 400);
  if (!imageAssets.squareMarketing?.length)                                     return j({ error: 'need ≥1 squareMarketing image asset' }, 400);
  if (!imageAssets.logos?.length)                                               return j({ error: 'need ≥1 logo asset' }, 400);

  // Temp resource names — rewritten by API atomically
  const budgetTmp   = `customers/${CID}/campaignBudgets/-1`;
  const campaignTmp = `customers/${CID}/campaigns/-2`;
  const agTmp       = `customers/${CID}/assetGroups/-3`;

  const ops = [];
  const budgetMicros = Math.round(body.budgetINR * 1_000_000);

  // 1. Budget
  ops.push({
    campaignBudgetOperation: {
      create: {
        resourceName: budgetTmp,
        name: `${body.name} — Budget`,
        amountMicros: String(budgetMicros),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      }
    }
  });

  // 2. Campaign (PAUSED)
  ops.push({
    campaignOperation: {
      create: {
        resourceName: campaignTmp,
        name: body.name,
        status: 'PAUSED',
        advertisingChannelType: 'PERFORMANCE_MAX',
        campaignBudget: budgetTmp,
        biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
        maximizeConversions: {},
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      }
    }
  });

  // 3. CampaignAsset links — Brand Guidelines requires BUSINESS_NAME + LOGO at campaign level
  for (const bn of textAssets.businessNames) {
    ops.push({
      campaignAssetOperation: { create: { campaign: campaignTmp, asset: bn, fieldType: 'BUSINESS_NAME' } }
    });
  }
  for (const logo of imageAssets.logos) {
    ops.push({
      campaignAssetOperation: { create: { campaign: campaignTmp, asset: logo, fieldType: 'LOGO' } }
    });
  }
  for (const lscapeLogo of (imageAssets.landscapeLogos || [])) {
    ops.push({
      campaignAssetOperation: { create: { campaign: campaignTmp, asset: lscapeLogo, fieldType: 'LANDSCAPE_LOGO' } }
    });
  }

  // 4. Asset Group (PAUSED)
  ops.push({
    assetGroupOperation: {
      create: {
        resourceName: agTmp,
        name: body.assetGroupName,
        campaign: campaignTmp,
        finalUrls: [body.finalUrl],
        status: 'PAUSED',
      }
    }
  });

  // 5. AssetGroupAsset bindings.
  // With Brand Guidelines enabled, BUSINESS_NAME, LOGO, and LANDSCAPE_LOGO
  // must ONLY be linked at campaign level (CampaignAsset above) — adding them
  // here too triggers BRAND_ASSETS_NOT_LINKED_AT_CAMPAIGN_LEVEL. So we skip
  // those field types in the asset-group binding pass.
  const link = (asset, fieldType) => ops.push({
    assetGroupAssetOperation: { create: { assetGroup: agTmp, asset, fieldType } }
  });
  textAssets.headlines.forEach(r => link(r, 'HEADLINE'));
  textAssets.longHeadlines.forEach(r => link(r, 'LONG_HEADLINE'));
  textAssets.descriptions.forEach(r => link(r, 'DESCRIPTION'));
  imageAssets.marketing.forEach(r => link(r, 'MARKETING_IMAGE'));
  imageAssets.squareMarketing.forEach(r => link(r, 'SQUARE_MARKETING_IMAGE'));
  (body.videoAssets || []).forEach(r => link(r, 'YOUTUBE_VIDEO'));
  // skipped (must stay campaign-level under Brand Guidelines):
  //   BUSINESS_NAME, LOGO, LANDSCAPE_LOGO

  // 6. AssetGroupSignal — audience signals
  // v23 changed AssetGroupSignal.audience to AudienceInfo { audience: <resource> }
  // (was: nested customAudiences/userLists arrays). To use custom audiences +
  // user lists as PMax signals, we wrap them in a combined Audience resource
  // first, then reference that Audience from AssetGroupSignal.
  // v23: AudienceSegment.customAudience is a CustomAudienceSegment wrapper
  // ({ customAudience: <resource> }), not a flat string. Same for userList.
  const audienceSegments = [];
  for (const audId of (signals.audienceIds || [])) {
    audienceSegments.push({
      customAudience: { customAudience: `customers/${CID}/customAudiences/${audId}` }
    });
  }
  for (const ulId of (signals.userListIds || [])) {
    audienceSegments.push({
      userList: { userList: `customers/${CID}/userLists/${ulId}` }
    });
  }
  if (audienceSegments.length) {
    const audienceTmp = `customers/${CID}/audiences/-4`;
    ops.push({
      audienceOperation: {
        create: {
          resourceName: audienceTmp,
          name: `${body.name} — Signal`,
          description: 'Combined audience signal for PMax (custom audiences + user lists)',
          dimensions: [{ audienceSegments: { segments: audienceSegments } }],
        }
      }
    });
    ops.push({
      assetGroupSignalOperation: {
        create: {
          assetGroup: agTmp,
          audience: { audience: audienceTmp },
        }
      }
    });
  }

  // 7. CampaignSharedSet — negative keyword set
  if (negativeKeywordSetId) {
    ops.push({
      campaignSharedSetOperation: {
        create: {
          campaign: campaignTmp,
          sharedSet: `customers/${CID}/sharedSets/${negativeKeywordSetId}`,
        }
      }
    });
  }

  // 8. CampaignCriterion — geo + language
  for (const geo of body.geoTargetIds) {
    ops.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignTmp,
          location: { geoTargetConstant: `geoTargetConstants/${geo}` },
        }
      }
    });
  }
  for (const lang of body.languageIds) {
    ops.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignTmp,
          language: { languageConstant: `languageConstants/${lang}` },
        }
      }
    });
  }

  // 9. Optional: GBP location asset set (Store Visits)
  if (locationAssetSetId) {
    ops.push({
      campaignAssetSetOperation: {
        create: {
          campaign: campaignTmp,
          assetSet: `customers/${CID}/assetSets/${locationAssetSetId}`,
        }
      }
    });
  }

  // Execute atomically
  const r = await ads(token, env, `/customers/${CID}/googleAds:mutate`, {
    mutateOperations: ops,
  });

  // Walk results and pull out the resource names of the resources we created
  const resources = { totalOperations: ops.length };
  for (const resp of (r.mutateOperationResponses || [])) {
    if (resp.campaignBudgetResult) resources.budget       = resp.campaignBudgetResult.resourceName;
    if (resp.campaignResult)       resources.campaign     = resp.campaignResult.resourceName;
    if (resp.assetGroupResult)     resources.assetGroup   = resp.assetGroupResult.resourceName;
  }
  resources.campaignId = resources.campaign?.split('/').pop();

  return j({
    ok: true,
    resources,
    nextSteps: [
      'Open ads.google.com → Campaigns → find this PAUSED campaign',
      'Verify all assets and the final URL render correctly',
      'Set status=ENABLED to start serving',
      `URL: https://ads.google.com/aw/campaigns/management?campaignId=${resources.campaignId}&ocid=${CID}`,
    ],
  });
}

// ─── Enrich an existing PMax campaign atomically ─────────────────────────
// Adds extra assets to a live PMax campaign post-creation. Supports:
//   - createCallAsset: { phone, countryCode, callConversionActionId? }
//                      creates a CallAsset and binds at campaign level
//   - campaignAssetLinks: [{ asset, fieldType }]
//                      bind existing asset resources at campaign level
//                      (e.g., link a pre-existing CALL asset)
//   - assetGroupAssetLinks: [{ asset, fieldType }]
//                      bind existing image/video assets to the asset group
//                      (e.g., extra MARKETING_IMAGE / SQUARE_MARKETING_IMAGE
//                      / PORTRAIT_MARKETING_IMAGE / YOUTUBE_VIDEO)
//
// All operations are bundled into one atomic googleAds:mutate transaction.
async function enrichPmax(token, env, body) {
  const { campaignId, assetGroupId,
          createCallAsset,
          createSitelinks = [],
          campaignAssetLinks = [],
          assetGroupAssetLinks = [] } = body;

  if (!campaignId)   return j({ error: 'body.campaignId required' }, 400);
  if (!assetGroupId && assetGroupAssetLinks.length) return j({ error: 'body.assetGroupId required when assetGroupAssetLinks present' }, 400);

  const campaignResource = `customers/${CID}/campaigns/${campaignId}`;
  const assetGroupResource = assetGroupId ? `customers/${CID}/assetGroups/${assetGroupId}` : null;

  const ops = [];

  // 1. (Optional) create new CallAsset and bind it
  if (createCallAsset) {
    const { phone, countryCode = 'IN', callConversionActionId } = createCallAsset;
    if (!phone) return j({ error: 'createCallAsset.phone required' }, 400);
    const callAssetTmp = `customers/${CID}/assets/-1`;
    const callAsset = {
      countryCode,
      phoneNumber: phone,
      callConversionReportingState: callConversionActionId
        ? 'USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION'
        : 'USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION',
    };
    if (callConversionActionId) {
      callAsset.callConversionAction = `customers/${CID}/conversionActions/${callConversionActionId}`;
    }
    ops.push({
      assetOperation: {
        create: {
          resourceName: callAssetTmp,
          name: `Call ${phone} (${countryCode})`,
          callAsset,
        }
      }
    });
    ops.push({
      campaignAssetOperation: {
        create: { campaign: campaignResource, asset: callAssetTmp, fieldType: 'CALL' }
      }
    });
  }

  // 1b. (Optional) bulk-create Sitelinks and bind to campaign
  // Each: { linkText (≤25), finalUrl, description1? (≤35), description2? (≤35) }
  for (let i = 0; i < createSitelinks.length; i++) {
    const sl = createSitelinks[i];
    if (!sl.linkText || !sl.finalUrl) {
      return j({ error: `createSitelinks[${i}] needs linkText + finalUrl` }, 400);
    }
    if (sl.linkText.length > 25)        return j({ error: `createSitelinks[${i}].linkText >25 chars` }, 400);
    if (sl.description1 && sl.description1.length > 35) return j({ error: `createSitelinks[${i}].description1 >35 chars` }, 400);
    if (sl.description2 && sl.description2.length > 35) return j({ error: `createSitelinks[${i}].description2 >35 chars` }, 400);

    // Temp ids -10..-19 reserved for sitelinks (call asset uses -1)
    const slTmp = `customers/${CID}/assets/-${10 + i}`;
    const sitelinkAsset = { linkText: sl.linkText };
    if (sl.description1) sitelinkAsset.description1 = sl.description1;
    if (sl.description2) sitelinkAsset.description2 = sl.description2;
    ops.push({
      assetOperation: {
        create: {
          resourceName: slTmp,
          name: sl.name || `Sitelink: ${sl.linkText}`,
          finalUrls: [sl.finalUrl],
          sitelinkAsset,
        }
      }
    });
    ops.push({
      campaignAssetOperation: {
        create: { campaign: campaignResource, asset: slTmp, fieldType: 'SITELINK' }
      }
    });
  }

  // 2. Link existing assets to campaign
  for (const { asset, fieldType } of campaignAssetLinks) {
    ops.push({
      campaignAssetOperation: {
        create: { campaign: campaignResource, asset, fieldType }
      }
    });
  }

  // 3. Link existing assets to asset group
  for (const { asset, fieldType } of assetGroupAssetLinks) {
    ops.push({
      assetGroupAssetOperation: {
        create: { assetGroup: assetGroupResource, asset, fieldType }
      }
    });
  }

  if (ops.length === 0) return j({ ok: true, message: 'nothing to add', operations: 0 });

  const r = await ads(token, env, `/customers/${CID}/googleAds:mutate`, {
    mutateOperations: ops,
  });

  // Pull out the new call asset resource (if created)
  let callAssetResource = null;
  for (const resp of (r.mutateOperationResponses || [])) {
    if (resp.assetResult) callAssetResource = resp.assetResult.resourceName;
  }

  return j({
    ok: true,
    operations: ops.length,
    callAsset: callAssetResource,
    summary: {
      callAssetCreated: !!createCallAsset,
      campaignAssetLinks: campaignAssetLinks.length + (createCallAsset ? 1 : 0),
      assetGroupAssetLinks: assetGroupAssetLinks.length,
    },
  });
}

// ─── Update Campaign ─────────────────────────────────────────────────────
// Partial-update a campaign. Body: {
//   id: "23834053403"                    (required)
//   status?: "ENABLED" | "PAUSED"        (REMOVED uses remove-pmax instead)
//   startDate?: "2026-05-11"             (YYYY-MM-DD, IST campaign timezone)
//   endDate?: "2026-12-31"
//   budgetINR?: 500                      (also updates the linked CampaignBudget)
//   name?: "..."
//   conversionGoals?: [{ category, origin?, biddable }]
//                                        Override which conversion-goal
//                                        categories the campaign optimises
//                                        for. category = ConversionActionCategory
//                                        enum (PHONE_CALL_LEAD, GET_DIRECTIONS,
//                                        CONTACT, etc.). origin defaults to
//                                        GOOGLE_HOSTED. biddable=true makes
//                                        PMax optimise toward it; false drops it.
// }
async function updateCampaign(token, env, body) {
  const { id } = body;
  if (!id) return j({ error: 'body.id required' }, 400);
  const resourceName = `customers/${CID}/campaigns/${id}`;

  const update = { resourceName };
  const masks = [];

  if (body.status) {
    if (body.status === 'REMOVED') return j({ error: 'use action=remove-pmax for REMOVED' }, 400);
    update.status = body.status;
    masks.push('status');
  }
  if (body.startDate) { update.startDate = body.startDate; masks.push('start_date'); }
  if (body.endDate)   { update.endDate   = body.endDate;   masks.push('end_date'); }
  if (body.name)      { update.name      = body.name;      masks.push('name'); }

  if (masks.length === 0 && !body.budgetINR && !body.conversionGoals?.length) {
    return j({ error: 'no updateable fields provided', allowed: ['status','startDate','endDate','name','budgetINR','conversionGoals'] }, 400);
  }

  const ops = [];
  if (masks.length > 0) {
    ops.push({
      campaignOperation: { update, updateMask: masks.join(',') }
    });
  }

  // Optionally update the linked budget. Need to look up the budget resource
  // first to mutate its amount_micros.
  let budgetUpdated = null;
  if (body.budgetINR != null) {
    const rows = await gaql(token, env, `
      SELECT campaign.id, campaign_budget.resource_name
      FROM campaign WHERE campaign.id = ${id} LIMIT 1
    `);
    const budgetResource = rows[0]?.campaignBudget?.resourceName;
    if (!budgetResource) return j({ error: `could not find budget for campaign ${id}` }, 404);
    const micros = String(Math.round(body.budgetINR * 1_000_000));
    ops.push({
      campaignBudgetOperation: {
        update: { resourceName: budgetResource, amountMicros: micros },
        updateMask: 'amount_micros',
      }
    });
    budgetUpdated = { resource: budgetResource, amountMicros: micros };
  }

  // Optionally toggle CampaignConversionGoal records. Resource-name format:
  //   customers/{cid}/campaignConversionGoals/{campaign_id}~{category}~{origin}
  // Google auto-creates these when a campaign is created — we just flip the
  // `biddable` field on the categories we want to bias toward (or away from).
  const goalsApplied = [];
  for (const g of (body.conversionGoals || [])) {
    if (!g.category) return j({ error: 'conversionGoals[].category required' }, 400);
    const origin = g.origin || 'GOOGLE_HOSTED';
    const ccgResource = `customers/${CID}/campaignConversionGoals/${id}~${g.category}~${origin}`;
    ops.push({
      campaignConversionGoalOperation: {
        update: {
          resourceName: ccgResource,
          biddable: g.biddable !== false,
        },
        updateMask: 'biddable',
      }
    });
    goalsApplied.push({ category: g.category, origin, biddable: g.biddable !== false });
  }

  const r = await ads(token, env, `/customers/${CID}/googleAds:mutate`, { mutateOperations: ops });
  return j({
    ok: true,
    operations: ops.length,
    updatedFields: masks,
    budgetUpdated,
    conversionGoalsApplied: goalsApplied,
  });
}

// ─── Update Asset Group ──────────────────────────────────────────────────
// Body: { id: "6711266279", status?: "ENABLED" | "PAUSED", name?, finalUrls? }
async function updateAssetGroup(token, env, body) {
  const { id } = body;
  if (!id) return j({ error: 'body.id required' }, 400);
  const resourceName = `customers/${CID}/assetGroups/${id}`;
  const update = { resourceName };
  const masks = [];
  if (body.status)    { update.status    = body.status;    masks.push('status'); }
  if (body.name)      { update.name      = body.name;      masks.push('name'); }
  if (body.finalUrls) { update.finalUrls = body.finalUrls; masks.push('final_urls'); }
  if (masks.length === 0) return j({ error: 'no updateable fields' }, 400);

  const r = await ads(token, env, `/customers/${CID}/assetGroups:mutate`, {
    operations: [{ update, updateMask: masks.join(',') }],
  });
  return j({ ok: true, updatedFields: masks, resource: r.results?.[0]?.resourceName });
}

// ─── List CampaignConversionGoal records for a campaign ─────────────────
// Used to discover the actual resource-name pattern (campaign_id ~ category ~
// origin) Google has auto-created. update-campaign references these by name.
async function listCampaignGoals(token, env, id) {
  if (!id) throw new Error('?id=<campaign_id> required');
  const rows = await gaql(token, env, `
    SELECT campaign.id, campaign_conversion_goal.category,
           campaign_conversion_goal.origin, campaign_conversion_goal.biddable,
           campaign_conversion_goal.resource_name
    FROM campaign_conversion_goal
    WHERE campaign.id = ${id}
  `);
  return j({
    ok: true,
    count: rows.length,
    goals: rows.map(r => r.campaignConversionGoal),
  });
}

// ─── Remove PMax campaign ────────────────────────────────────────────────
// v23 quirk: REMOVED is set via the `remove` operation (resource-name string),
// NOT via update with status='REMOVED' (returns INVALID_ENUM_VALUE).
async function removePmax(token, env, id) {
  if (!id) throw new Error('?id=<campaign_id> required');
  const r = await ads(token, env, `/customers/${CID}/campaigns:mutate`, {
    operations: [{ remove: `customers/${CID}/campaigns/${id}` }],
  });
  return j({ ok: true, removed: r.results?.[0]?.resourceName });
}

function j(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS });
}
