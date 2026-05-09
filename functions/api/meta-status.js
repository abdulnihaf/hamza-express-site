// Quick diagnostic: Check Meta CTWA campaign delivery status
// GET /api/meta-status

const CAMPAIGN = '120243729366800505';
const ADSET = '120243729917650505';

export async function onRequest(context) {
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const token = context.env.WA_ACCESS_TOKEN;
  if (!token) return new Response(JSON.stringify({ error: 'No token' }), { headers: CORS });

  try {
    const [campResp, adsetResp, adsResp] = await Promise.all([
      fetch(`https://graph.facebook.com/v25.0/${CAMPAIGN}?fields=name,status,effective_status,configured_status,daily_budget,lifetime_budget,budget_remaining,issues_info&access_token=${token}`),
      fetch(`https://graph.facebook.com/v25.0/${ADSET}?fields=name,status,effective_status,configured_status,daily_budget,budget_remaining,optimization_goal,billing_event&access_token=${token}`),
      fetch(`https://graph.facebook.com/v25.0/${ADSET}/ads?fields=name,status,effective_status,configured_status,issues_info&access_token=${token}`),
    ]);

    const [campaign, adset, ads] = await Promise.all([campResp.json(), adsetResp.json(), adsResp.json()]);

    return new Response(JSON.stringify({ campaign, adset, ads: ads.data || ads }, null, 2), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
