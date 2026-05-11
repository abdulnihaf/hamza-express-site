// /api/menu-top-sellers — HE live menu intelligence for marketing copy systems.
//
// Source of truth for "what is HE actually selling, right now."
// Reads `pos.order.line` + `pos.category` + `product.product` from test.hamzahotel.com
// (HE prod POS, despite the misleading hostname).
//
// Consumers:
//   - HN /api/influencer-pipeline (cold outreach copy, AI opener allowlist)
//   - HN /api/influencer-outreach (queued send rendering)
//   - HE /api/creator-application (offer-card rendering on /creators/apply)
//   - Any future ad-copy, landing-page, or marketing-AI surface
//
// Architectural rule (memory: feedback_never_invent_menu_items.md):
//   The brand defines CATEGORY MIX + COUNT. Specific dish names come from
//   this endpoint. No code or AI is permitted to fabricate menu items.
//
// Returns: { success, query:{from,to}, byCategory:{[cat]:[{name,qty,share,id}]},
//            heroes:[top 5 overall], allowlist:[normalised SKU names] }

const ODOO_URL = 'https://test.hamzahotel.com/jsonrpc';
const ODOO_DB = 'main';
const ODOO_UID = 2;
const CONFIG_IDS = [5, 6, 32]; // HE Cash Counter, HE Captain, Ground Floor Waiter Non-AC

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h — POS top-sellers shift slowly

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(request.url);
  const days = clampInt(url.searchParams.get('days'), 1, 90, 30);
  const perCategory = clampInt(url.searchParams.get('per_category'), 1, 20, 5);
  const bypassCache = url.searchParams.get('refresh') === '1';

  // Cloudflare Cache API key — vary by days + per_category so different windows don't collide
  const cacheKey = new Request(`${url.origin}/api/menu-top-sellers?days=${days}&per_category=${perCategory}`, request);
  const cache = caches.default;

  if (!bypassCache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  try {
    const result = await pullTopSellers(env.ODOO_API_KEY, days, perCategory);
    const body = JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      query: { days, per_category: perCategory },
      ...result,
    });
    const resp = new Response(body, {
      headers: { ...CORS, 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    if (!bypassCache) context.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: CORS,
    });
  }
}

function clampInt(raw, lo, hi, fallback) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

async function rpc(apiKey, model, method, args, kwargs = {}) {
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: { service: 'object', method: 'execute_kw',
                args: [ODOO_DB, ODOO_UID, apiKey, model, method, args, kwargs] },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Odoo RPC error');
  return data.result || [];
}

function cleanProductName(name) {
  return name.replace(/^\[HE-\d+\]\s*/, '').trim();
}

async function pullTopSellers(apiKey, days, perCategory) {
  const toUTC = new Date();
  const fromUTC = new Date(toUTC.getTime() - days * 86400000);
  const fromOdoo = fromUTC.toISOString().slice(0, 19).replace('T', ' ');
  const toOdoo = toUTC.toISOString().slice(0, 19).replace('T', ' ');

  // Phase 1: orders in window + reference data
  const [orders, categories, products] = await Promise.all([
    rpc(apiKey, 'pos.order', 'search_read',
      [[['config_id', 'in', CONFIG_IDS],
        ['date_order', '>=', fromOdoo],
        ['date_order', '<=', toOdoo],
        ['state', 'in', ['paid', 'done', 'invoiced', 'posted']]]],
      { fields: ['id'] }),
    rpc(apiKey, 'pos.category', 'search_read', [[]],
      { fields: ['id', 'name', 'parent_id'] }),
    rpc(apiKey, 'product.product', 'search_read',
      [[['available_in_pos', '=', true]]],
      { fields: ['id', 'name', 'pos_categ_ids'] }),
  ]);

  // Build category resolver — collapse subcategories to their top-level parent
  const catById = {};
  categories.forEach(c => { catById[c.id] = c; });
  const topLevel = (catId) => {
    const cat = catById[catId];
    if (!cat) return 'Other';
    if (!cat.parent_id) return cat.name;
    return topLevel(cat.parent_id[0]);
  };

  // Product → top-level category map
  const productCat = {};
  products.forEach(p => {
    const catId = p.pos_categ_ids && p.pos_categ_ids[0];
    productCat[p.id] = catId ? topLevel(catId) : 'Other';
  });

  // Closed allowlist of current POS-available SKU names (used by AI guard)
  const allowlist = products
    .map(p => cleanProductName(p.name))
    .filter(n => n.length > 0);

  if (orders.length === 0) {
    return { byCategory: {}, heroes: [], allowlist: dedupe(allowlist), total_qty: 0, total_orders: 0 };
  }

  const orderIds = orders.map(o => o.id);

  // Phase 2: order lines (chunk if needed — Odoo can handle large IN lists but Workers have 1000-subrequest cap)
  const lines = await rpc(apiKey, 'pos.order.line', 'search_read',
    [[['order_id', 'in', orderIds]]],
    { fields: ['product_id', 'qty', 'price_subtotal_incl'] });

  // Aggregate by product
  const byProduct = {};
  let totalQty = 0;
  lines.forEach(line => {
    if (!line.product_id) return;
    const pid = line.product_id[0];
    const rawName = line.product_id[1];
    const pname = cleanProductName(rawName);
    if (!byProduct[pid]) {
      byProduct[pid] = {
        id: pid, name: pname,
        qty: 0, amount: 0,
        category: productCat[pid] || 'Other',
      };
    }
    byProduct[pid].qty += line.qty;
    byProduct[pid].amount += line.price_subtotal_incl;
    totalQty += line.qty;
  });

  // Group by category, sort, take top N each
  const byCategory = {};
  const catQty = {};
  Object.values(byProduct).forEach(p => {
    if (!byCategory[p.category]) {
      byCategory[p.category] = [];
      catQty[p.category] = 0;
    }
    byCategory[p.category].push(p);
    catQty[p.category] += p.qty;
  });

  const trimmed = {};
  Object.entries(byCategory).forEach(([cat, items]) => {
    items.sort((a, b) => b.qty - a.qty);
    const catTotal = catQty[cat] || 1;
    trimmed[cat] = items.slice(0, perCategory).map(p => ({
      id: p.id,
      name: p.name,
      qty: Math.round(p.qty),
      share: Math.round((p.qty / catTotal) * 1000) / 10, // % within category, 1 decimal
    }));
  });

  // Overall top 5 (heroes) — same data Nihaf's investor page uses
  const heroes = Object.values(byProduct)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)
    .map(p => ({
      id: p.id, name: p.name, category: p.category,
      qty: Math.round(p.qty),
      share: Math.round((p.qty / totalQty) * 1000) / 10,
    }));

  return {
    byCategory: trimmed,
    heroes,
    allowlist: dedupe(allowlist),
    total_qty: Math.round(totalQty),
    total_orders: orders.length,
  };
}

function dedupe(arr) {
  return Array.from(new Set(arr));
}
