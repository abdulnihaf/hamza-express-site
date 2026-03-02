// HE Settlement System — Backend API
// Cloudflare Pages Function: /api/settlement?action=...

// ─── Configuration ───────────────────────────────────────────────────────────

const ODOO_URL = 'https://test.hamzahotel.com/jsonrpc';
const ODOO_DB = 'main';
const ODOO_UID = 2;

const PINS = {
  '5882': { name: 'Admin', role: 'staff' },
  '1001': { name: 'Staff 1', role: 'staff' },
  '1002': { name: 'Staff 2', role: 'staff' },
  '0305': { name: 'Nihaf', role: 'collector' },
  '3754': { name: 'Naveen', role: 'collector' },
};

const COLLECTORS = ['Nihaf', 'Naveen'];

// Settlement points: counter + 3 captains
const POINTS = {
  counter: {
    id: 'counter', name: 'Cash Counter', configId: 5,
    cashPM: 11,   // HE - Cash Counter
    upiPM: 14,    // HE - UPI Counter
    cardPM: 12,   // HE - Card (shared)
    compPM: 57,   // HE Complimentary (shared)
    razorpayQR: 'qr_SFifkGfaapvPPX',
  },
  captain_1: {
    id: 'captain_1', name: 'Captain 1', configId: 6,
    cashPM: 19,   // HE - Cash Captain (shared across captains)
    upiPM: 52,    // HE Captain 01 UPI
    cardPM: 12,
    compPM: 57,
    razorpayQR: 'qr_SL2rAHSeQnXo4V',
  },
  captain_2: {
    id: 'captain_2', name: 'Captain 2', configId: 6,
    cashPM: 19,
    upiPM: 53,    // HE Captain 02 UPI
    cardPM: 12,
    compPM: 57,
    razorpayQR: 'qr_SL2rKjxXhp4T5s',
  },
  captain_3: {
    id: 'captain_3', name: 'Captain 3', configId: 6,
    cashPM: 19,
    upiPM: 54,    // HE Captain 03 UPI
    cardPM: 12,
    compPM: 57,
    razorpayQR: 'qr_SFifqWG1QRnmoj',
  },
};

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');

  try {
    const env = context.env;
    let result;

    switch (action) {
      case 'verify-pin':
        result = verifyPin(url.searchParams.get('pin'));
        break;
      case 'point-summary':
        result = await getPointSummary(env, url.searchParams.get('point'));
        break;
      case 'settle':
        result = await settle(env, await context.request.json());
        break;
      case 'record-expense':
        result = await recordExpense(env, await context.request.json());
        break;
      case 'counter-balance':
        result = await getCounterBalance(env);
        break;
      case 'collect':
        result = await collectCash(env, await context.request.json());
        break;
      case 'history':
        result = await getHistory(env, url.searchParams.get('limit') || 20);
        break;
      case 'expense-history':
        result = await getExpenseHistory(env, url.searchParams.get('limit') || 20);
        break;
      case 'collection-history':
        result = await getCollectionHistory(env, url.searchParams.get('limit') || 10);
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return new Response(JSON.stringify(result), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
}

// ─── PIN Verification ────────────────────────────────────────────────────────

function verifyPin(pin) {
  const user = PINS[pin];
  if (!user) return { success: false, error: 'Invalid PIN' };
  return {
    success: true,
    user: user.name,
    role: user.role,
    isCollector: COLLECTORS.includes(user.name),
  };
}

// ─── Point Summary (Odoo + Razorpay) ────────────────────────────────────────

async function getPointSummary(env, pointId) {
  const point = POINTS[pointId];
  if (!point) return { success: false, error: 'Unknown point: ' + pointId };

  // Get last settlement for this point
  const lastStl = await env.DB.prepare(
    'SELECT settled_at FROM settlements WHERE point = ? ORDER BY settled_at DESC LIMIT 1'
  ).bind(pointId).first();

  const since = lastStl ? lastStl.settled_at : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // IST display times
  const sinceIST = toIST(since);
  const nowIST = toIST(now);

  // Convert to Odoo UTC format
  const sinceOdoo = toOdooUTC(since);
  const nowOdoo = toOdooUTC(now);

  // Fetch Odoo payments + Razorpay in parallel
  const [odooData, razorpayUPI] = await Promise.all([
    fetchOdooPayments(env, point, sinceOdoo, nowOdoo),
    fetchRazorpayQR(env, point.razorpayQR, since),
  ]);

  // For captains: cash is shared PM 19, we return total captain cash (not per-captain)
  // The variance tracking happens at counter level for cash
  const cashExpected = pointId === 'counter' ? odooData.cash : 0;

  return {
    success: true,
    point: pointId,
    pointName: point.name,
    period: { from: sinceIST, to: nowIST, fromRaw: since },
    odoo: {
      cash: odooData.cash,
      upi: odooData.upi,
      card: odooData.card,
      comp: odooData.comp,
      total: odooData.total,
      orderCount: odooData.orderCount,
    },
    razorpay: { upi: razorpayUPI },
    upiVariance: Math.round((razorpayUPI - odooData.upi) * 100) / 100,
    cashExpected,
    lastSettlement: lastStl ? lastStl.settled_at : null,
  };
}

async function fetchOdooPayments(env, point, since, until) {
  const apiKey = env.ODOO_API_KEY;

  // Get order IDs for this config in the period
  const orderIds = await rpc(ODOO_URL, ODOO_DB, ODOO_UID, apiKey, 'pos.order', 'search',
    [[['config_id', '=', point.configId], ['date_order', '>=', since], ['date_order', '<=', until],
      ['state', 'in', ['paid', 'done', 'invoiced', 'posted']]]]);

  if (!orderIds.length) return { cash: 0, upi: 0, card: 0, comp: 0, total: 0, orderCount: 0 };

  // Get payments for those orders
  const payments = await rpc(ODOO_URL, ODOO_DB, ODOO_UID, apiKey, 'pos.payment', 'search_read',
    [[['pos_order_id', 'in', orderIds]]],
    { fields: ['payment_method_id', 'amount'] });

  let cash = 0, upi = 0, card = 0, comp = 0, total = 0;
  for (const p of payments) {
    const pmId = p.payment_method_id ? p.payment_method_id[0] : 0;
    const amt = p.amount || 0;
    total += amt;

    if (pmId === point.cashPM) cash += amt;
    else if (pmId === point.upiPM) upi += amt;
    else if (pmId === point.cardPM) card += amt;
    else if (pmId === point.compPM) comp += amt;
  }

  return {
    cash: Math.round(cash * 100) / 100,
    upi: Math.round(upi * 100) / 100,
    card: Math.round(card * 100) / 100,
    comp: Math.round(comp * 100) / 100,
    total: Math.round(total * 100) / 100,
    orderCount: orderIds.length,
  };
}

async function fetchRazorpayQR(env, qrId, since) {
  if (!qrId || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return 0;

  try {
    const auth = btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET);
    const sinceEpoch = Math.floor(new Date(since).getTime() / 1000);

    const res = await fetch(
      `https://api.razorpay.com/v1/payments/qr_codes/${qrId}/payments?from=${sinceEpoch}&count=100`,
      { headers: { Authorization: 'Basic ' + auth } }
    );
    const data = await res.json();
    if (!data.items) return 0;

    let total = 0;
    for (const p of data.items) {
      if (p.status === 'captured') total += p.amount;
    }
    return Math.round(total) / 100; // paisa → rupees
  } catch {
    return 0;
  }
}

// ─── Settlement ──────────────────────────────────────────────────────────────

async function settle(env, body) {
  const pin = PINS[body.pin];
  if (!pin) return { success: false, error: 'Invalid PIN' };

  const point = POINTS[body.point];
  if (!point) return { success: false, error: 'Unknown point' };

  const now = new Date().toISOString();
  const cashVariance = (body.cash_collected || 0) - (body.cash_expected || 0);
  const upiVariance = (body.upi_razorpay || 0) - (body.upi_odoo || 0);

  await env.DB.prepare(`
    INSERT INTO settlements (point, point_name, settled_by, settled_at, period_start, period_end,
      cash_expected, cash_collected, cash_variance, upi_odoo, upi_razorpay, upi_variance,
      card_amount, comp_amount, total_sales, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.point, point.name, pin.name, now, body.period_start || now, body.period_end || now,
    body.cash_expected || 0, body.cash_collected || 0, Math.round(cashVariance * 100) / 100,
    body.upi_odoo || 0, body.upi_razorpay || 0, Math.round(upiVariance * 100) / 100,
    body.card_amount || 0, body.comp_amount || 0, body.total_sales || 0,
    body.notes || ''
  ).run();

  return {
    success: true,
    message: `${point.name} settled — Cash: ₹${body.cash_collected || 0}, Variance: ₹${Math.round(cashVariance)}`,
  };
}

// ─── Expenses ────────────────────────────────────────────────────────────────

async function recordExpense(env, body) {
  const pin = PINS[body.pin];
  if (!pin) return { success: false, error: 'Invalid PIN' };
  if (!body.amount || !body.reason) return { success: false, error: 'Amount and reason required' };

  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO counter_expenses (recorded_by, recorded_at, amount, reason, notes) VALUES (?, ?, ?, ?, ?)'
  ).bind(pin.name, now, body.amount, body.reason.trim(), body.notes || '').run();

  return { success: true, message: `Expense recorded: ₹${body.amount} for ${body.reason}` };
}

async function getExpenseHistory(env, limit) {
  const rows = await env.DB.prepare(
    'SELECT * FROM counter_expenses ORDER BY recorded_at DESC LIMIT ?'
  ).bind(Number(limit)).all();
  return { success: true, expenses: rows.results || [] };
}

// ─── Counter Balance ─────────────────────────────────────────────────────────

async function getCounterBalance(env) {
  // Last collection determines period start
  const lastCol = await env.DB.prepare(
    'SELECT collected_at, petty_cash FROM cash_collections ORDER BY collected_at DESC LIMIT 1'
  ).first();

  const since = lastCol ? lastCol.collected_at : '2020-01-01T00:00:00.000Z';
  const pettyCash = lastCol ? lastCol.petty_cash : 0;

  // All settlements since last collection
  const settlements = await env.DB.prepare(
    'SELECT * FROM settlements WHERE settled_at > ? ORDER BY settled_at ASC'
  ).bind(since).all();

  // All expenses since last collection
  const expenses = await env.DB.prepare(
    'SELECT * FROM counter_expenses WHERE recorded_at > ? ORDER BY recorded_at ASC'
  ).bind(since).all();

  let totalSettledCash = 0;
  const stlList = settlements.results || [];
  for (const s of stlList) {
    totalSettledCash += s.cash_collected || 0;
  }

  let totalExpenses = 0;
  const expList = expenses.results || [];
  for (const e of expList) {
    totalExpenses += e.amount || 0;
  }

  const expected = pettyCash + totalSettledCash - totalExpenses;

  return {
    success: true,
    balance: {
      pettyCash: Math.round(pettyCash * 100) / 100,
      totalSettledCash: Math.round(totalSettledCash * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      expected: Math.round(expected * 100) / 100,
      settlementCount: stlList.length,
      expenseCount: expList.length,
    },
    settlements: stlList,
    expenses: expList,
    since,
    lastCollection: lastCol || null,
  };
}

// ─── Cash Collection ─────────────────────────────────────────────────────────

async function collectCash(env, body) {
  const pin = PINS[body.pin];
  if (!pin) return { success: false, error: 'Invalid PIN' };
  if (!COLLECTORS.includes(pin.name)) return { success: false, error: 'Not authorized to collect cash' };

  // Get current balance
  const bal = await getCounterBalance(env);
  const expected = bal.balance.expected;
  const discrepancy = Math.round((expected - (body.amount + body.petty_cash)) * 100) / 100;

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO cash_collections (collected_by, collected_at, amount, petty_cash, expenses, expected,
      discrepancy, period_start, period_end, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pin.name, now, body.amount, body.petty_cash || 0, bal.balance.totalExpenses,
    expected, discrepancy, bal.since, now, body.notes || ''
  ).run();

  return {
    success: true,
    message: `Collection recorded — ₹${body.amount} taken, ₹${body.petty_cash || 0} petty left`,
    collected: body.amount,
    petty_cash: body.petty_cash || 0,
    expected,
    discrepancy,
  };
}

// ─── History ─────────────────────────────────────────────────────────────────

async function getHistory(env, limit) {
  const rows = await env.DB.prepare(
    'SELECT * FROM settlements ORDER BY settled_at DESC LIMIT ?'
  ).bind(Number(limit)).all();
  return { success: true, settlements: rows.results || [] };
}

async function getCollectionHistory(env, limit) {
  const rows = await env.DB.prepare(
    'SELECT * FROM cash_collections ORDER BY collected_at DESC LIMIT ?'
  ).bind(Number(limit)).all();
  return { success: true, collections: rows.results || [] };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function rpc(url, db, uid, apiKey, model, method, args, kwargs = {}) {
  const payload = {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: { service: 'object', method: 'execute_kw', args: [db, uid, apiKey, model, method, args, kwargs] },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Odoo RPC error');
  return data.result || [];
}

function toIST(isoStr) {
  const d = new Date(isoStr);
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString();
}

function toOdooUTC(isoStr) {
  return isoStr.slice(0, 19).replace('T', ' ');
}
