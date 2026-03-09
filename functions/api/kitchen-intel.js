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
  const prepOrders = await rpc(odooUrl, db, uid, apiKey, 'pos.prep.order', 'search_read',
    [[['pos_order_id', 'in', orderIds]]],
    { fields: ['id', 'pos_order_id', 'prep_line_ids'] });

  if (prepOrders.length === 0) return { prepLines: [], prepStates: [], productCatMap: {} };

  const prepOrderToOrder = {};
  const allLineIds = [];
  for (const po of prepOrders) {
    const posOrderId = po.pos_order_id?.[0];
    prepOrderToOrder[po.id] = posOrderId;
    allLineIds.push(...(po.prep_line_ids || []));
  }

  if (allLineIds.length === 0) return { prepLines: [], prepStates: [], productCatMap: {} };

  const [prepLines, prepStates] = await Promise.all([
    rpc(odooUrl, db, uid, apiKey, 'pos.prep.line', 'search_read',
      [[['id', 'in', allLineIds]]],
      { fields: ['id', 'prep_order_id', 'product_id', 'quantity', 'create_date', 'attribute_value_ids'] }),
    rpc(odooUrl, db, uid, apiKey, 'pos.prep.state', 'search_read',
      [[['prep_line_id', 'in', allLineIds]]],
      { fields: ['id', 'prep_line_id', 'stage_id', 'todo', 'last_stage_change'] })
  ]);

  for (const line of prepLines) {
    const prepOrderId = line.prep_order_id?.[0];
    line._posOrderId = prepOrderToOrder[prepOrderId] || null;
  }

  // Resolve product categories (fetch ALL for parent walk-up)
  const productIds = [...new Set(prepLines.map(l => l.product_id?.[0]).filter(Boolean))];
  let productCatMap = {};
  if (productIds.length > 0) {
    const [products, categories] = await Promise.all([
      rpc(odooUrl, db, uid, apiKey, 'product.product', 'search_read',
        [[['id', 'in', productIds]]], { fields: ['id', 'pos_categ_ids'] }),
      rpc(odooUrl, db, uid, apiKey, 'pos.category', 'search_read',
        [[]], { fields: ['id', 'name', 'parent_id'] })
    ]);

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

  // Resolve attribute values (portion/variant names)
  const allAttrIds = [...new Set(prepLines.flatMap(l => l.attribute_value_ids || []))];
  let attrMap = {};
  if (allAttrIds.length > 0) {
    const attrs = await rpc(odooUrl, db, uid, apiKey, 'product.template.attribute.value', 'search_read',
      [[['id', 'in', allAttrIds]]], { fields: ['id', 'name'] });
    for (const a of attrs) attrMap[a.id] = a.name;
  }

  for (const line of prepLines) {
    line._attrNames = (line.attribute_value_ids || []).map(id => attrMap[id]).filter(Boolean);
  }

  return { prepLines, prepStates, productCatMap };
}

// --- Live order board ---
async function handleLive(odooUrl, db, uid, apiKey, headers) {
  const CUTOFF_UTC = '2026-03-08 12:30:00';
  const lookback = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const lookbackStr = lookback.toISOString().slice(0, 19).replace('T', ' ');
  const fromOdoo = lookbackStr > CUTOFF_UTC ? lookbackStr : CUTOFF_UTC;

  const CONFIG_IDS = [5, 6, 10];
  const orders = await rpc(odooUrl, db, uid, apiKey, 'pos.order', 'search_read',
    [[['config_id', 'in', CONFIG_IDS], ['date_order', '>=', fromOdoo], ['state', 'in', ['draft', 'paid', 'done', 'invoiced', 'posted']]]],
    { fields: ['id', 'name', 'state', 'date_order', 'amount_total', 'config_id', 'table_id', 'last_order_preparation_change', 'general_customer_note', 'write_date'], order: 'date_order desc', limit: 80 });

  if (orders.length === 0) {
    return new Response(JSON.stringify({ success: true, orders: [], stations: {}, todaySummary: emptyTodaySummary() }), { headers });
  }

  const orderIds = orders.map(o => o.id);

  const [{ prepLines, prepStates, productCatMap }, orderLines] = await Promise.all([
    fetchPrepData(odooUrl, db, uid, apiKey, orderIds),
    rpc(odooUrl, db, uid, apiKey, 'pos.order.line', 'search_read',
      [[['order_id', 'in', orderIds]]],
      { fields: ['id', 'order_id', 'product_id', 'qty', 'price_subtotal_incl'] })
  ]);

  const statesByLine = {};
  for (const s of prepStates) {
    const lineId = s.prep_line_id?.[0];
    if (!lineId) continue;
    if (!statesByLine[lineId]) statesByLine[lineId] = [];
    statesByLine[lineId].push(s);
  }

  const olByOrder = {};
  for (const ol of orderLines) {
    const oid = ol.order_id?.[0];
    if (!oid) continue;
    if (!olByOrder[oid]) olByOrder[oid] = [];
    olByOrder[oid].push(ol);
  }

  const result = [];
  const stationMetrics = {};
  const kpPrepTimes = [];
  const gapTimes = [];

  for (const order of orders) {
    const orderId = order.id;
    const orderDate = parseOdooDate(order.date_order);
    const sittingMode = parseSittingMode(order.last_order_preparation_change);
    const isWaba = (order.general_customer_note || '').includes('WHATSAPP ORDER');
    const configId = order.config_id?.[0];
    const isDraft = order.state === 'draft';

    // Draft counter orders = cashier mid-entry or abandoned. Skip.
    if (isDraft && configId !== 6) continue;

    const lines = prepLines.filter(l => l._posOrderId === orderId);
    const items = [];
    let allDone = true;
    let anyStarted = false;

    for (const line of lines) {
      const states = statesByLine[line.id] || [];
      const productId = line.product_id?.[0];
      const catInfo = productCatMap[productId] || { id: 0, name: 'Unknown' };
      const productName = formatProductName(line);

      const stationStages = getStationStages(states);
      const currentStage = getCurrentStage(stationStages);
      const timing = computeItemTiming(line.create_date, stationStages);
      const kpTiming = computeKPTiming(states, timing.doneTime);

      if (!['Completed', 'Packed', 'Ready', 'Prepared'].includes(currentStage)) {
        allDone = false;
      }
      if (currentStage !== 'To prepare') anyStarted = true;

      if (!stationMetrics[catInfo.name]) {
        stationMetrics[catInfo.name] = { catId: catInfo.id, total: 0, prepTimes: [] };
      }
      stationMetrics[catInfo.name].total += line.quantity;
      if (timing.prepDuration > 0) stationMetrics[catInfo.name].prepTimes.push(timing.prepDuration);
      if (kpTiming.kpSec > 0) kpPrepTimes.push(kpTiming.kpSec);
      if (kpTiming.gapSec > 0) gapTimes.push(kpTiming.gapSec);

      items.push({
        id: line.id, product: productName, qty: line.quantity,
        station: catInfo.name, stage: currentStage,
        elapsed: timing.elapsed, prepDuration: timing.prepDuration,
        sentAt: formatIST(parseOdooDate(line.create_date)),
        doneAt: timing.doneTime ? formatIST(timing.doneTime) : null,
        kpStage: kpTiming.kpStage,
        kpSec: kpTiming.kpSec,
        gapSec: kpTiming.gapSec,
      });
    }

    const kpStatus = getKPStatus(lines, statesByLine);

    // For Captain paid orders, date_order = payment time, NOT kitchen send time.
    // Use earliest prep line create_date as the real start time.
    let effectiveStart = orderDate;
    if (configId === 6 && !isDraft && lines.length > 0) {
      for (const line of lines) {
        const lineCreated = parseOdooDate(line.create_date);
        if (lineCreated && (!effectiveStart || lineCreated < effectiveStart)) {
          effectiveStart = lineCreated;
        }
      }
    }
    const elapsedMin = effectiveStart ? Math.round((Date.now() - effectiveStart.getTime()) / 60000) : 0;

    // Prep completion time: split station vs KP
    // BM (catId 28) items are bulk-cleared hours late on KDS — exclude from order-level timing
    const BM_CAT_ID = 28;
    const KP_IDS = new Set([75, 44, 74, 63]);
    let stationCompleteTime = null;
    let kpCompleteTime = null;
    let prepCompleteTimeAll = null; // includes BM, for status determination
    for (const line of lines) {
      const states = statesByLine[line.id] || [];
      const productId = line.product_id?.[0];
      const catInfo = productCatMap[productId] || { id: 0 };
      const isBM = catInfo.id === BM_CAT_ID;
      for (const s of states) {
        const sid = s.stage_id?.[0];
        const t = parseOdooDate(s.last_stage_change);
        if (!t) continue;
        if (!prepCompleteTimeAll || t > prepCompleteTimeAll) prepCompleteTimeAll = t;
        if (KP_IDS.has(sid)) {
          if (!kpCompleteTime || t > kpCompleteTime) kpCompleteTime = t;
        } else if (!isBM) {
          if (!stationCompleteTime || t > stationCompleteTime) stationCompleteTime = t;
        }
      }
    }
    // Use station time for prep metrics; fallback to KP or all
    const prepCompleteTime = stationCompleteTime || kpCompleteTime || prepCompleteTimeAll;
    const prepCompleteSec = (prepCompleteTime && effectiveStart) ? Math.round((prepCompleteTime - effectiveStart) / 1000) : null;

    // Per-order split timing averages
    const itemStationTimes = items.filter(i => i.prepDuration > 0).map(i => i.prepDuration);
    const itemKPTimes = items.filter(i => i.kpSec > 0).map(i => i.kpSec);
    const itemGapTimes = items.filter(i => i.gapSec > 0).map(i => i.gapSec);
    const stationAvgSec = itemStationTimes.length > 0 ? Math.round(itemStationTimes.reduce((a, b) => a + b, 0) / itemStationTimes.length) : null;
    const kpAvgSec = itemKPTimes.length > 0 ? Math.round(itemKPTimes.reduce((a, b) => a + b, 0) / itemKPTimes.length) : null;
    const gapAvgSec = itemGapTimes.length > 0 ? Math.round(itemGapTimes.reduce((a, b) => a + b, 0) / itemGapTimes.length) : null;

    // Lifecycle-aware status model
    let status;
    if (isDraft) {
      // Active dine-in table (Captain draft)
      if (items.length === 0 && lines.length === 0) status = 'dining_ordering';
      else if (allDone) status = 'dining_served';
      else if (anyStarted) status = 'dining_preparing';
      else status = 'dining_queued';
    } else {
      // Paid/done order
      if (items.length === 0) status = 'no_prep';
      else if (allDone) status = 'completed';
      else if (anyStarted) status = 'preparing';
      else status = 'queued';
    }

    // Dining phase timing (for active draft tables)
    const seatedMin = effectiveStart ? Math.round((Date.now() - effectiveStart.getTime()) / 60000) : 0;
    const kitchenSec = (prepCompleteTime && effectiveStart) ? Math.round((prepCompleteTime - effectiveStart) / 1000) : null;
    const atTableSec = (allDone && prepCompleteTime) ? Math.round((Date.now() - prepCompleteTime.getTime()) / 1000) : null;

    // Dine-in tracking for completed orders
    // Captain POS (config 6) = always dine-in; others use sittingMode
    const settleDate = parseOdooDate(order.write_date);
    const isDineIn = configId === 6 || sittingMode === 0;
    // Dine time = effectiveStart (kitchen send) to settle (payment)
    const settleTimeSec = (settleDate && effectiveStart) ? Math.round((settleDate - effectiveStart) / 1000) : null;
    const dineTimeSec = (!isDraft && isDineIn && configId === 6 && settleTimeSec > 60 && settleTimeSec < 14400) ? settleTimeSec : null;
    const postPrepSec = (dineTimeSec && prepCompleteSec && settleTimeSec > prepCompleteSec) ? settleTimeSec - prepCompleteSec : null;

    let configLabel = 'Counter';
    if (configId === 6) configLabel = 'Captain';
    else if (configId === 10) configLabel = 'WhatsApp';

    // Draft Captain orders have name='/' — use table name instead
    const shortName = isDraft
      ? (order.table_id?.[1] || 'Table ?')
      : '#' + parseInt(order.name.replace(/.*-\s*/, ''), 10);

    result.push({
      id: orderId, name: order.name, shortName, time: formatIST(orderDate),
      elapsed: elapsedMin, amount: Math.round(order.amount_total),
      type: isDineIn ? 'dine-in' : 'takeaway',
      source: isWaba || configId === 10 ? 'whatsapp' : 'counter',
      table: order.table_id ? { id: order.table_id[0], name: order.table_id[1] } : null,
      config: configLabel, items, kpStatus, status,
      itemCount: (olByOrder[orderId] || []).reduce((s, l) => s + l.qty, 0),
      prepCompleteSec, dineTimeSec, postPrepSec,
      stationAvgSec, kpAvgSec, gapAvgSec,
      seatedMin: isDraft ? seatedMin : null,
      kitchenSec: isDraft ? kitchenSec : null,
      atTableSec: isDraft ? atTableSec : null,
      timestamps: {
        placed: formatIST(effectiveStart),
        foodReady: prepCompleteTime ? formatIST(prepCompleteTime) : null,
        settled: !isDraft && settleDate ? formatIST(settleDate) : null
      }
    });
  }

  // --- Today's Summary ---
  const DINING_STATUSES = new Set(['dining_ordering', 'dining_queued', 'dining_preparing', 'dining_served']);
  const COUNTER_ACTIVE_STATUSES = new Set(['queued', 'preparing']);
  const DONE_STATUSES = new Set(['completed', 'no_prep']);

  const diningOrders = result.filter(o => DINING_STATUSES.has(o.status));
  const counterActive = result.filter(o => COUNTER_ACTIVE_STATUSES.has(o.status));
  const completedOrders = result.filter(o => DONE_STATUSES.has(o.status));
  const dineInCompleted = completedOrders.filter(o => o.type === 'dine-in' && o.config === 'Captain' && o.dineTimeSec);
  const counterDone = completedOrders.filter(o => o.config !== 'Captain');
  const counterPrepTimes = counterDone.filter(o => o.prepCompleteSec).map(o => o.prepCompleteSec);
  const diningPrepTimes = dineInCompleted.filter(o => o.prepCompleteSec).map(o => o.prepCompleteSec);

  // Alerts: stuck orders and items (both dining + counter active)
  const allActive = [...diningOrders, ...counterActive];
  const alerts = [];
  for (const o of allActive) {
    if ((o.status === 'queued' || o.status === 'dining_queued') && o.elapsed > 5) {
      alerts.push({ name: o.shortName, type: 'not_started', message: `Queued ${o.elapsed}m — not started`, config: o.config });
    } else if (o.elapsed > 20 && !DINING_STATUSES.has(o.status)) {
      alerts.push({ name: o.shortName, type: 'slow_order', message: `${o.elapsed}m in kitchen`, config: o.config });
    }
    for (const item of o.items) {
      if (item.stage === 'Preparing' && item.elapsed > 900) {
        alerts.push({ name: o.shortName, type: 'stuck_item', message: `${item.product} stuck preparing (${Math.round(item.elapsed / 60)}m)`, config: o.config });
      }
    }
  }
  // Dining-specific alerts
  for (const o of diningOrders) {
    if (o.status === 'dining_served' && o.atTableSec && o.atTableSec > 2400) {
      alerts.push({ name: o.shortName, type: 'long_dine', message: `Dining ${Math.round(o.atTableSec / 60)}m since food served`, config: o.config });
    }
  }

  const todaySummary = {
    totalOrders: result.length,
    dining: {
      activeTables: diningOrders.length,
      tables: diningOrders.map(o => ({
        shortName: o.shortName, table: o.table, status: o.status,
        seatedMin: o.seatedMin, amount: o.amount,
        itemsDone: o.items.filter(i => ['Completed', 'Packed', 'Ready', 'Prepared'].includes(i.stage)).length,
        itemsTotal: o.items.length,
        kitchenSec: o.kitchenSec, atTableSec: o.atTableSec
      })),
      completedCount: dineInCompleted.length,
      avgKitchenSec: dineInCompleted.length > 0 ? Math.round(dineInCompleted.filter(o => o.prepCompleteSec).reduce((a, b) => a + b.prepCompleteSec, 0) / Math.max(dineInCompleted.filter(o => o.prepCompleteSec).length, 1)) : 0,
      avgDineTimeSec: dineInCompleted.length > 0 ? Math.round(dineInCompleted.reduce((a, b) => a + b.dineTimeSec, 0) / dineInCompleted.length) : 0,
      avgPostPrepSec: dineInCompleted.filter(o => o.postPrepSec).length > 0
        ? Math.round(dineInCompleted.filter(o => o.postPrepSec).reduce((a, b) => a + b.postPrepSec, 0) / dineInCompleted.filter(o => o.postPrepSec).length) : 0,
    },
    counter: {
      activeCount: counterActive.length,
      completedCount: counterDone.length,
      avgPrepSec: counterPrepTimes.length > 0 ? Math.round(counterPrepTimes.reduce((a, b) => a + b, 0) / counterPrepTimes.length) : 0,
      avgKPSec: kpPrepTimes.length > 0 ? Math.round(kpPrepTimes.reduce((a, b) => a + b, 0) / kpPrepTimes.length) : 0,
      avgGapSec: gapTimes.length > 0 ? Math.round(gapTimes.reduce((a, b) => a + b, 0) / gapTimes.length) : 0,
    },
    alerts
  };

  const stations = {};
  for (const [name, data] of Object.entries(stationMetrics)) {
    const avgPrep = data.prepTimes.length > 0
      ? Math.round(data.prepTimes.reduce((a, b) => a + b, 0) / data.prepTimes.length / 60)
      : 0;
    stations[name] = { catId: data.catId, itemsProcessed: data.total, avgPrepMin: avgPrep, samplesCount: data.prepTimes.length };
  }

  const kpMetrics = {
    avgSec: kpPrepTimes.length > 0 ? Math.round(kpPrepTimes.reduce((a, b) => a + b, 0) / kpPrepTimes.length) : 0,
    avgGapSec: gapTimes.length > 0 ? Math.round(gapTimes.reduce((a, b) => a + b, 0) / gapTimes.length) : 0,
    samples: kpPrepTimes.length,
    gapSamples: gapTimes.length
  };

  return new Response(JSON.stringify({ success: true, orders: result, stations, kpMetrics, todaySummary }), { headers });
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

  const CUTOFF_UTC = new Date('2026-03-08T12:30:00Z');
  if (fromUTC < CUTOFF_UTC) fromUTC = CUTOFF_UTC;

  const fromOdoo = fromUTC.toISOString().slice(0, 19).replace('T', ' ');
  const toOdoo = toUTC.toISOString().slice(0, 19).replace('T', ' ');

  const CONFIG_IDS = [5, 6, 10];
  const orders = await rpc(odooUrl, db, uid, apiKey, 'pos.order', 'search_read',
    [[['config_id', 'in', CONFIG_IDS], ['date_order', '>=', fromOdoo], ['date_order', '<=', toOdoo], ['state', 'in', ['paid', 'done', 'invoiced', 'posted']]]],
    { fields: ['id', 'name', 'date_order', 'amount_total', 'config_id', 'last_order_preparation_change', 'write_date'], limit: 500 });

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
      station: name, catId: d.catId, items: d.items, orders: d.orders.size,
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

    // For Captain paid orders, use earliest prep line create_date as effective start
    const oLines = prepLines.filter(l => l._posOrderId === order.id);
    let effectiveStartStats = orderDate;
    if (order.config_id?.[0] === 6 && oLines.length > 0) {
      for (const line of oLines) {
        const lc = parseOdooDate(line.create_date);
        if (lc && lc < effectiveStartStats) effectiveStartStats = lc;
      }
    }

    const istTime = new Date(effectiveStartStats.getTime() + 5.5 * 60 * 60 * 1000);
    const hourKey = istTime.getUTCHours().toString().padStart(2, '0');
    if (!hourlyData[hourKey]) hourlyData[hourKey] = { orders: 0, items: 0, totalPrepSec: 0, prepCount: 0 };
    hourlyData[hourKey].orders++;

    let lastDone = 0;
    let itemCount = 0;
    const BM_CAT_ID_STATS = 28;
    for (const line of oLines) {
      itemCount += line.quantity;
      const productId = line.product_id?.[0];
      const catInfo = productCatMap[productId] || { id: 0 };
      if (catInfo.id === BM_CAT_ID_STATS) continue; // Skip BM for order-level prep timing
      const states = statesByLine[line.id] || [];
      for (const s of states) {
        const t = parseOdooDate(s.last_stage_change);
        if (t && t.getTime() > lastDone) lastDone = t.getTime();
      }
    }
    hourlyData[hourKey].items += itemCount;

    if (lastDone > 0) {
      const totalSec = Math.round((lastDone - effectiveStartStats.getTime()) / 1000);
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
      const productName = formatProductName(line);
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

  // --- Summary with dine-in metrics ---
  const sortedPrepTimes = [...orderPrepTimes].sort((a, b) => a - b);

  const dineInTimes = [];
  const postPrepTimes = [];
  const BM_CAT_ID_DINE = 28;
  for (const order of orders) {
    // Captain POS (config 6) = always dine-in
    if (order.config_id?.[0] !== 6) continue;
    const orderDate = parseOdooDate(order.date_order);
    const settleDate = parseOdooDate(order.write_date);
    if (!orderDate || !settleDate) continue;

    // Use earliest prep line create_date for Captain orders
    const oLines = prepLines.filter(l => l._posOrderId === order.id);
    let effStart = orderDate;
    for (const line of oLines) {
      const lc = parseOdooDate(line.create_date);
      if (lc && lc < effStart) effStart = lc;
    }

    const dineSec = Math.round((settleDate - effStart) / 1000);
    if (dineSec > 60 && dineSec < 14400) dineInTimes.push(dineSec);
    // Find prep complete time (exclude BM items)
    let prepDone = null;
    for (const line of oLines) {
      const productId = line.product_id?.[0];
      const catInfo = productCatMap[productId] || { id: 0 };
      if (catInfo.id === BM_CAT_ID_DINE) continue; // Skip BM bulk-clear noise
      const states = statesByLine[line.id] || [];
      for (const s of states) {
        const t = parseOdooDate(s.last_stage_change);
        if (t && (!prepDone || t > prepDone)) prepDone = t;
      }
    }
    if (prepDone) {
      const postPrep = Math.round((settleDate - prepDone) / 1000);
      if (postPrep > 0 && postPrep < 14400) postPrepTimes.push(postPrep);
    }
  }

  const summary = {
    totalOrders: orders.length,
    avgOrderPrepSec: sortedPrepTimes.length > 0 ? Math.round(sortedPrepTimes.reduce((a, b) => a + b, 0) / sortedPrepTimes.length) : 0,
    medianOrderPrepSec: sortedPrepTimes.length > 0 ? sortedPrepTimes[Math.floor(sortedPrepTimes.length / 2)] : 0,
    p90OrderPrepSec: sortedPrepTimes.length > 0 ? sortedPrepTimes[Math.floor(sortedPrepTimes.length * 0.9)] : 0,
    counterOrders: orders.filter(o => o.config_id?.[0] === 5).length,
    captainOrders: orders.filter(o => o.config_id?.[0] === 6).length,
    wabaOrders: orders.filter(o => o.config_id?.[0] === 10).length,
    totalItems: prepLines.reduce((s, l) => s + l.quantity, 0),
    dineIn: {
      count: dineInTimes.length,
      avgDineTimeSec: dineInTimes.length > 0 ? Math.round(dineInTimes.reduce((a, b) => a + b, 0) / dineInTimes.length) : 0,
      avgPostPrepSec: postPrepTimes.length > 0 ? Math.round(postPrepTimes.reduce((a, b) => a + b, 0) / postPrepTimes.length) : 0,
    }
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
  // Build sorted list of stages with their info
  const withInfo = [];
  for (const s of stationStages) {
    const info = STAGE_INFO[s.stage_id?.[0]];
    if (info) withInfo.push({ todo: s.todo, seq: info.seq, name: info.name });
  }
  if (withInfo.length === 0) return 'To prepare';
  withInfo.sort((a, b) => a.seq - b.seq);
  // The current stage is the FIRST one still pending (todo=true)
  // If all stages are done (todo=false), return the last stage name
  for (const s of withInfo) {
    if (s.todo) return s.name;
  }
  return withInfo[withInfo.length - 1].name;
}

function getKPStatus(prepLines, statesByLine) {
  const KP_STAGE_IDS = new Set([75, 44, 74, 63]);
  // Find the minimum current KP stage across all lines
  // (i.e., the slowest item determines overall KP status)
  let minCurrentSeq = Infinity;
  let minCurrentName = null;
  let hasKPStates = false;

  for (const line of prepLines) {
    const states = statesByLine[line.id] || [];
    const kpStages = [];
    for (const s of states) {
      const sid = s.stage_id?.[0];
      if (!KP_STAGE_IDS.has(sid)) continue;
      const info = STAGE_INFO[sid];
      if (info) kpStages.push({ todo: s.todo, seq: info.seq, name: info.name });
    }
    if (kpStages.length === 0) continue;
    hasKPStates = true;
    kpStages.sort((a, b) => a.seq - b.seq);
    // Current stage = first todo=true, or last stage if all done
    let lineStage = kpStages[kpStages.length - 1];
    for (const s of kpStages) {
      if (s.todo) { lineStage = s; break; }
    }
    if (lineStage.seq < minCurrentSeq) {
      minCurrentSeq = lineStage.seq;
      minCurrentName = lineStage.name;
    }
  }
  if (!hasKPStates) return prepLines.length > 0 ? 'N/A' : 'Queued';
  return minCurrentName || 'Queued';
}

function computeItemTiming(createDate, stationStages) {
  const created = parseOdooDate(createDate);
  const elapsed = created ? Math.round((Date.now() - created.getTime()) / 1000) : 0;
  // Find the completion stage (Prepared/Ready/Packed) — highest seq done stage
  const withInfo = [];
  for (const s of stationStages) {
    const info = STAGE_INFO[s.stage_id?.[0]];
    if (info) withInfo.push({ todo: s.todo, seq: info.seq, name: info.name, time: s.last_stage_change });
  }
  withInfo.sort((a, b) => a.seq - b.seq);
  let prepDuration = 0;
  let doneTime = null;
  // Walk stages in order; the last completed "done" stage with a terminal name is the prep-done marker
  for (const s of withInfo) {
    if (!s.todo && ['Prepared', 'Ready', 'Packed'].includes(s.name)) {
      const t = parseOdooDate(s.time);
      if (t && created) {
        prepDuration = Math.round((t - created.getTime()) / 1000);
        doneTime = t;
      }
    }
  }
  return { elapsed, prepDuration, doneTime };
}

function computeKPTiming(allStates, stationDoneTime) {
  const KP_SEQ = { 75: 0, 44: 1, 74: 2, 63: 3 };
  const KP_NAMES = { 75: 'Preparing', 44: 'Ready', 74: 'Packed', 63: 'Completed' };

  const kpStates = [];
  for (const s of allStates) {
    const sid = s.stage_id?.[0];
    if (sid in KP_SEQ) {
      kpStates.push({
        seq: KP_SEQ[sid], name: KP_NAMES[sid],
        todo: s.todo, time: parseOdooDate(s.last_stage_change)
      });
    }
  }

  if (kpStates.length === 0) return { kpStage: null, kpSec: 0, gapSec: 0 };

  kpStates.sort((a, b) => a.seq - b.seq);

  // Current KP stage = first still pending, or last if all done
  let kpStage = kpStates[kpStates.length - 1].name;
  for (const s of kpStates) { if (s.todo) { kpStage = s.name; break; } }

  // Only completed (todo=false) stages have meaningful timestamps
  const done = kpStates.filter(s => !s.todo && s.time);
  if (done.length === 0) return { kpStage, kpSec: 0, gapSec: 0 };

  const kpStart = done[0].time;
  const kpEnd = done[done.length - 1].time;
  const kpSec = Math.round((kpEnd - kpStart) / 1000);
  const gapSec = stationDoneTime
    ? Math.max(0, Math.round((kpStart - stationDoneTime) / 1000))
    : 0;

  return { kpStage, kpSec, gapSec };
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

function formatProductName(line) {
  const base = cleanProductName(line.product_id?.[1] || 'Unknown');
  const attrs = line._attrNames || [];
  if (attrs.length > 0) return `${base} (${attrs.join(', ')})`;
  return base;
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
  return { totalOrders: 0, avgOrderPrepSec: 0, medianOrderPrepSec: 0, p90OrderPrepSec: 0, counterOrders: 0, captainOrders: 0, wabaOrders: 0, totalItems: 0, dineIn: { count: 0, avgDineTimeSec: 0, avgPostPrepSec: 0 } };
}

function emptyTodaySummary() {
  return { totalOrders: 0, dining: { activeTables: 0, tables: [], completedCount: 0, avgKitchenSec: 0, avgDineTimeSec: 0, avgPostPrepSec: 0 }, counter: { activeCount: 0, completedCount: 0, avgPrepSec: 0 }, alerts: [] };
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
