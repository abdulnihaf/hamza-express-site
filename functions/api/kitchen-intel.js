export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'live';

  const ODOO_URL = 'https://test.hamzahotel.com/jsonrpc';
  const ODOO_DB = 'main';
  const ODOO_UID = 2;
  const ODOO_API_KEY = context.env.ODOO_API_KEY;

  try {
    if (action === 'live') {
      return await handleLive(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, corsHeaders);
    } else if (action === 'stats') {
      const fromParam = url.searchParams.get('from');
      const toParam = url.searchParams.get('to');
      return await handleStats(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, fromParam, toParam, corsHeaders);
    }
    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), { status: 400, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
}

// ============================================================
// Data model chain:
//   pos.order → pos.prep.order (pos_order_id)
//             → pos.prep.line  (prep_order_id → pos.prep.order)
//             → pos.prep.state (prep_line_id  → pos.prep.line)
//
// pos.prep.line has NO order_id and NO category_id.
// Category comes from product_id → product.product.pos_categ_ids → pos.category
// ============================================================

async function fetchPrepData(odooUrl, db, uid, apiKey, orderIds) {
  // Step 1: Get prep orders (bridge between pos.order and prep.line)
  const prepOrders = await rpc(odooUrl, db, uid, apiKey, 'pos.prep.order', 'search_read',
    [[['pos_order_id', 'in', orderIds]]],
    { fields: ['id', 'pos_order_id', 'prep_line_ids'] });

  if (prepOrders.length === 0) return { prepLines: [], prepStates: [], productCatMap: {} };

  // Build prep_order → pos_order mapping
  const prepOrderToOrder = {};
  const allLineIds = [];
  for (const po of prepOrders) {
    const posOrderId = po.pos_order_id?.[0];
    prepOrderToOrder[po.id] = posOrderId;
    allLineIds.push(...(po.prep_line_ids || []));
  }

  if (allLineIds.length === 0) return { prepLines: [], prepStates: [], productCatMap: {} };

  // Step 2: Get prep lines and their states in parallel
  const [prepLines, prepStates] = await Promise.all([
    rpc(odooUrl, db, uid, apiKey, 'pos.prep.line', 'search_read',
      [[['id', 'in', allLineIds]]],
      { fields: ['id', 'prep_order_id', 'product_id', 'quantity', 'create_date'] }),
    rpc(odooUrl, db, uid, apiKey, 'pos.prep.state', 'search_read',
      [[['prep_line_id', 'in', allLineIds]]],
      { fields: ['id', 'prep_line_id', 'stage_id', 'todo', 'last_stage_change'] })
  ]);

  // Enrich prep lines with pos_order_id (resolved through prep_order)
  for (const line of prepLines) {
    const prepOrderId = line.prep_order_id?.[0];
    line._posOrderId = prepOrderToOrder[prepOrderId] || null;
  }

  // Step 3: Resolve product categories
  const productIds = [...new Set(prepLines.map(l => l.product_id?.[0]).filter(Boolean))];
  let productCatMap = {};
  if (productIds.length > 0) {
    const products = await rpc(odooUrl, db, uid, apiKey, 'product.product', 'search_read',
      [[['id', 'in', productIds]]],
      { fields: ['id', 'pos_categ_ids'] });

    // Get all category IDs
    const catIds = [...new Set(products.flatMap(p => p.pos_categ_ids || []))];
    let categories = [];
    if (catIds.length > 0) {
      categories = await rpc(odooUrl, db, uid, apiKey, 'pos.category', 'search_read',
        [[['id', 'in', catIds]]],
        { fields: ['id', 'name', 'parent_id'] });
    }

    // Build category resolver (walk to top-level parent)
    const catById = {};
    for (const c of categories) catById[c.id] = c;
    function topLevelCat(catId) {
      const cat = catById[catId];
      if (!cat) return { id: catId, name: 'Other' };
      if (!cat.parent_id) return { id: cat.id, name: cat.name };
      return topLevelCat(cat.parent_id[0]);
    }

    for (const p of products) {
      const catId = p.pos_categ_ids?.[0];
      productCatMap[p.id] = catId ? topLevelCat(catId) : { id: 0, name: 'Other' };
    }
  }

  return { prepLines, prepStates, productCatMap };
}

// --- Live order board ---
async function handleLive(odooUrl, db, uid, apiKey, headers) {
  const lookback = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const fromOdoo = lookback.toISOString().slice(0, 19).replace('T', ' ');

  const CONFIG_IDS = [5, 6, 10]; // Cash Counter, Captain, WABA
  const orders = await rpc(odooUrl, db, uid, apiKey, 'pos.order', 'search_read',
    [[['config_id', 'in', CONFIG_IDS], ['date_order', '>=', fromOdoo], ['state', 'in', ['paid', 'done', 'invoiced', 'posted']]]],
    { fields: ['id', 'name', 'date_order', 'amount_total', 'config_id', 'table_id', 'last_order_preparation_change', 'general_customer_note'], order: 'date_order desc', limit: 80 });

  if (orders.length === 0) {
    return new Response(JSON.stringify({ success: true, orders: [], stations: {} }), { headers });
  }

  const orderIds = orders.map(o => o.id);

  // Fetch prep data + order lines in parallel
  const [{ prepLines, prepStates, productCatMap }, orderLines] = await Promise.all([
    fetchPrepData(odooUrl, db, uid, apiKey, orderIds),
    rpc(odooUrl, db, uid, apiKey, 'pos.order.line', 'search_read',
      [[['order_id', 'in', orderIds]]],
      { fields: ['id', 'order_id', 'product_id', 'qty', 'price_subtotal_incl'] })
  ]);

  // Build state map: prep_line_id → [states]
  const statesByLine = {};
  for (const s of prepStates) {
    const lineId = s.prep_line_id?.[0];
    if (!lineId) continue;
    if (!statesByLine[lineId]) statesByLine[lineId] = [];
    statesByLine[lineId].push(s);
  }

  // Build order lines map
  const olByOrder = {};
  for (const ol of orderLines) {
    const oid = ol.order_id?.[0];
    if (!oid) continue;
    if (!olByOrder[oid]) olByOrder[oid] = [];
    olByOrder[oid].push(ol);
  }

  const result = [];
  const stationMetrics = {};

  for (const order of orders) {
    const orderId = order.id;
    const orderDate = parseOdooDate(order.date_order);
    const sittingMode = parseSittingMode(order.last_order_preparation_change);
    const isWaba = (order.general_customer_note || '').includes('WHATSAPP ORDER');
    const configId = order.config_id?.[0];

    const lines = prepLines.filter(l => l._posOrderId === orderId);
    const items = [];
    let allDone = true;
    let anyStarted = false;

    for (const line of lines) {
      const states = statesByLine[line.id] || [];
      const productId = line.product_id?.[0];
      const catInfo = productCatMap[productId] || { id: 0, name: 'Unknown' };
      const productName = cleanProductName(line.product_id?.[1] || 'Unknown');

      const stationStages = getStationStages(states);
      const currentStage = getCurrentStage(stationStages);
      const timing = computeItemTiming(line.create_date, stationStages);

      if (!['Completed', 'Packed', 'Ready', 'Prepared'].includes(currentStage)) {
        allDone = false;
      }
      if (currentStage !== 'To prepare') anyStarted = true;

      if (!stationMetrics[catInfo.name]) {
        stationMetrics[catInfo.name] = { catId: catInfo.id, total: 0, prepTimes: [] };
      }
      stationMetrics[catInfo.name].total += line.quantity;
      if (timing.prepDuration > 0) stationMetrics[catInfo.name].prepTimes.push(timing.prepDuration);

      items.push({
        id: line.id,
        product: productName,
        qty: line.quantity,
        station: catInfo.name,
        stage: currentStage,
        elapsed: timing.elapsed,
        prepDuration: timing.prepDuration
      });
    }

    const kpStatus = getKPStatus(lines, statesByLine);
    const elapsedMin = orderDate ? Math.round((Date.now() - orderDate.getTime()) / 60000) : 0;

    let configLabel = 'Counter';
    if (configId === 6) configLabel = 'Captain';
    else if (configId === 10) configLabel = 'WhatsApp';

    result.push({
      id: orderId,
      name: order.name,
      time: formatIST(orderDate),
      elapsed: elapsedMin,
      amount: Math.round(order.amount_total),
      type: sittingMode === 0 ? 'dine-in' : 'takeaway',
      source: isWaba || configId === 10 ? 'whatsapp' : 'counter',
      table: order.table_id?.[1] || null,
      config: configLabel,
      items,
      kpStatus,
      status: items.length === 0 ? 'ready' : allDone ? 'ready' : anyStarted ? 'preparing' : 'queued',
      itemCount: (olByOrder[orderId] || []).reduce((s, l) => s + l.qty, 0)
    });
  }

  const stations = {};
  for (const [name, data] of Object.entries(stationMetrics)) {
    const avgPrep = data.prepTimes.length > 0
      ? Math.round(data.prepTimes.reduce((a, b) => a + b, 0) / data.prepTimes.length / 60)
      : 0;
    stations[name] = { catId: data.catId, itemsProcessed: data.total, avgPrepMin: avgPrep, samplesCount: data.prepTimes.length };
  }

  return new Response(JSON.stringify({ success: true, orders: result, stations }), { headers });
}

// --- Historical stats ---
async function handleStats(odooUrl, db, uid, apiKey, fromParam, toParam, headers) {
  let fromUTC, toUTC;
  if (fromParam) {
    fromUTC = new Date(new Date(fromParam).getTime() - 5.5 * 60 * 60 * 1000);
  } else {
    const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    todayIST.setUTCHours(0, 0, 0, 0);
    fromUTC = new Date(todayIST.getTime() - 5.5 * 60 * 60 * 1000);
  }
  if (toParam) {
    toUTC = new Date(new Date(toParam).getTime() - 5.5 * 60 * 60 * 1000);
  } else {
    toUTC = new Date();
  }

  const fromOdoo = fromUTC.toISOString().slice(0, 19).replace('T', ' ');
  const toOdoo = toUTC.toISOString().slice(0, 19).replace('T', ' ');

  const CONFIG_IDS = [5, 6, 10];
  const orders = await rpc(odooUrl, db, uid, apiKey, 'pos.order', 'search_read',
    [[['config_id', 'in', CONFIG_IDS], ['date_order', '>=', fromOdoo], ['date_order', '<=', toOdoo], ['state', 'in', ['paid', 'done', 'invoiced', 'posted']]]],
    { fields: ['id', 'name', 'date_order', 'amount_total', 'config_id', 'last_order_preparation_change'], limit: 500 });

  if (orders.length === 0) {
    return new Response(JSON.stringify({
      success: true,
      query: { from: formatISTStr(fromUTC), to: formatISTStr(toUTC) },
      stationPerf: [], kpFlow: {}, hourly: buildEmptyHourly(), orderTimelines: [], summary: emptySummary()
    }), { headers });
  }

  const orderIds = orders.map(o => o.id);
  const { prepLines, prepStates, productCatMap } = await fetchPrepData(odooUrl, db, uid, apiKey, orderIds);

  const statesByLine = {};
  for (const s of prepStates) {
    const lineId = s.prep_line_id?.[0];
    if (!lineId) continue;
    if (!statesByLine[lineId]) statesByLine[lineId] = [];
    statesByLine[lineId].push(s);
  }

  // --- Station Performance ---
  const stationData = {};
  for (const line of prepLines) {
    const productId = line.product_id?.[0];
    const catInfo = productCatMap[productId] || { id: 0, name: 'Unknown' };
    if (!stationData[catInfo.name]) stationData[catInfo.name] = { catId: catInfo.id, items: 0, prepTimes: [], orders: new Set() };
    stationData[catInfo.name].items += line.quantity;
    stationData[catInfo.name].orders.add(line._posOrderId);

    const states = statesByLine[line.id] || [];
    const timing = computeItemTiming(line.create_date, getStationStages(states));
    if (timing.prepDuration > 0) stationData[catInfo.name].prepTimes.push(timing.prepDuration);
  }

  const stationPerf = Object.entries(stationData).map(([name, d]) => {
    const times = d.prepTimes;
    const sorted = [...times].sort((a, b) => a - b);
    return {
      station: name,
      catId: d.catId,
      items: d.items,
      orders: d.orders.size,
      avgPrepSec: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
      medianPrepSec: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0,
      p90PrepSec: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.9)] : 0,
      maxPrepSec: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
      samples: times.length
    };
  }).sort((a, b) => b.items - a.items);

  // --- KP Master Flow ---
  const KP_STAGES = { 75: 'Preparing', 44: 'Ready', 74: 'Packed', 63: 'Completed' };
  const kpTransitions = { preparing: [], ready: [], packed: [] };

  for (const line of prepLines) {
    const states = statesByLine[line.id] || [];
    const kpStates = states.filter(s => KP_STAGES[s.stage_id?.[0]]);
    if (kpStates.length < 2) continue;

    const stageOrder = [75, 44, 74, 63];
    kpStates.sort((a, b) => stageOrder.indexOf(a.stage_id?.[0]) - stageOrder.indexOf(b.stage_id?.[0]));

    for (let i = 0; i < kpStates.length - 1; i++) {
      const fromStage = kpStates[i].stage_id?.[0];
      const toStage = kpStates[i + 1].stage_id?.[0];
      const fromTime = parseOdooDate(kpStates[i].last_stage_change);
      const toTime = parseOdooDate(kpStates[i + 1].last_stage_change);
      if (!fromTime || !toTime) continue;
      const dur = Math.round((toTime - fromTime) / 1000);
      if (dur < 0 || dur > 7200) continue;
      if (fromStage === 75 && toStage === 44) kpTransitions.preparing.push(dur);
      else if (fromStage === 44 && toStage === 74) kpTransitions.ready.push(dur);
      else if (fromStage === 74 && toStage === 63) kpTransitions.packed.push(dur);
    }
  }

  const kpFlow = {
    preparingToReady: avgSec(kpTransitions.preparing),
    readyToPacked: avgSec(kpTransitions.ready),
    packedToCompleted: avgSec(kpTransitions.packed),
    samples: { preparing: kpTransitions.preparing.length, ready: kpTransitions.ready.length, packed: kpTransitions.packed.length }
  };

  // --- Hourly trends ---
  const hourlyData = {};
  const orderPrepTimes = [];
  for (const order of orders) {
    const orderDate = parseOdooDate(order.date_order);
    if (!orderDate) continue;
    const istTime = new Date(orderDate.getTime() + 5.5 * 60 * 60 * 1000);
    const hourKey = istTime.getUTCHours().toString().padStart(2, '0');
    if (!hourlyData[hourKey]) hourlyData[hourKey] = { orders: 0, items: 0, totalPrepSec: 0, prepCount: 0 };
    hourlyData[hourKey].orders++;

    const oLines = prepLines.filter(l => l._posOrderId === order.id);
    let lastDone = 0;
    let itemCount = 0;
    for (const line of oLines) {
      itemCount += line.quantity;
      const states = statesByLine[line.id] || [];
      for (const s of states) {
        const t = parseOdooDate(s.last_stage_change);
        if (t && t.getTime() > lastDone) lastDone = t.getTime();
      }
    }
    hourlyData[hourKey].items += itemCount;

    if (lastDone > 0) {
      const totalSec = Math.round((lastDone - orderDate.getTime()) / 1000);
      if (totalSec > 0 && totalSec < 7200) {
        hourlyData[hourKey].totalPrepSec += totalSec;
        hourlyData[hourKey].prepCount++;
        orderPrepTimes.push(totalSec);
      }
    }
  }

  const hourly = buildEmptyHourly();
  for (const h of hourly) {
    const key = h.hour.toString().padStart(2, '0');
    const data = hourlyData[key];
    if (data) { h.orders = data.orders; h.items = data.items; h.avgPrepSec = data.prepCount > 0 ? Math.round(data.totalPrepSec / data.prepCount) : 0; }
  }

  // --- Order timelines (last 20) ---
  const recentOrders = orders.slice(0, 20);
  const orderTimelines = recentOrders.map(order => {
    const orderDate = parseOdooDate(order.date_order);
    const oLines = prepLines.filter(l => l._posOrderId === order.id);
    const sittingMode = parseSittingMode(order.last_order_preparation_change);
    const timeline = [];
    for (const line of oLines) {
      const states = statesByLine[line.id] || [];
      const productId = line.product_id?.[0];
      const catInfo = productCatMap[productId] || { id: 0, name: 'Unknown' };
      const productName = cleanProductName(line.product_id?.[1] || 'Unknown');
      const stationStages = getStationStages(states);
      const events = [];
      const created = parseOdooDate(line.create_date);
      if (created) events.push({ stage: 'Sent', time: created.getTime() });
      for (const s of stationStages) {
        const t = parseOdooDate(s.last_stage_change);
        if (t) events.push({ stage: s.stage_id?.[1] || '?', time: t.getTime() });
      }
      events.sort((a, b) => a.time - b.time);
      timeline.push({
        product: productName, station: catInfo.name, qty: line.quantity,
        events: events.map(e => ({ stage: e.stage, timeIST: formatIST(new Date(e.time)), offsetSec: orderDate ? Math.round((e.time - orderDate.getTime()) / 1000) : 0 }))
      });
    }
    return {
      id: order.id, name: order.name, time: orderDate ? formatIST(orderDate) : '',
      type: sittingMode === 0 ? 'dine-in' : 'takeaway',
      config: order.config_id?.[0] === 6 ? 'Captain' : order.config_id?.[0] === 10 ? 'WhatsApp' : 'Counter',
      amount: Math.round(order.amount_total), timeline
    };
  });

  const sortedPrepTimes = [...orderPrepTimes].sort((a, b) => a - b);
  const summary = {
    totalOrders: orders.length,
    avgOrderPrepSec: sortedPrepTimes.length > 0 ? Math.round(sortedPrepTimes.reduce((a, b) => a + b, 0) / sortedPrepTimes.length) : 0,
    medianOrderPrepSec: sortedPrepTimes.length > 0 ? sortedPrepTimes[Math.floor(sortedPrepTimes.length / 2)] : 0,
    p90OrderPrepSec: sortedPrepTimes.length > 0 ? sortedPrepTimes[Math.floor(sortedPrepTimes.length * 0.9)] : 0,
    counterOrders: orders.filter(o => o.config_id?.[0] === 5).length,
    captainOrders: orders.filter(o => o.config_id?.[0] === 6).length,
    wabaOrders: orders.filter(o => o.config_id?.[0] === 10).length,
    totalItems: prepLines.reduce((s, l) => s + l.quantity, 0)
  };

  return new Response(JSON.stringify({
    success: true,
    query: { from: formatISTStr(fromUTC), to: formatISTStr(toUTC) },
    stationPerf, kpFlow, hourly, orderTimelines, summary
  }), { headers });
}

// --- Stage classification helpers ---

const STATION_STAGE_IDS = new Set([
  80, 81, 83, 85, 86, 84, 87, 88, 89, 90, 91, 92,
  45, 46, 47, 48, 49, 58, 50, 51, 52, 59, 53, 54, 55, 60, 56, 57
]);

const STAGE_INFO = {
  80: { name: 'To prepare', seq: 0 }, 81: { name: 'Preparing', seq: 1 }, 83: { name: 'Prepared', seq: 2 },
  85: { name: 'To prepare', seq: 0 }, 86: { name: 'Preparing', seq: 1 }, 84: { name: 'Prepared', seq: 2 },
  87: { name: 'To prepare', seq: 0 }, 88: { name: 'Preparing', seq: 1 }, 89: { name: 'Prepared', seq: 2 },
  90: { name: 'To prepare', seq: 0 }, 91: { name: 'Preparing', seq: 1 }, 92: { name: 'Prepared', seq: 2 },
  45: { name: 'To prepare', seq: 0 }, 46: { name: 'Preparing', seq: 1 }, 47: { name: 'Ready', seq: 2 }, 48: { name: 'Completed', seq: 3 },
  49: { name: 'To prepare', seq: 0 }, 58: { name: 'Preparing', seq: 1 }, 50: { name: 'Packed', seq: 2 }, 51: { name: 'Completed', seq: 3 },
  52: { name: 'To prepare', seq: 0 }, 59: { name: 'Preparing', seq: 1 }, 53: { name: 'Ready', seq: 2 }, 54: { name: 'Completed', seq: 3 },
  55: { name: 'To prepare', seq: 0 }, 60: { name: 'Preparing', seq: 1 }, 56: { name: 'Ready', seq: 2 }, 57: { name: 'Completed', seq: 3 },
  75: { name: 'Preparing', seq: 0 }, 44: { name: 'Ready', seq: 1 }, 74: { name: 'Packed', seq: 2 }, 63: { name: 'Completed', seq: 3 }
};

function getStationStages(states) {
  return states.filter(s => STATION_STAGE_IDS.has(s.stage_id?.[0]));
}

function getCurrentStage(stationStages) {
  if (stationStages.length === 0) return 'To prepare';
  let highestDone = -1;
  let highestDoneName = 'To prepare';
  for (const s of stationStages) {
    const info = STAGE_INFO[s.stage_id?.[0]];
    if (!info) continue;
    if (!s.todo && info.seq > highestDone) { highestDone = info.seq; highestDoneName = info.name; }
  }
  if (['Prepared', 'Ready', 'Packed', 'Completed'].includes(highestDoneName)) return highestDoneName;
  if (highestDoneName === 'Preparing') return 'Preparing';
  return 'To prepare';
}

function getKPStatus(prepLines, statesByLine) {
  const KP_STAGE_IDS = new Set([75, 44, 74, 63]);
  let maxSeq = -1;
  let maxName = 'Queued';
  for (const line of prepLines) {
    const states = statesByLine[line.id] || [];
    for (const s of states) {
      const sid = s.stage_id?.[0];
      if (!KP_STAGE_IDS.has(sid)) continue;
      const info = STAGE_INFO[sid];
      if (!info) continue;
      if (!s.todo && info.seq > maxSeq) { maxSeq = info.seq; maxName = info.name; }
    }
  }
  return maxName;
}

function computeItemTiming(createDate, stationStages) {
  const created = parseOdooDate(createDate);
  const elapsed = created ? Math.round((Date.now() - created.getTime()) / 1000) : 0;
  let prepDuration = 0;
  for (const s of stationStages) {
    const info = STAGE_INFO[s.stage_id?.[0]];
    if (!info) continue;
    if (['Prepared', 'Ready', 'Packed'].includes(info.name) && !s.todo) {
      const doneTime = parseOdooDate(s.last_stage_change);
      if (doneTime && created) prepDuration = Math.round((doneTime - created.getTime()) / 1000);
    }
  }
  return { elapsed, prepDuration };
}

// --- Utility ---
function parseOdooDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr.replace(' ', 'T') + 'Z');
}

function parseSittingMode(json) {
  if (!json) return 2;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed.sittingMode ?? 2;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed[parsed.length - 1].sittingMode ?? 2;
  } catch { /* ignore */ }
  return 2;
}

function formatIST(date) {
  if (!date) return '';
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const h = ist.getUTCHours();
  const m = ist.getUTCMinutes().toString().padStart(2, '0');
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatISTStr(utcDate) {
  return new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

function cleanProductName(name) {
  return name.replace(/^\[HE-[A-Z0-9]+\]\s*/, '');
}

function avgSec(arr) {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function buildEmptyHourly() {
  const arr = [];
  for (let h = 0; h <= 23; h++) {
    arr.push({ hour: h, label: h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? (h - 12) + ' PM' : h + ' AM', orders: 0, items: 0, avgPrepSec: 0 });
  }
  return arr;
}

function emptySummary() {
  return { totalOrders: 0, avgOrderPrepSec: 0, medianOrderPrepSec: 0, p90OrderPrepSec: 0, counterOrders: 0, captainOrders: 0, wabaOrders: 0, totalItems: 0 };
}

async function rpc(url, db, uid, apiKey, model, method, args, kwargs = {}) {
  const payload = {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: { service: 'object', method: 'execute_kw', args: [db, uid, apiKey, model, method, args, kwargs] }
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Odoo RPC error');
  return data.result || [];
}
