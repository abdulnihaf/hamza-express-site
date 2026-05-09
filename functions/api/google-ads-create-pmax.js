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
      case 'remove-pmax':       return await removePmax(token, env, url.searchParams.get('id'));
      default:
        return j({ error: `unknown action: ${action}`, valid: ['preflight','list-assets','create-text-assets','upload-image-asset','create','remove-pmax'] }, 400);
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
    throw new Error(`${method} ${path} → ${r.status}: ${msg}\n${JSON.stringify(d).slice(0,800)}`);
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
async function listAssets(token, env) {
  const rows = await gaql(token, env, `
    SELECT asset.id, asset.name, asset.type, asset.resource_name,
           asset.text_asset.text,
           asset.image_asset.full_size.url, asset.image_asset.full_size.width_pixels,
           asset.image_asset.full_size.height_pixels, asset.image_asset.file_size,
           asset.youtube_video_asset.youtube_video_id
    FROM asset
    WHERE asset.type IN ('TEXT','IMAGE','YOUTUBE_VIDEO','BUSINESS_NAME','LOGO')
  `);
  // Bucket by type for easy consumption
  const byType = { TEXT:[], IMAGE:[], YOUTUBE_VIDEO:[], BUSINESS_NAME:[], LOGO:[] };
  for (const r of rows) {
    const a = r.asset;
    if (byType[a.type]) byType[a.type].push(a);
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

  // Build operations
  const operations = [];
  const tag = []; // parallel array to track which slot each op is for

  for (const t of [...headlines, ...longHeadlines, ...descriptions]) {
    operations.push({ create: { textAsset: { text: t } } });
    tag.push({ kind: 'text', text: t });
  }
  for (const b of businessNames) {
    operations.push({ create: { name: `business_name:${b}`, businessNameAsset: { name: b } } });
    tag.push({ kind: 'business_name', text: b });
  }

  if (operations.length === 0) return j({ ok: true, message: 'nothing to create', resources: {} });

  const r = await ads(token, env, `/customers/${CID}/assets:mutate`, {
    operations,
    partialFailure: true,
  });

  // Map results back to slots
  const results = (r.results || []).map((res, i) => ({ ...tag[i], resourceName: res.resourceName }));
  const buckets = {
    headlines:    results.filter(x => x.kind === 'text' && headlines.includes(x.text)),
    longHeadlines:results.filter(x => x.kind === 'text' && longHeadlines.includes(x.text) && !headlines.includes(x.text)),
    descriptions: results.filter(x => x.kind === 'text' && descriptions.includes(x.text) && !headlines.includes(x.text) && !longHeadlines.includes(x.text)),
    businessNames:results.filter(x => x.kind === 'business_name'),
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

  const log = [];
  const step = (msg) => { log.push(msg); console.log(msg); };

  // ─── 1. Budget ─────────────────────────────────────────────────────────
  const budgetMicros = Math.round(body.budgetINR * 1_000_000);
  step(`1. Creating budget — ₹${body.budgetINR}/day (${budgetMicros} micros)`);
  const budgetR = await ads(token, env, `/customers/${CID}/campaignBudgets:mutate`, {
    operations: [{
      create: {
        name: `${body.name} — Budget`,
        amountMicros: String(budgetMicros),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      }
    }],
  });
  const budgetResource = budgetR.results[0].resourceName;
  step(`   → ${budgetResource}`);

  // ─── 2. Campaign ───────────────────────────────────────────────────────
  step(`2. Creating PMax campaign (PAUSED)`);
  const campaignR = await ads(token, env, `/customers/${CID}/campaigns:mutate`, {
    operations: [{
      create: {
        name: body.name,
        status: 'PAUSED',
        advertisingChannelType: 'PERFORMANCE_MAX',
        campaignBudget: budgetResource,
        biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
        // Geo targeting — present users in BLR (not just searches about BLR)
        geoTargetTypeSetting: {
          positiveGeoTargetType: 'PRESENCE_OR_INTEREST',
          negativeGeoTargetType: 'PRESENCE',
        },
        // No website URL crawling — we want strict creative control
        urlExpansionOptOut: true,
      }
    }],
  });
  const campaignResource = campaignR.results[0].resourceName;
  const campaignId = campaignResource.split('/').pop();
  step(`   → ${campaignResource}`);

  // ─── 3. Asset Group ────────────────────────────────────────────────────
  step(`3. Creating asset group (PAUSED)`);
  const assetGroupR = await ads(token, env, `/customers/${CID}/assetGroups:mutate`, {
    operations: [{
      create: {
        name: body.assetGroupName,
        campaign: campaignResource,
        finalUrls: [body.finalUrl],
        status: 'PAUSED',
      }
    }],
  });
  const assetGroupResource = assetGroupR.results[0].resourceName;
  step(`   → ${assetGroupResource}`);

  // ─── 4. AssetGroupAsset links — bind each asset to a field type ───────
  step(`4. Linking assets to asset group`);
  const links = [];
  const link = (resource, fieldType) => links.push({
    create: { assetGroup: assetGroupResource, asset: resource, fieldType }
  });

  textAssets.headlines.forEach(r => link(r, 'HEADLINE'));
  textAssets.longHeadlines.forEach(r => link(r, 'LONG_HEADLINE'));
  textAssets.descriptions.forEach(r => link(r, 'DESCRIPTION'));
  textAssets.businessNames.forEach(r => link(r, 'BUSINESS_NAME'));
  imageAssets.marketing.forEach(r => link(r, 'MARKETING_IMAGE'));
  imageAssets.squareMarketing.forEach(r => link(r, 'SQUARE_MARKETING_IMAGE'));
  (imageAssets.landscapeLogos || []).forEach(r => link(r, 'LANDSCAPE_LOGO'));
  imageAssets.logos.forEach(r => link(r, 'LOGO'));
  (body.videoAssets || []).forEach(r => link(r, 'YOUTUBE_VIDEO'));

  const linkR = await ads(token, env, `/customers/${CID}/assetGroupAssets:mutate`, {
    operations: links,
    partialFailure: true,
  });
  step(`   → linked ${links.length} assets (partialFailure: ${!!linkR.partialFailureError})`);

  // ─── 5. AssetGroupSignal — audience signals (custom audiences + user lists) ─
  step(`5. Adding audience signals`);
  const signalOps = [];
  for (const audId of (signals.audienceIds || [])) {
    signalOps.push({
      create: {
        assetGroup: assetGroupResource,
        audience: {
          customAudiences: [`customers/${CID}/customAudiences/${audId}`],
        },
      }
    });
  }
  for (const ulId of (signals.userListIds || [])) {
    signalOps.push({
      create: {
        assetGroup: assetGroupResource,
        audience: {
          userLists: [`customers/${CID}/userLists/${ulId}`],
        },
      }
    });
  }
  if (signalOps.length) {
    await ads(token, env, `/customers/${CID}/assetGroupSignals:mutate`, {
      operations: signalOps,
      partialFailure: true,
    });
    step(`   → ${signalOps.length} signal(s)`);
  } else {
    step(`   → 0 signals (none provided)`);
  }

  // ─── 6. CampaignSharedSet — apply negative keyword shared set ──────────
  if (negativeKeywordSetId) {
    step(`6. Applying negative keyword shared set ${negativeKeywordSetId}`);
    await ads(token, env, `/customers/${CID}/campaignSharedSets:mutate`, {
      operations: [{
        create: {
          campaign: campaignResource,
          sharedSet: `customers/${CID}/sharedSets/${negativeKeywordSetId}`,
        }
      }],
    });
    step(`   → attached`);
  }

  // ─── 7. CampaignCriterion — geo + language ─────────────────────────────
  step(`7. Adding geo + language criteria`);
  const criterionOps = [];
  for (const geo of body.geoTargetIds) {
    criterionOps.push({
      create: {
        campaign: campaignResource,
        location: { geoTargetConstant: `geoTargetConstants/${geo}` },
      }
    });
  }
  for (const lang of body.languageIds) {
    criterionOps.push({
      create: {
        campaign: campaignResource,
        language: { languageConstant: `languageConstants/${lang}` },
      }
    });
  }
  await ads(token, env, `/customers/${CID}/campaignCriteria:mutate`, {
    operations: criterionOps,
    partialFailure: true,
  });
  step(`   → ${criterionOps.length} criteria`);

  // ─── 8. CampaignAsset — link GBP location asset set (Store Goals) ──────
  if (locationAssetSetId) {
    step(`8. Linking GBP location asset set ${locationAssetSetId}`);
    await ads(token, env, `/customers/${CID}/campaignAssetSets:mutate`, {
      operations: [{
        create: {
          campaign: campaignResource,
          assetSet: `customers/${CID}/assetSets/${locationAssetSetId}`,
        }
      }],
    });
    step(`   → linked`);
  } else {
    step(`8. Skipped GBP location link — no locationAssetSetId provided. Link manually in Ads UI if Store Goals desired.`);
  }

  return j({
    ok: true,
    log,
    resources: {
      budget: budgetResource,
      campaign: campaignResource,
      campaignId,
      assetGroup: assetGroupResource,
    },
    nextSteps: [
      'Open ads.google.com → Campaigns → find this PAUSED campaign',
      'Verify all assets and the final URL render correctly',
      'Set status=ENABLED to start serving',
      `URL: https://ads.google.com/aw/campaigns/management?campaignId=${campaignId}&ocid=${CID}`,
    ],
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
