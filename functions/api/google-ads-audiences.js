// Google Ads — Audience + Negative Keyword + Campaign Lifecycle (v23)
//
// Built for HE PMax Store Goals campaign. Uses the same Google Ads developer
// token + OAuth as google-ads.js, but separated to keep PMax/audience surface
// distinct from the legacy Search-campaign actions.
//
// GET  /api/google-ads-audiences?action=list-audiences          — list all UserLists + CustomAudiences
// POST /api/google-ads-audiences?action=upload-customer-match   — body: {leadsUrl?, listName?}
// POST /api/google-ads-audiences?action=create-custom-audiences — body: {} (creates 3 HE-specific audiences)
// POST /api/google-ads-audiences?action=create-negative-keyword-list — body: {}
// GET  /api/google-ads-audiences?action=remove-campaign&id=X    — marks campaign REMOVED
// GET  /api/google-ads-audiences?action=poll-job&job=X          — poll OfflineUserDataJob status
//
// Required secrets (same as google-ads.js):
//   GOOGLE_ADS_DEV_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';
const CUSTOMER_ID    = '3681710084'; // HE Google Ads account

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
    const accessToken = await getAccessToken(env);
    const body = request.method === 'POST'
      ? await request.json().catch(() => ({}))
      : {};

    switch (action) {
      case 'list-audiences':
        return await listAudiences(accessToken, env);
      case 'upload-customer-match':
        return await uploadCustomerMatch(accessToken, env, body);
      case 'create-custom-audiences':
        return await createCustomAudiences(accessToken, env, body);
      case 'create-negative-keyword-list':
        return await createNegativeKeywordList(accessToken, env, body);
      case 'remove-campaign':
        return await removeCampaign(accessToken, env, url.searchParams.get('id'));
      case 'poll-job':
        return await pollJob(accessToken, env, url.searchParams.get('job'));
      default:
        return json({ error: `unknown action: ${action}`, valid: ['list-audiences','upload-customer-match','create-custom-audiences','create-negative-keyword-list','remove-campaign','poll-job'] }, 400);
    }
  } catch (err) {
    return json({ error: err.message, stack: env.DEBUG ? err.stack : undefined }, 500);
  }
}

// ─── OAuth ───────────────────────────────────────────────────────────────
async function getAccessToken(env) {
  const required = ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_DEV_TOKEN'];
  for (const k of required) {
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
  if (!d.access_token) throw new Error(`OAuth failed: ${JSON.stringify(d).slice(0, 200)}`);
  return d.access_token;
}

// Helper: invoke Google Ads REST API
async function adsApi(token, env, path, body, method = 'POST') {
  const r = await fetch(`${GOOGLE_ADS_API}${path}`, {
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
    const detail = JSON.stringify(d).slice(0, 500);
    throw new Error(`Ads API ${method} ${path} → ${r.status}: ${msg}\n${detail}`);
  }
  return d;
}

// ─── List existing audiences (verify ───────────────────────────────────
async function listAudiences(token, env) {
  const query = `
    SELECT user_list.id, user_list.name, user_list.description, user_list.size_for_display,
           user_list.size_for_search, user_list.membership_status, user_list.read_only,
           user_list.crm_based_user_list.upload_key_type
    FROM user_list
    WHERE user_list.read_only = false
    ORDER BY user_list.id DESC
  `;
  const userLists = await adsApi(token, env, `/customers/${CUSTOMER_ID}/googleAds:searchStream`, {
    query: query.replace(/\s+/g, ' ').trim(),
  });
  const customAudQuery = `
    SELECT custom_audience.id, custom_audience.name, custom_audience.description,
           custom_audience.status, custom_audience.type
    FROM custom_audience
  `;
  const customAuds = await adsApi(token, env, `/customers/${CUSTOMER_ID}/googleAds:searchStream`, {
    query: customAudQuery.replace(/\s+/g, ' ').trim(),
  });
  return json({
    user_lists: extractRows(userLists),
    custom_audiences: extractRows(customAuds),
  });
}

function extractRows(streamResp) {
  // searchStream returns array of batches each with `results` array
  const batches = Array.isArray(streamResp) ? streamResp : [streamResp];
  const rows = [];
  for (const b of batches) {
    for (const r of (b.results || [])) rows.push(r);
  }
  return rows;
}

// ─── Customer Match Upload ───────────────────────────────────────────────
// Pulls leads from /api/leads, SHA-256 hashes phones, creates UserList,
// creates OfflineUserDataJob, adds operations, runs job. Returns job resource
// name for polling via ?action=poll-job.
async function uploadCustomerMatch(token, env, body) {
  const listName = body.listName || 'hamza_he_leads_v1';
  const leadsUrl = body.leadsUrl || 'https://hamzaexpress.in/api/leads?action=list&limit=1000';

  // Step 1: pull leads
  const leadsResp = await fetch(leadsUrl);
  if (!leadsResp.ok) throw new Error(`Leads fetch failed: ${leadsResp.status}`);
  const leadsData = await leadsResp.json();
  const leads = (leadsData.leads || []).filter(l => l.waId && /^\d{10,15}$/.test(l.waId));
  if (leads.length < 100) {
    throw new Error(`Customer Match requires >=100 leads, found ${leads.length}`);
  }

  // Step 2: hash phones in E.164 format with leading +
  const hashes = await Promise.all(leads.map(async l => {
    const e164 = l.waId.startsWith('+') ? l.waId : `+${l.waId}`;
    return await sha256Hex(e164.toLowerCase());
  }));

  // Step 3: check if list already exists (by name)
  const existingQ = `
    SELECT user_list.id, user_list.name, user_list.resource_name
    FROM user_list
    WHERE user_list.name = '${listName}'
    LIMIT 1
  `;
  const existing = extractRows(await adsApi(token, env, `/customers/${CUSTOMER_ID}/googleAds:searchStream`, {
    query: existingQ.replace(/\s+/g, ' ').trim(),
  }));
  let userListResourceName;
  if (existing.length > 0) {
    userListResourceName = existing[0].userList?.resourceName;
  } else {
    // Create new UserList
    const createListResp = await adsApi(token, env, `/customers/${CUSTOMER_ID}/userLists:mutate`, {
      operations: [{
        create: {
          name: listName,
          description: 'HE WhatsApp leads — auto-uploaded from /api/leads. Used as PMax audience signal.',
          membershipStatus: 'OPEN',
          membershipLifeSpan: 540,
          crmBasedUserList: { uploadKeyType: 'CONTACT_INFO' },
        }
      }],
    });
    userListResourceName = createListResp.results?.[0]?.resourceName;
  }
  if (!userListResourceName) throw new Error('Failed to obtain UserList resource name');

  // Step 4: create OfflineUserDataJob
  const jobResp = await adsApi(token, env, `/customers/${CUSTOMER_ID}/offlineUserDataJobs:create`, {
    job: {
      type: 'CUSTOMER_MATCH_USER_LIST',
      customerMatchUserListMetadata: { userList: userListResourceName },
    },
  });
  const jobResourceName = jobResp.resourceName;
  if (!jobResourceName) throw new Error('Failed to create OfflineUserDataJob');

  // Step 5: add operations (chunk to 1000 per request — Google limit)
  const operations = hashes.map(h => ({
    create: {
      userIdentifiers: [{ hashedPhoneNumber: h }],
    }
  }));

  const CHUNK = 1000;
  for (let i = 0; i < operations.length; i += CHUNK) {
    await adsApi(token, env, `/${jobResourceName}:addOperations`, {
      operations: operations.slice(i, i + CHUNK),
      enablePartialFailure: true,
    });
  }

  // Step 6: run job (async — Google processes in background)
  await adsApi(token, env, `/${jobResourceName}:run`, {});

  return json({
    ok: true,
    user_list_resource: userListResourceName,
    job_resource: jobResourceName,
    leads_uploaded: hashes.length,
    note: 'Job is processing. Poll via /api/google-ads-audiences?action=poll-job&job=' + jobResourceName,
  });
}

async function pollJob(token, env, jobResource) {
  if (!jobResource) throw new Error('?job=<resourceName> required');
  const path = `/${jobResource}`;
  const data = await adsApi(token, env, path, null, 'GET');
  return json({
    name: data.resourceName,
    type: data.type,
    status: data.status,
    failureReason: data.failureReason,
    customerMatchUserListMetadata: data.customerMatchUserListMetadata,
  });
}

// ─── Custom Audiences (3 HE archetypes) ──────────────────────────────────
async function createCustomAudiences(token, env, body) {
  // Three custom audiences, each defined by the keyword cluster of its archetype.
  // PMax uses these as audience SIGNALS (not exclusive targeting), biasing the
  // algorithm to find users whose recent search behavior matches.
  const audiences = body.audiences || [
    {
      name: 'he_halal_food_searchers',
      description: 'Users searching for halal food/restaurants in BLR',
      members: [
        'halal restaurant', 'halal food', 'muslim restaurant',
        'halal biryani', 'halal kabab', 'halal mughlai',
        'halal food near me', 'halal restaurant near me',
        'halal food bangalore', 'halal food shivajinagar',
      ],
    },
    {
      name: 'he_late_night_food_searchers',
      description: 'Users searching for late-night/24-hour food in BLR',
      members: [
        'late night restaurant', 'late night food', '24 hour restaurant',
        'food open now', 'restaurants open late', 'late night biryani',
        '2am food bangalore', 'late dinner bangalore', 'midnight food',
        'late night halal food',
      ],
    },
    {
      name: 'he_biryani_connoisseur',
      description: 'Users researching destination biryani options in BLR',
      members: [
        'best biryani bangalore', 'hyderabadi biryani', 'mughlai restaurant',
        'dakhni cuisine', 'best biryani in bangalore', 'famous biryani bangalore',
        'authentic biryani bangalore', 'biryani in shivajinagar',
        'best mughlai bangalore', 'biryani near commercial street',
      ],
    },
  ];

  const results = [];
  for (const aud of audiences) {
    // Check if exists
    const existQ = `SELECT custom_audience.id, custom_audience.resource_name FROM custom_audience WHERE custom_audience.name = '${aud.name}' LIMIT 1`;
    const existing = extractRows(await adsApi(token, env, `/customers/${CUSTOMER_ID}/googleAds:searchStream`, {
      query: existQ.replace(/\s+/g, ' ').trim(),
    }));
    if (existing.length > 0) {
      results.push({ name: aud.name, status: 'exists', resource: existing[0].customAudience?.resourceName });
      continue;
    }
    // Create
    const r = await adsApi(token, env, `/customers/${CUSTOMER_ID}/customAudiences:mutate`, {
      operations: [{
        create: {
          name: aud.name,
          description: aud.description,
          type: 'AUTO',
          members: aud.members.map(kw => ({
            memberType: 'KEYWORD',
            keyword: kw,
          })),
        }
      }],
    });
    results.push({
      name: aud.name,
      status: 'created',
      resource: r.results?.[0]?.resourceName,
      member_count: aud.members.length,
    });
  }
  return json({ ok: true, audiences: results });
}

// ─── Shared Negative Keyword List ────────────────────────────────────────
async function createNegativeKeywordList(token, env, body) {
  const listName = body.name || 'HE_walk_in_excludes_v1';
  const negatives = body.keywords || [
    // Aggregator names — exclude all delivery-platform searches
    'swiggy', 'zomato', 'eazydiner', 'dineout', 'magicpin', 'foodpanda', 'ubereats',
    // Delivery intent
    'delivery', 'online order', 'food delivery', 'home delivery', 'order online',
    // Cooking / recipe / DIY
    'recipe', 'how to make', 'how to cook', 'ingredients', 'cooking', 'homemade',
    // Job-seekers
    'jobs', 'hiring', 'vacancies', 'franchise', 'careers',
    // Diet / vegetarian (HE is non-veg specialty)
    'diet', 'calories', 'nutrition', 'vegetarian', 'veg only', 'veg restaurant',
    // Movie / streaming spillover
    'movie', 'streaming', 'download', 'watch online',
    // Price-shoppers (HE is mid-premium, not budget)
    'cheap', 'free', 'discount', 'budget',
  ];

  // Check if list exists
  const existQ = `SELECT shared_set.id, shared_set.name, shared_set.resource_name FROM shared_set WHERE shared_set.name = '${listName}' AND shared_set.type = 'NEGATIVE_KEYWORDS' LIMIT 1`;
  const existing = extractRows(await adsApi(token, env, `/customers/${CUSTOMER_ID}/googleAds:searchStream`, {
    query: existQ.replace(/\s+/g, ' ').trim(),
  }));
  let sharedSetResourceName;
  if (existing.length > 0) {
    sharedSetResourceName = existing[0].sharedSet?.resourceName;
  } else {
    const createR = await adsApi(token, env, `/customers/${CUSTOMER_ID}/sharedSets:mutate`, {
      operations: [{
        create: {
          name: listName,
          type: 'NEGATIVE_KEYWORDS',
        }
      }],
    });
    sharedSetResourceName = createR.results?.[0]?.resourceName;
  }
  if (!sharedSetResourceName) throw new Error('Failed to obtain SharedSet resource name');

  // Add keywords as PHRASE match (negatives match broadly even as phrase)
  const ops = negatives.map(kw => ({
    create: {
      sharedSet: sharedSetResourceName,
      keyword: { text: kw, matchType: 'PHRASE' },
    }
  }));

  await adsApi(token, env, `/customers/${CUSTOMER_ID}/sharedCriteria:mutate`, {
    operations: ops,
    partialFailure: true,
  });

  return json({
    ok: true,
    shared_set_resource: sharedSetResourceName,
    keywords_added: negatives.length,
    note: 'Attach this shared set to the new PMax campaign in Ads UI: Shared Library → Negative keyword lists → Apply to campaigns',
  });
}

// ─── Remove Campaign ─────────────────────────────────────────────────────
async function removeCampaign(token, env, id) {
  if (!id) throw new Error('?id=<campaign_id> required');
  const r = await adsApi(token, env, `/customers/${CUSTOMER_ID}/campaigns:mutate`, {
    operations: [{
      update: {
        resourceName: `customers/${CUSTOMER_ID}/campaigns/${id}`,
        status: 'REMOVED',
      },
      updateMask: 'status',
    }],
  });
  return json({ ok: true, removed: r.results?.[0]?.resourceName });
}

// ─── Helpers ─────────────────────────────────────────────────────────────
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS });
}
