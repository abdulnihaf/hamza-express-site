export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(context.request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const ODOO_URL = 'https://test.hamzahotel.com/jsonrpc';
  const ODOO_DB = 'main';
  const ODOO_UID = 2;
  const ODOO_API_KEY = context.env.ODOO_API_KEY;
  const CONFIG_IDS = [5, 6]; // HE Cash Counter (5), HE Captain (6)

  // Timezone: input params are IST, Odoo stores UTC
  let fromUTC, toUTC;
  if (fromParam) {
    const parsed = new Date(fromParam);
    fromUTC = new Date(parsed.getTime() - 5.5 * 60 * 60 * 1000);
  } else {
    fromUTC = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }
  if (toParam) {
    const parsed = new Date(toParam);
    toUTC = new Date(parsed.getTime() - 5.5 * 60 * 60 * 1000);
  } else {
    toUTC = new Date();
  }

  const fromOdoo = fromUTC.toISOString().slice(0, 19).replace('T', ' ');
  const toOdoo = toUTC.toISOString().slice(0, 19).replace('T', ' ');
  // Return IST times as plain strings (no Z suffix) so browsers don't double-convert
  const fromISTStr = new Date(fromUTC.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const toISTStr = new Date(toUTC.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 19);

  try {
    // Phase 1: Orders + static reference data in parallel
    const [orders, categories, paymentMethods, products] = await Promise.all([
      rpc(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'pos.order', 'search_read',
        [[['config_id', 'in', CONFIG_IDS], ['date_order', '>=', fromOdoo], ['date_order', '<=', toOdoo], ['state', 'in', ['paid', 'done', 'invoiced', 'posted']]]],
        { fields: ['id', 'name', 'date_order', 'amount_total', 'config_id'] }),
      rpc(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'pos.category', 'search_read',
        [[]], { fields: ['id', 'name', 'parent_id'] }),
      rpc(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'pos.payment.method', 'search_read',
        [[['config_ids', 'in', CONFIG_IDS]]], { fields: ['id', 'name', 'type'] }),
      rpc(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'product.product', 'search_read',
        [[['available_in_pos', '=', true]]], { fields: ['id', 'name', 'pos_categ_ids'] })
    ]);

    const orderIds = orders.map(o => o.id);
    if (orderIds.length === 0) {
      return new Response(JSON.stringify({
        success: true, timestamp: new Date().toISOString(),
        query: { from: fromISTStr, to: toISTStr },
        data: emptyData()
      }), { headers: corsHeaders });
    }

    // Phase 2: Order lines + payments (need order IDs)
    const [lines, payments] = await Promise.all([
      rpc(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'pos.order.line', 'search_read',
        [[['order_id', 'in', orderIds]]],
        { fields: ['id', 'order_id', 'product_id', 'qty', 'price_subtotal_incl'] }),
      rpc(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'pos.payment', 'search_read',
        [[['pos_order_id', 'in', orderIds]]],
        { fields: ['id', 'pos_order_id', 'payment_method_id', 'amount'] })
    ]);

    const insights = processInsights(orders, lines, payments, categories, paymentMethods, products);
    return new Response(JSON.stringify({
      success: true, timestamp: new Date().toISOString(),
      query: { from: fromISTStr, to: toISTStr },
      data: insights
    }), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
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

function buildCategoryResolver(categories) {
  const byId = {};
  categories.forEach(c => { byId[c.id] = c; });
  return function topLevel(catId) {
    const cat = byId[catId];
    if (!cat) return 'Other';
    if (!cat.parent_id) return cat.name;
    return topLevel(cat.parent_id[0]);
  };
}

function buildProductCategoryMap(products, resolve) {
  const map = {};
  products.forEach(p => {
    const catId = p.pos_categ_ids && p.pos_categ_ids[0];
    map[p.id] = catId ? resolve(catId) : 'Other';
  });
  return map;
}

function classifyPaymentMethod(pm) {
  if (pm.type === 'cash') return 'Cash';
  if (pm.type === 'pay_later') return 'Complimentary';
  const lower = pm.name.toLowerCase();
  if (lower.includes('upi')) return 'UPI';
  if (lower.includes('card')) return 'Card';
  return 'Other';
}

function cleanProductName(name) {
  return name.replace(/^\[HE-\d+\]\s*/, '');
}

function processInsights(orders, lines, payments, categories, paymentMethods, products) {
  const resolve = buildCategoryResolver(categories);
  const productCatMap = buildProductCategoryMap(products, resolve);

  // Payment method ID → group name (Cash / UPI / Card / Complimentary)
  const pmGroupMap = {};
  paymentMethods.forEach(pm => { pmGroupMap[pm.id] = classifyPaymentMethod(pm); });

  const orderMap = {};
  orders.forEach(o => { orderMap[o.id] = o; });

  // --- Product & category aggregation ---
  const productData = {};
  const categoryTotals = {};
  let totalQty = 0;

  lines.forEach(line => {
    const pid = line.product_id ? line.product_id[0] : 0;
    const rawName = line.product_id ? line.product_id[1] : 'Unknown';
    const pname = cleanProductName(rawName);
    const category = productCatMap[pid] || 'Other';

    if (!productData[pid]) productData[pid] = { id: pid, name: pname, qty: 0, amount: 0, category };
    productData[pid].qty += line.qty;
    productData[pid].amount += line.price_subtotal_incl;
    totalQty += line.qty;

    if (!categoryTotals[category]) categoryTotals[category] = { name: category, amount: 0, qty: 0, products: 0 };
    categoryTotals[category].amount += line.price_subtotal_incl;
    categoryTotals[category].qty += line.qty;
  });

  Object.values(productData).forEach(p => {
    if (categoryTotals[p.category]) categoryTotals[p.category].products++;
  });

  // --- Order-level: channels + hourly ---
  let totalRevenue = 0;
  const channelSales = {
    cashCounter: { amount: 0, orders: 0 },
    captain: { amount: 0, orders: 0 }
  };
  const hourlyData = {};

  orders.forEach(order => {
    totalRevenue += order.amount_total;
    const configId = order.config_id ? order.config_id[0] : null;

    if (configId === 6) {
      channelSales.captain.amount += order.amount_total;
      channelSales.captain.orders++;
    } else {
      channelSales.cashCounter.amount += order.amount_total;
      channelSales.cashCounter.orders++;
    }

    const orderDate = order.date_order ? new Date(order.date_order.replace(' ', 'T') + 'Z') : null;
    const istTime = orderDate ? new Date(orderDate.getTime() + 5.5 * 60 * 60 * 1000) : null;
    const istHour = istTime ? istTime.getUTCHours() : 0;
    const hourKey = istHour.toString().padStart(2, '0');
    if (!hourlyData[hourKey]) hourlyData[hourKey] = { orders: 0, amount: 0 };
    hourlyData[hourKey].orders++;
    hourlyData[hourKey].amount += order.amount_total;
  });

  // --- Payment method aggregation ---
  // Covers ALL UPI methods (Counter UPI + Captain 01-05 UPI), Cash, Card, Complimentary
  const paymentTotals = {};
  let complimentaryTotal = 0;
  let complimentaryCount = 0;

  payments.forEach(p => {
    const methodId = p.payment_method_id ? p.payment_method_id[0] : 0;
    const group = pmGroupMap[methodId] || 'Other';
    if (!paymentTotals[group]) paymentTotals[group] = { name: group, amount: 0, count: 0 };
    paymentTotals[group].amount += p.amount;
    paymentTotals[group].count++;
    if (group === 'Complimentary') {
      complimentaryTotal += p.amount;
      complimentaryCount++;
    }
  });

  // --- Build outputs ---
  const productList = Object.values(productData).sort((a, b) => b.amount - a.amount);
  const topProducts = productList.slice(0, 10).map(p => ({
    id: p.id, name: p.name, qty: p.qty, amount: p.amount, category: p.category
  }));

  const hourlyArray = [];
  for (let h = 0; h <= 23; h++) {
    const key = h.toString().padStart(2, '0');
    hourlyArray.push({
      hour: h,
      label: h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? (h - 12) + ' PM' : h + ' AM',
      orders: hourlyData[key]?.orders || 0,
      amount: hourlyData[key]?.amount || 0
    });
  }

  const totalOrders = orders.length;
  const totalPaymentAmount = Object.values(paymentTotals).reduce((s, p) => s + p.amount, 0);

  return {
    summary: {
      totalRevenue,
      totalOrders,
      totalQty,
      avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      complimentary: { amount: complimentaryTotal, count: complimentaryCount }
    },
    topProducts,
    categories: Object.values(categoryTotals).sort((a, b) => b.amount - a.amount),
    products: productList,
    channels: {
      cashCounter: {
        ...channelSales.cashCounter,
        percentage: totalRevenue > 0 ? Math.round((channelSales.cashCounter.amount / totalRevenue) * 100) : 0
      },
      captain: {
        ...channelSales.captain,
        percentage: totalRevenue > 0 ? Math.round((channelSales.captain.amount / totalRevenue) * 100) : 0
      }
    },
    payments: Object.values(paymentTotals).sort((a, b) => b.amount - a.amount).map(p => ({
      ...p,
      percentage: totalPaymentAmount > 0 ? Math.round((p.amount / totalPaymentAmount) * 100) : 0
    })),
    hourly: hourlyArray
  };
}

function emptyData() {
  const hourlyArray = [];
  for (let h = 0; h <= 23; h++) {
    hourlyArray.push({
      hour: h,
      label: h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? (h - 12) + ' PM' : h + ' AM',
      orders: 0, amount: 0
    });
  }
  return {
    summary: { totalRevenue: 0, totalOrders: 0, totalQty: 0, avgOrderValue: 0, complimentary: { amount: 0, count: 0 } },
    topProducts: [], categories: [], products: [],
    channels: { cashCounter: { amount: 0, orders: 0, percentage: 0 }, captain: { amount: 0, orders: 0, percentage: 0 } },
    payments: [],
    hourly: hourlyArray
  };
}
