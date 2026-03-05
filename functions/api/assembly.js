// Delivery Order Assembly API
// Handles assembly tracking for WABA, Swiggy, Zomato delivery orders
// Endpoints: /api/assembly?action=...

const ODOO_URL = 'https://ops.hamzahotel.com/jsonrpc';
const ODOO_DB = 'main';
const ODOO_UID = 2;
const POS_CONFIG_ID = 10; // HE - WABA (used for all delivery orders)
const PRICELIST_ID = 1;
const PAYMENT_METHOD_UPI = 17; // WABA General UPI
const GST_TAX_ID = 31; // 5% GST S

// Category → Station mapping (matches whatsapp.js)
const CATEGORY_STATION_MAP = {
  22: 'Kitchen Pass',    // Indian
  24: 'Kitchen Pass',    // Chinese
  25: 'Kitchen Pass',    // Tandoor
  26: 'Kitchen Pass',    // Fried Chicken
  27: 'Juice Counter',   // Juices
  28: 'Bain Marie',      // Bain Marie
  29: 'Shawarma Counter', // Shawarma
  30: 'Grill Counter',   // Grill
  // Subcategories → Kitchen Pass
  47: 'Kitchen Pass', 48: 'Kitchen Pass',
  70: 'Kitchen Pass', 71: 'Kitchen Pass', 72: 'Kitchen Pass', 73: 'Kitchen Pass',
  74: 'Kitchen Pass', 75: 'Kitchen Pass', 76: 'Kitchen Pass',
  77: 'Kitchen Pass', 78: 'Kitchen Pass', 79: 'Kitchen Pass', 80: 'Kitchen Pass',
  81: 'Kitchen Pass', 82: 'Kitchen Pass',
  83: 'Kitchen Pass', 84: 'Kitchen Pass', 85: 'Kitchen Pass', 86: 'Kitchen Pass',
  87: 'Kitchen Pass', 88: 'Kitchen Pass',
  89: 'Kitchen Pass', 90: 'Kitchen Pass',
};

const STATION_ABBR = {
  'Kitchen Pass': 'KP',
  'Juice Counter': 'JC',
  'Bain Marie': 'BM',
  'Shawarma Counter': 'SW',
  'Grill Counter': 'GR',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Content-Type': 'application/json',
};

// ─── Odoo RPC Helper ───────────────────────────────────────────
async function odooRPC(apiKey, model, method, args, kwargs, odooUrl) {
  const targetUrl = odooUrl || ODOO_URL;
  const payload = {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: {
      service: 'object', method: 'execute_kw',
      args: [ODOO_DB, ODOO_UID, apiKey, model, method, args, kwargs || {}],
    },
  };
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error) { console.error('Odoo RPC error:', data.error.data?.message || data.error.message); return null; }
  return data.result;
}

// ─── Note: GET handled by onRequestGet, POST by onRequestPost, OPTIONS by onRequestOptions ──

// ─── Dashboard: Get all active assembly orders ─────────────────
async function handleDashboard(db) {
  // Get active orders (not handed_over) from last 24h
  const orders = await db.prepare(`
    SELECT * FROM assembly_orders
    WHERE status != 'handed_over'
      AND created_at > datetime('now', '-24 hours')
    ORDER BY
      CASE status
        WHEN 'assembled' THEN 0
        WHEN 'preparing' THEN 1
        WHEN 'packed' THEN 2
      END,
      created_at ASC
  `).all();

  // Get items for all active orders
  const orderIds = orders.results.map(o => o.id);
  let items = [];
  if (orderIds.length > 0) {
    const placeholders = orderIds.map(() => '?').join(',');
    items = (await db.prepare(
      `SELECT * FROM assembly_items WHERE assembly_order_id IN (${placeholders})`
    ).bind(...orderIds).all()).results;
  }

  // Group items by order
  const itemsByOrder = {};
  items.forEach(item => {
    if (!itemsByOrder[item.assembly_order_id]) itemsByOrder[item.assembly_order_id] = [];
    itemsByOrder[item.assembly_order_id].push(item);
  });

  // Build response with station status per order
  const enriched = orders.results.map(order => {
    const orderItems = itemsByOrder[order.id] || [];
    const stations = {};
    orderItems.forEach(item => {
      if (!stations[item.station]) stations[item.station] = { total: 0, ready: 0, items: [] };
      stations[item.station].total += item.quantity;
      if (item.status === 'ready') stations[item.station].ready += item.quantity;
      stations[item.station].items.push({
        name: item.product_name,
        qty: item.quantity,
        status: item.status,
      });
    });

    const elapsed = Math.round((Date.now() - new Date(order.created_at + 'Z').getTime()) / 60000);

    return {
      ...order,
      items: orderItems,
      stations,
      elapsed_minutes: elapsed,
    };
  });

  return new Response(JSON.stringify({
    ok: true,
    orders: enriched,
    counts: {
      preparing: enriched.filter(o => o.status === 'preparing').length,
      assembled: enriched.filter(o => o.status === 'assembled').length,
      packed: enriched.filter(o => o.status === 'packed').length,
    },
  }), { headers: CORS });
}

// (Push logic is in handlePushWithBody below, called from onRequestPost)

// ─── Create Odoo POS order for delivery ────────────────────────
async function createDeliveryOdooOrder(apiKey, source, sourceOrderId, customerName, items) {
  try {
    // Find active POS session
    const sessionRes = await odooRPC(apiKey, 'pos.session', 'search_read',
      [[['config_id', '=', POS_CONFIG_ID], ['state', '=', 'opened']]],
      { fields: ['id', 'name'], limit: 1 });
    if (!sessionRes?.length) { console.error('No active POS session for config', POS_CONFIG_ID); return null; }
    const sessionId = sessionRes[0].id;

    // Build order lines with KDS prep data
    const kdsLines = {};
    const lines = items.map(item => {
      const lineUuid = crypto.randomUUID();
      const odooId = item.odoo_product_id || item.odooId;
      const qty = item.quantity || item.qty || 1;
      const price = item.price || 0;
      const priceExcl = Math.round(price / 1.05 * 100) / 100;

      kdsLines[lineUuid] = {
        attribute_value_names: [],
        uuid: lineUuid,
        isCombo: false,
        product_id: odooId,
        name: item.name || item.product_name,
        basic_name: item.name || item.product_name,
        display_name: item.name || item.product_name,
        note: '[]',
        quantity: qty,
        customer_note: '',
      };

      return [0, 0, {
        product_id: odooId,
        qty,
        price_unit: priceExcl,
        price_subtotal: priceExcl * qty,
        price_subtotal_incl: price * qty,
        discount: 0,
        tax_ids: [[6, 0, [GST_TAX_ID]]],
        full_product_name: item.name || item.product_name,
        uuid: lineUuid,
      }];
    });

    const total = items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || i.qty || 1)), 0);
    const totalExcl = items.reduce((s, i) => {
      const p = Math.round((i.price || 0) / 1.05 * 100) / 100;
      return s + p * (i.quantity || i.qty || 1);
    }, 0);
    const taxAmount = Math.round((total - totalExcl) * 100) / 100;

    const sourceLabel = source.toUpperCase();
    const noteLines = [
      `${sourceLabel} ORDER: ${sourceOrderId || 'N/A'}`,
      customerName ? `Customer: ${customerName}` : null,
      `Platform: ${sourceLabel}`,
    ].filter(Boolean).join('\n');

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const prepChangePayload = JSON.stringify({
      lines: kdsLines,
      metadata: { serverDate: now },
      general_customer_note: '',
      internal_note: noteLines,
      sittingMode: 0,
    });

    const orderId = await odooRPC(apiKey, 'pos.order', 'create', [{
      session_id: sessionId,
      config_id: POS_CONFIG_ID,
      pricelist_id: PRICELIST_ID,
      preset_id: 2, // Takeout
      amount_total: total,
      amount_paid: total,
      amount_tax: taxAmount,
      amount_return: 0,
      date_order: now,
      lines,
      internal_note: noteLines,
      state: 'draft',
      last_order_preparation_change: prepChangePayload,
    }]);

    if (!orderId) return null;

    // Create payment (platform settlement)
    await odooRPC(apiKey, 'pos.payment', 'create', [{
      pos_order_id: orderId,
      payment_method_id: PAYMENT_METHOD_UPI,
      amount: total,
      payment_date: now,
      session_id: sessionId,
    }]);

    // Mark paid → triggers KDS prep orders
    await odooRPC(apiKey, 'pos.order', 'action_pos_order_paid', [[orderId]]);

    // Get order name + tracking
    const orderData = await odooRPC(apiKey, 'pos.order', 'search_read',
      [[['id', '=', orderId]]], { fields: ['name', 'tracking_number'] });

    return {
      id: orderId,
      name: orderData?.[0]?.name || `Order #${orderId}`,
      trackingNumber: orderData?.[0]?.tracking_number || null,
    };
  } catch (e) {
    console.error('Delivery Odoo order error:', e.message);
    return null;
  }
}

// ─── Status Updates (pack, handover) ───────────────────────────
async function handlePack(db, body) {
  const { order_id } = body;
  if (!order_id) return new Response(JSON.stringify({ error: 'Missing order_id' }), { status: 400, headers: CORS });

  const now = new Date().toISOString().slice(0, 19);
  await db.prepare('UPDATE assembly_orders SET status = ?, packed_at = ?, updated_at = ? WHERE id = ?')
    .bind('packed', now, now, order_id).run();

  return new Response(JSON.stringify({ ok: true, order_id, status: 'packed' }), { headers: CORS });
}

async function handleHandover(db, body) {
  const { order_id } = body;
  if (!order_id) return new Response(JSON.stringify({ error: 'Missing order_id' }), { status: 400, headers: CORS });

  const now = new Date().toISOString().slice(0, 19);
  await db.prepare('UPDATE assembly_orders SET status = ?, handed_over_at = ?, updated_at = ? WHERE id = ?')
    .bind('handed_over', now, now, order_id).run();

  return new Response(JSON.stringify({ ok: true, order_id, status: 'handed_over' }), { headers: CORS });
}

async function handleCancelOrder(db, body) {
  const { order_id } = body;
  if (!order_id) return new Response(JSON.stringify({ error: 'Missing order_id' }), { status: 400, headers: CORS });

  await db.prepare('DELETE FROM assembly_items WHERE assembly_order_id = ?').bind(order_id).run();
  await db.prepare('DELETE FROM assembly_orders WHERE id = ?').bind(order_id).run();

  return new Response(JSON.stringify({ ok: true, order_id, deleted: true }), { headers: CORS });
}

// ─── Products: Fetch Odoo product list for Push UI ─────────────
async function handleProducts(apiKey) {
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ODOO_API_KEY not set' }), { status: 500, headers: CORS });
  }

  // Fetch all active POS products with categories
  const products = await odooRPC(apiKey, 'product.product', 'search_read',
    [[['available_in_pos', '=', true], ['active', '=', true]]],
    { fields: ['id', 'name', 'list_price', 'pos_categ_ids'], limit: 300 });

  if (!products) {
    return new Response(JSON.stringify({ error: 'Failed to fetch Odoo products' }), { status: 502, headers: CORS });
  }

  // Clean product names and resolve stations
  const cleaned = products.map(p => {
    const cleanName = p.name.replace(/^\[HE-\w+\]\s*/, '');
    const catId = p.pos_categ_ids?.[0] || null;
    const station = catId ? (CATEGORY_STATION_MAP[catId] || 'Kitchen Pass') : 'Kitchen Pass';
    const abbr = STATION_ABBR[station] || 'KP';
    return {
      odooId: p.id,
      name: cleanName,
      rawName: p.name,
      price: p.list_price,
      catId,
      station,
      stationAbbr: abbr,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return new Response(JSON.stringify({ ok: true, products: cleaned, count: cleaned.length }), { headers: CORS });
}

// ─── Health: Extension connectivity check ──────────────────────
async function handleHealth(db) {
  const activeCount = await db.prepare(
    "SELECT COUNT(*) as cnt FROM assembly_orders WHERE status != 'handed_over' AND created_at > datetime('now', '-24 hours')"
  ).first();

  return new Response(JSON.stringify({
    ok: true,
    timestamp: new Date().toISOString(),
    active_orders: activeCount?.cnt || 0,
  }), { headers: CORS });
}

// ─── POST Handler ──────────────────────────────────────────────
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const db = context.env.DB;
  const apiKey = context.env.ODOO_API_KEY;

  // Auth check
  const authKey = url.searchParams.get('key') ||
    context.request.headers.get('X-API-Key') ||
    context.request.headers.get('Authorization')?.replace('Bearer ', '');
  if (authKey !== context.env.DASHBOARD_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  try {
    const body = await context.request.json();

    switch (action) {
      case 'push':     return await handlePushWithBody(context, db, apiKey, body);
      case 'pack':     return await handlePack(db, body);
      case 'handover': return await handleHandover(db, body);
      case 'cancel':   return await handleCancelOrder(db, body);
      default:
        return new Response(JSON.stringify({ error: 'Unknown POST action' }), { status: 400, headers: CORS });
    }
  } catch (e) {
    console.error('Assembly POST error:', e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}

async function handlePushWithBody(context, db, apiKey, body) {
  const { source, source_order_id, customer_name, items } = body;

  if (!source || !items || !items.length) {
    return new Response(JSON.stringify({ error: 'Missing source or items' }), { status: 400, headers: CORS });
  }
  if (!['swiggy', 'zomato', 'waba'].includes(source)) {
    return new Response(JSON.stringify({ error: 'Invalid source' }), { status: 400, headers: CORS });
  }

  // Duplicate check
  if (source_order_id) {
    const existing = await db.prepare(
      'SELECT id FROM assembly_orders WHERE source = ? AND source_order_id = ?'
    ).bind(source, source_order_id).first();
    if (existing) {
      return new Response(JSON.stringify({ error: 'Duplicate order', existing_id: existing.id }), { status: 409, headers: CORS });
    }
  }

  // Resolve stations
  const resolvedItems = items.map(item => {
    const catId = item.category_id || item.catId;
    const station = CATEGORY_STATION_MAP[catId] || 'Kitchen Pass';
    return { ...item, station, category_id: catId };
  });

  const stationSet = new Set(resolvedItems.map(i => i.station));
  const totalItems = resolvedItems.reduce((s, i) => s + (i.quantity || i.qty || 1), 0);

  // Create Odoo POS order
  let odooResult = null;
  if (apiKey && items.some(i => i.odoo_product_id || i.odooId)) {
    odooResult = await createDeliveryOdooOrder(apiKey, source, source_order_id, customer_name, resolvedItems);
  }

  const now = new Date().toISOString().slice(0, 19);

  const orderResult = await db.prepare(`
    INSERT INTO assembly_orders (source, source_order_id, odoo_order_id, odoo_order_name,
      tracking_number, customer_name, total_items, stations_total, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparing', ?, ?)
  `).bind(
    source, source_order_id || null,
    odooResult?.id || null, odooResult?.name || null, odooResult?.trackingNumber || null,
    customer_name || null, totalItems, stationSet.size, now, now
  ).run();

  const assemblyOrderId = orderResult.meta.last_row_id;

  for (const item of resolvedItems) {
    await db.prepare(`
      INSERT INTO assembly_items (assembly_order_id, product_name, odoo_product_id,
        quantity, category_id, station, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'preparing', ?)
    `).bind(
      assemblyOrderId,
      item.name || item.product_name,
      item.odoo_product_id || item.odooId || null,
      item.quantity || item.qty || 1,
      item.category_id || null,
      item.station, now
    ).run();
  }

  return new Response(JSON.stringify({
    ok: true,
    assembly_order_id: assemblyOrderId,
    odoo_order: odooResult ? { id: odooResult.id, name: odooResult.name, tracking: odooResult.trackingNumber } : null,
    stations: [...stationSet],
    total_items: totalItems,
  }), { status: 201, headers: CORS });
}

// Re-export GET handler
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const db = context.env.DB;
  const apiKey = context.env.ODOO_API_KEY;

  const authKey = url.searchParams.get('key') ||
    context.request.headers.get('X-API-Key') ||
    context.request.headers.get('Authorization')?.replace('Bearer ', '');
  if (authKey !== context.env.DASHBOARD_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  try {
    switch (action) {
      case 'dashboard': return await handleDashboard(db);
      case 'products':  return await handleProducts(apiKey);
      case 'health':    return await handleHealth(db);
      default:
        return new Response(JSON.stringify({ error: 'Unknown GET action' }), { status: 400, headers: CORS });
    }
  } catch (e) {
    console.error('Assembly GET error:', e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
