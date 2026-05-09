// Google Ads — Ad Group Bid Updater
// POST /api/google-ads-bids  body: { nearMe: 15, shivajinagar: 10 }  (INR values)
// GET  /api/google-ads-bids  — show current ad group bids

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';
const CUSTOMER_ID = '3681710084';
const CAMPAIGN_ID = '23748431244';
const AG_NEAR_ME = '195450415117';
const AG_SHIVAJINAGAR = '195450415157';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const token = await getToken(env);

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const nearMeINR = parseFloat(body.nearMe) || 15;
      const shivaINR = parseFloat(body.shivajinagar) || 10;

      const results = await mutate(token, env, 'adGroups', [
        {
          update: {
            resourceName: `customers/${CUSTOMER_ID}/adGroups/${AG_NEAR_ME}`,
            cpcBidMicros: String(Math.round(nearMeINR * 1e6)),
          },
          updateMask: 'cpcBidMicros',
        },
        {
          update: {
            resourceName: `customers/${CUSTOMER_ID}/adGroups/${AG_SHIVAJINAGAR}`,
            cpcBidMicros: String(Math.round(shivaINR * 1e6)),
          },
          updateMask: 'cpcBidMicros',
        },
      ]);

      return ok({
        updated: true,
        nearMe: { adGroupId: AG_NEAR_ME, newBidINR: nearMeINR },
        shivajinagar: { adGroupId: AG_SHIVAJINAGAR, newBidINR: shivaINR },
        results,
      });
    }

    // GET — show current bids
    const rows = await gaql(token, env, `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.cpc_bid_micros,
        ad_group.effective_cpc_bid_micros,
        ad_group.status
      FROM ad_group
      WHERE campaign.id = '${CAMPAIGN_ID}'
    `);

    const adGroups = rows.map(r => ({
      id: r.adGroup?.id,
      name: r.adGroup?.name,
      status: r.adGroup?.status,
      bidINR: r.adGroup?.cpcBidMicros ? (parseInt(r.adGroup.cpcBidMicros) / 1e6).toFixed(2) : null,
      effectiveBidINR: r.adGroup?.effectiveCpcBidMicros
        ? (parseInt(r.adGroup.effectiveCpcBidMicros) / 1e6).toFixed(2)
        : null,
    }));

    return ok({ adGroups });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}

function ok(data) {
  return new Response(JSON.stringify(data, null, 2), { headers: CORS });
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

async function mutate(token, env, resource, operations) {
  const resp = await fetch(
    `${GOOGLE_ADS_API}/customers/${CUSTOMER_ID}/${resource}:mutate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'developer-token': env.GOOGLE_ADS_DEV_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operations }),
    }
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Mutate error (${resp.status}): ${t}`);
  }
  const data = await resp.json();
  return data.results || [];
}
