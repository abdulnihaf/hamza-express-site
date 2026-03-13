// HE Settlement System — Backend API
// Cloudflare Pages Function: /api/settlement?action=...

// ─── Configuration ───────────────────────────────────────────────────────────

const ODOO_URL = 'https://test.hamzahotel.com/jsonrpc';
const ODOO_DB = 'main';
const ODOO_UID = 2;

// Paytm configuration
const PAYTM_MID = 'ZPrZuI15432995875112';
const PAYTM_BASE_URL = 'https://securegw.paytm.in';

const PINS = {
  '5882': { name: 'Admin', role: 'staff' },
  '1001': { name: 'Staff 1', role: 'staff' },
  '1002': { name: 'Staff 2', role: 'staff' },
  '0305': { name: 'Nihaf', role: 'collector' },
  '3754': { name: 'Naveen', role: 'collector' },
};

const COLLECTORS = ['Nihaf', 'Naveen'];

// UPI provider: 'paytm' or 'razorpay' — switch here when Paytm QRs are ready
const UPI_PROVIDER = 'razorpay';

// Settlement points: counter + 5 captains
const POINTS = {
  counter: {
    id: 'counter', name: 'Cash Counter', configId: 5,
    cashPM: 11,   // HE - Cash Counter
    upiPM: 14,    // HE - UPI Counter (Razorpay) — will switch to 59 (Paytm)
    paytmUpiPM: 59, // Paytm UPI Counter
    cardPM: 12,   // HE - Card (shared)
    compPM: 57,   // HE Complimentary (shared)
    razorpayQR: 'qr_SFifkGfaapvPPX',
    paytmPosId: 'HE_COUNTER_UPI',     // Paytm posId — QR created with this
    paytmQrCodeId: null,               // Set after creating Paytm QR
  },
  captain_1: {
    id: 'captain_1', name: 'Captain 01', configId: 6,
    cashPM: 19,   // HE - Cash Captain (shared across captains)
    upiPM: 52,    // HE - UPI Captain (shared across captains on config 6)
    paytmUpiPM: 60,
    cardPM: 12,
    compPM: 57,
    razorpayQR: 'qr_SFifm0HAq1e7GQ',  // HE-CAP-01
    paytmPosId: 'HE_CAPTAIN_01_UPI',
    paytmQrCodeId: null,
  },
  captain_2: {
    id: 'captain_2', name: 'Captain 02', configId: 6,
    cashPM: 19,
    upiPM: 52,
    paytmUpiPM: 61,
    cardPM: 12,
    compPM: 57,
    razorpayQR: 'qr_SFifoDVOZG3MrI',  // HE-CAP-02
    paytmPosId: 'HE_CAPTAIN_02_UPI',
    paytmQrCodeId: null,
  },
  captain_3: {
    id: 'captain_3', name: 'Captain 03', configId: 6,
    cashPM: 19,
    upiPM: 52,
    paytmUpiPM: 62,
    cardPM: 12,
    compPM: 57,
    razorpayQR: 'qr_SFifqWG1QRnmoj',  // HE-CAP-03
    paytmPosId: 'HE_CAPTAIN_03_UPI',
    paytmQrCodeId: null,
  },
  captain_4: {
    id: 'captain_4', name: 'Captain 04', configId: 6,
    cashPM: 19,
    upiPM: 52,
    paytmUpiPM: null,
    cardPM: 12,
    compPM: 57,
    razorpayQR: 'qr_SFifsQfqULs6bb',  // HE-CAP-04
    paytmPosId: null,
    paytmQrCodeId: null,
  },
  captain_5: {
    id: 'captain_5', name: 'Captain 05', configId: 6,
    cashPM: 19,
    upiPM: 52,
    paytmUpiPM: null,
    cardPM: 12,
    compPM: 57,
    razorpayQR: 'qr_SFifuWXskdwKNF',  // HE-CAP-05
    paytmPosId: null,
    paytmQrCodeId: null,
  },
};

// Captain settlement — employee-based tracking (mirrors NCH runner settlement)
// Employee IDs on test.hamzahotel.com (production default)
const CAPTAINS = {
  captain_1: { id: 'captain_1', name: 'Captain 01', employeeId: 69, upiPM: 52, razorpayQR: 'qr_SFifm0HAq1e7GQ' },
  captain_2: { id: 'captain_2', name: 'Captain 02', employeeId: 70, upiPM: 52, razorpayQR: 'qr_SFifoDVOZG3MrI' },
  captain_3: { id: 'captain_3', name: 'Captain 03', employeeId: null, upiPM: 52, razorpayQR: 'qr_SFifqWG1QRnmoj' },
  captain_4: { id: 'captain_4', name: 'Captain 04', employeeId: null, upiPM: 52, razorpayQR: 'qr_SFifsQfqULs6bb' },
  captain_5: { id: 'captain_5', name: 'Captain 05', employeeId: null, upiPM: 52, razorpayQR: 'qr_SFifuWXskdwKNF' },
};

// Per-env employee ID overrides (nihaf/ops have different auto-increment IDs)
const ENV_EMPLOYEE_IDS = {
  nihaf: { captain_1: 69, captain_2: 70, captain_3: 71, captain_4: 72, captain_5: 73 },
};

function getCaptainEmployeeId(captainId, envParam) {
  return ENV_EMPLOYEE_IDS[envParam]?.[captainId] ?? CAPTAINS[captainId]?.employeeId;
}

// Captain PINs for captain live dashboard (maps PIN → specific captain)
const CAPTAIN_PINS = {
  '2101': { captain_id: 'captain_1', name: 'Captain 01' },
  '2102': { captain_id: 'captain_2', name: 'Captain 02' },
  '2103': { captain_id: 'captain_3', name: 'Captain 03' },
  '2104': { captain_id: 'captain_4', name: 'Captain 04' },
  '2105': { captain_id: 'captain_5', name: 'Captain 05' },
};

const CAPTAIN_CONFIG_ID = 6;
const CAPTAIN_CASH_PM = 19;
const CAPTAIN_CARD_PM = 12;
const CAPTAIN_COMP_PM = 57;

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
        result = await getHistory(env, url.searchParams.get('limit') || 20, url.searchParams.get('point'));
        break;
      case 'expense-history':
        result = await getExpenseHistory(env, url.searchParams.get('limit') || 20);
        break;
      case 'collection-history':
        result = await getCollectionHistory(env, url.searchParams.get('limit') || 10);
        break;
      case 'captain-verify-pin':
        result = verifyCaptainPin(url.searchParams.get('pin'));
        break;
      case 'captain-live':
        result = await getCaptainLive(env, url.searchParams.get('captain_id'), url.searchParams.get('env'));
        break;
      case 'captain-get-last-settlement':
        result = await getCaptainLastSettlement(env, url.searchParams.get('captain_id'));
        break;
      case 'captain-settle':
        result = await captainSettle(env, await context.request.json());
        break;
      case 'captain-shift-settle':
        result = await captainShiftSettle(env, await context.request.json());
        break;
      case 'captain-shift-history':
        result = await getCaptainShiftHistory(env, url.searchParams.get('limit') || 20);
        break;
      case 'captain-performance':
        result = await getCaptainPerformance(env, url.searchParams);
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

// ─── Point Summary (Odoo + UPI Provider) ────────────────────────────────────

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

  // Fetch Odoo payments + UPI provider verification in parallel
  const [odooData, providerUPI] = await Promise.all([
    fetchOdooPayments(env, point, sinceOdoo, nowOdoo),
    UPI_PROVIDER === 'paytm'
      ? fetchPaytmPayments(env, point, since)
      : fetchRazorpayQR(env, point.razorpayQR, since),
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
    upiProvider: UPI_PROVIDER,
    providerUPI: providerUPI,
    // Backward compatible — keep razorpay key for existing frontend
    razorpay: { upi: providerUPI },
    upiVariance: Math.round((providerUPI - odooData.upi) * 100) / 100,
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

// ─── Paytm UPI Verification ─────────────────────────────────────────────────

async function fetchPaytmPayments(env, point, since) {
  const merchantKey = env.PAYTM_MERCHANT_KEY;
  if (!merchantKey || !point.paytmQrCodeId) return 0;

  try {
    // Paytm doesn't have a direct "list payments by QR" API like Razorpay.
    // Instead, we query transaction status for known order IDs created via Dynamic QR.
    // For static QR (All-in-One), we use the Paytm dashboard/reports API.
    //
    // Approach: Query Odoo for Paytm UPI payment method totals directly.
    // The Paytm settlement amount from the bank statement acts as the source of truth.
    // For real-time verification, use the Paytm Transaction Status API per order.

    const orderId = `QR_${point.paytmPosId}_CHECK`;
    const body = { mid: PAYTM_MID, orderId: orderId };
    const signature = await generatePaytmSignature(JSON.stringify(body), merchantKey);

    const res = await fetch(`${PAYTM_BASE_URL}/merchant-status/api/v1/getPaymentStatus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: body,
        head: { signature: signature, version: 'v1' },
      }),
    });

    const data = await res.json();
    // For now, return 0 — Paytm static QR doesn't support per-QR payment listing
    // Settlement verification will rely on Odoo POS totals vs bank statement
    return 0;
  } catch {
    return 0;
  }
}

// Paytm checksum: SHA256 + AES-128-CBC (compatible with Cloudflare Workers crypto)
async function generatePaytmSignature(body, key) {
  const iv = '@@@@&&&&####$$$$';
  const keyBytes = new TextEncoder().encode(key);
  const ivBytes = new TextEncoder().encode(iv);

  // Generate 4-byte random salt
  const saltBytes = crypto.getRandomValues(new Uint8Array(4));
  const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 4);

  // SHA-256 hash of body|salt
  const hashInput = new TextEncoder().encode(body + '|' + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', hashInput);
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashWithSalt = hashHex + salt;

  // AES-128-CBC encrypt
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const plainBytes = new TextEncoder().encode(hashWithSalt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: ivBytes }, cryptoKey, plainBytes);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
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

async function getHistory(env, limit, point) {
  let rows;
  if (point) {
    rows = await env.DB.prepare(
      'SELECT * FROM settlements WHERE point = ? ORDER BY settled_at DESC LIMIT ?'
    ).bind(point, Number(limit)).all();
  } else {
    rows = await env.DB.prepare(
      'SELECT * FROM settlements ORDER BY settled_at DESC LIMIT ?'
    ).bind(Number(limit)).all();
  }
  return { success: true, settlements: rows.results || [] };
}

async function getCollectionHistory(env, limit) {
  const rows = await env.DB.prepare(
    'SELECT * FROM cash_collections ORDER BY collected_at DESC LIMIT ?'
  ).bind(Number(limit)).all();
  return { success: true, collections: rows.results || [] };
}

// ─── Captain Settlement Functions ────────────────────────────────────────────

function verifyCaptainPin(pin) {
  const captain = CAPTAIN_PINS[pin];
  if (!captain) return { success: false, error: 'Invalid PIN' };
  const cap = CAPTAINS[captain.captain_id];
  return { success: true, captain_id: captain.captain_id, name: captain.name, employeeId: cap.employeeId };
}

async function getCaptainLastSettlement(env, captainId) {
  const captain = CAPTAINS[captainId];
  if (!captain) return { success: false, error: 'Invalid captain' };

  const result = await env.DB.prepare(
    'SELECT * FROM settlements WHERE point = ? ORDER BY settled_at DESC LIMIT 1'
  ).bind(captainId).first();

  const baseline = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const periodStart = result ? result.settled_at : baseline;

  return {
    success: true,
    lastSettlement: result || null,
    periodStart,
  };
}

async function getCaptainLive(env, captainId, envParam) {
  const captain = CAPTAINS[captainId];
  if (!captain) return { success: false, error: 'Invalid captain' };

  // Resolve Odoo URL + employee ID based on env param
  const ENV_ODOO_MAP = { 'nihaf': 'https://nihaf.hamzahotel.com/jsonrpc' };
  const odooUrl = ENV_ODOO_MAP[envParam] || ODOO_URL;
  const employeeId = getCaptainEmployeeId(captainId, envParam);

  const apiKey = env.ODOO_API_KEY;

  // 1. Get period start from last settlement
  const baseline = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let periodStart = baseline;
  let lastSettlement = null;
  const lastStl = await env.DB.prepare(
    'SELECT * FROM settlements WHERE point = ? ORDER BY settled_at DESC LIMIT 1'
  ).bind(captainId).first();
  if (lastStl) {
    periodStart = lastStl.settled_at;
    lastSettlement = lastStl;
  }

  // 2. Convert to Odoo UTC format and Razorpay unix
  const periodDate = new Date(periodStart);
  const fromOdoo = periodStart.replace('T', ' ').slice(0, 19);
  const fromUnix = Math.floor(periodDate.getTime() / 1000);
  const toUnix = Math.floor(Date.now() / 1000);

  // 3. Fetch Odoo orders + Razorpay QR in parallel
  const auth = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
    ? btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET) : null;

  const [orders, razorpayPayments] = await Promise.all([
    // Odoo: orders for this captain (by employee_id) since period start
    (async () => {
      if (!apiKey) return [];
      try {
        return await rpc(odooUrl, ODOO_DB, ODOO_UID, apiKey, 'pos.order', 'search_read',
          [[['config_id', '=', CAPTAIN_CONFIG_ID],
            ['employee_id', '=', employeeId],
            ['date_order', '>=', fromOdoo],
            ['state', 'in', ['paid', 'done', 'invoiced', 'posted']]]],
          { fields: ['id', 'name', 'date_order', 'amount_total', 'payment_ids'], order: 'date_order desc' });
      } catch (e) { console.error('Captain-live Odoo error:', e.message); return []; }
    })(),
    // Razorpay: this captain's QR payments
    (async () => {
      if (!auth || !captain.razorpayQR) return [];
      try {
        return await fetchRazorpayQRPayments(auth, captain.razorpayQR, fromUnix, toUnix);
      } catch (e) { console.error('Captain-live Razorpay error:', e.message); return []; }
    })(),
  ]);

  // 4. Fetch payment methods to decompose cash/UPI/card/comp
  let cash = 0, upi = 0, card = 0, comp = 0;
  if (orders.length > 0 && apiKey) {
    try {
      const paymentIds = orders.flatMap(o => o.payment_ids || []);
      if (paymentIds.length > 0) {
        const payments = await rpc(odooUrl, ODOO_DB, ODOO_UID, apiKey, 'pos.payment', 'search_read',
          [[['id', 'in', paymentIds]]],
          { fields: ['amount', 'payment_method_id'] });
        for (const p of payments) {
          const pmId = p.payment_method_id ? p.payment_method_id[0] : 0;
          const amt = p.amount || 0;
          if (pmId === CAPTAIN_CASH_PM) cash += amt;
          else if (pmId === captain.upiPM) upi += amt;
          else if (pmId === CAPTAIN_CARD_PM) card += amt;
          else if (pmId === CAPTAIN_COMP_PM) comp += amt;
        }
      }
    } catch (e) { console.error('Captain-live payments error:', e.message); }
  }

  // 5. Fetch order lines for product breakdown
  let productBreakdown = [];
  if (orders.length > 0 && apiKey) {
    try {
      const orderIds = orders.map(o => o.id);
      const lines = await rpc(odooUrl, ODOO_DB, ODOO_UID, apiKey, 'pos.order.line', 'search_read',
        [[['order_id', 'in', orderIds]]],
        { fields: ['order_id', 'product_id', 'qty', 'price_subtotal_incl'] });

      const productAgg = {};
      for (const line of lines) {
        const pid = line.product_id[0];
        const pname = line.product_id[1] || `Product ${pid}`;
        if (!productAgg[pid]) productAgg[pid] = { product_id: pid, name: pname, qty: 0, amount: 0 };
        productAgg[pid].qty += Math.round(line.qty);
        productAgg[pid].amount += line.price_subtotal_incl;
      }
      productBreakdown = Object.values(productAgg).filter(p => p.qty > 0).sort((a, b) => b.amount - a.amount);
    } catch (e) { console.error('Captain-live lines error:', e.message); }
  }

  // 6. Build order details with per-order item breakdown
  let orderDetails = [];
  if (orders.length > 0 && apiKey) {
    try {
      const orderIds = orders.map(o => o.id);
      const lines = await rpc(odooUrl, ODOO_DB, ODOO_UID, apiKey, 'pos.order.line', 'search_read',
        [[['order_id', 'in', orderIds]]],
        { fields: ['order_id', 'product_id', 'qty', 'price_subtotal_incl'] });

      const linesByOrder = {};
      for (const line of lines) {
        const oid = line.order_id[0];
        if (!linesByOrder[oid]) linesByOrder[oid] = [];
        linesByOrder[oid].push({ name: line.product_id[1] || 'Item', qty: Math.round(line.qty), amount: line.price_subtotal_incl });
      }
      orderDetails = orders.map(o => ({
        id: o.id, name: o.name, amount: o.amount_total, time: o.date_order,
        items: linesByOrder[o.id] || [],
      }));
    } catch (e) { console.error('Captain-live order details error:', e.message); }
  }

  // 7. Calculate totals
  const ordersTotal = orders.reduce((sum, o) => sum + o.amount_total, 0);
  const upiFromQR = razorpayPayments.reduce((sum, p) => sum + (p.amount / 100), 0);
  const cashInHand = ordersTotal - upiFromQR - card - comp;

  // 8. Format UPI payments
  const upiPayments = razorpayPayments.map(p => ({
    id: p.id,
    amount: p.amount / 100,
    time: new Date(p.created_at * 1000).toISOString(),
    vpa: p.vpa || p.email || '',
    method: p.method || 'upi',
  })).sort((a, b) => new Date(b.time) - new Date(a.time));

  // 9. Format period for display
  const periodIST = new Date(periodDate.getTime() + 5.5 * 60 * 60 * 1000);
  const periodFormatted = periodIST.toLocaleString('en-IN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC',
  });

  return {
    success: true,
    captain: { id: captainId, name: captain.name, employeeId: captain.employeeId },
    period: { start: periodStart, startFormatted: periodFormatted, now: new Date().toISOString() },
    orders: { count: orders.length, total: Math.round(ordersTotal * 100) / 100 },
    productBreakdown,
    orderDetails,
    upi: { total: Math.round(upiFromQR * 100) / 100, count: upiPayments.length, payments: upiPayments },
    card: Math.round(card * 100) / 100,
    comp: Math.round(comp * 100) / 100,
    cashInHand: Math.round(cashInHand * 100) / 100,
    lastSettlement,
  };
}

async function captainSettle(env, body) {
  const pin = PINS[body.pin];
  if (!pin) return { success: false, error: 'Invalid PIN' };

  const captain = CAPTAINS[body.captain_id];
  if (!captain) return { success: false, error: 'Invalid captain' };

  // Duplicate prevention: 5-minute window
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare(
    'SELECT id FROM settlements WHERE point = ? AND settled_by = ? AND settled_at > ? LIMIT 1'
  ).bind(body.captain_id, pin.name, fiveMinAgo).first();
  if (recent) return { success: false, error: 'Duplicate — already settled within 5 minutes' };

  const now = new Date().toISOString();
  const cashExpected = (body.orders_total || 0) - (body.upi_amount || 0) - (body.card_amount || 0) - (body.comp_amount || 0);
  const cashVariance = (body.cash_collected || 0) - cashExpected;

  await env.DB.prepare(`
    INSERT INTO settlements (point, point_name, settled_by, settled_at, period_start, period_end,
      cash_expected, cash_collected, cash_variance, upi_odoo, upi_razorpay, upi_variance,
      card_amount, comp_amount, total_sales, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.captain_id, captain.name, pin.name, now,
    body.period_start || now, body.period_end || now,
    Math.round(cashExpected * 100) / 100, body.cash_collected || 0,
    Math.round(cashVariance * 100) / 100,
    body.upi_odoo || 0, body.upi_razorpay || 0,
    Math.round(((body.upi_razorpay || 0) - (body.upi_odoo || 0)) * 100) / 100,
    body.card_amount || 0, body.comp_amount || 0, body.orders_total || 0,
    body.notes || ''
  ).run();

  return {
    success: true,
    message: `${captain.name} settled — Cash: ₹${body.cash_collected || 0}, Variance: ₹${Math.round(cashVariance)}`,
  };
}

async function captainShiftSettle(env, body) {
  const { settled_by, period_start, period_end, counter, captain_checkpoints,
    reconciliation, counter_balance, drawer_cash_entered, handover_to } = body;

  // Validate settled_by
  const validUsers = Object.values(PINS).map(p => p.name);
  if (!settled_by || !validUsers.includes(settled_by)) {
    return { success: false, error: 'Invalid user' };
  }

  const settledAt = new Date().toISOString();
  const cb = counter_balance || {};

  // 1. Insert parent cashier_shifts record
  const shiftResult = await env.DB.prepare(`
    INSERT INTO cashier_shifts (
      cashier_name, settled_at, period_start, period_end,
      petty_cash_start, counter_cash_settled, captain_cash_settled,
      expenses_total, expected_drawer, drawer_cash_entered, drawer_variance,
      counter_cash_expected, counter_cash_entered, counter_cash_variance,
      counter_upi, counter_card, counter_comp,
      counter_qr_odoo, counter_qr_razorpay, counter_qr_variance,
      total_cash_physical, total_cash_expected, final_variance,
      variance_resolved, variance_unresolved,
      discrepancy_resolutions, captain_count, notes, handover_to
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    settled_by, settledAt, period_start, period_end,
    cb.petty_cash_start || 0, cb.counter_cash_settled || 0, cb.captain_cash_settled || 0,
    cb.expenses_total || 0, cb.expected_drawer || 0,
    drawer_cash_entered || 0, (drawer_cash_entered || 0) - (cb.expected_drawer || 0),
    counter?.cash_expected || 0, counter?.cash_entered || 0,
    (counter?.cash_entered || 0) - (counter?.cash_expected || 0),
    counter?.upi || 0, counter?.card || 0, counter?.comp || 0,
    counter?.qr_odoo || 0, counter?.qr_razorpay || 0, counter?.qr_variance || 0,
    reconciliation?.total_physical_cash || 0, reconciliation?.expected_cash || 0,
    reconciliation?.raw_variance || 0,
    reconciliation?.variance_resolved || 0, reconciliation?.variance_unresolved || 0,
    JSON.stringify(reconciliation?.discrepancy_resolutions || []),
    (captain_checkpoints || []).length, '', handover_to || ''
  ).run();

  const shiftId = shiftResult.meta?.last_row_id;

  // 2. Insert captain checkpoints + legacy settlement records
  const checkpoints = captain_checkpoints || [];
  for (const cc of checkpoints) {
    const cap = CAPTAINS[cc.captain_id];
    if (!cap) continue;

    // shift_captain_checkpoints
    await env.DB.prepare(`
      INSERT INTO shift_captain_checkpoints (
        shift_id, captain_id, captain_name, employee_id,
        orders_total, orders_count, upi_amount, card_amount, comp_amount,
        cash_calculated, cash_collected, cash_variance, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      shiftId, cc.captain_id, cc.captain_name || cap.name, cap.employeeId,
      cc.orders_total || 0, cc.orders_count || 0,
      cc.upi_amount || 0, cc.card_amount || 0, cc.comp_amount || 0,
      cc.cash_calculated || 0, cc.cash_collected || 0, cc.cash_variance || 0,
      cc.status || 'present'
    ).run();

    // Legacy settlements record (for period continuity)
    if (cc.status === 'present') {
      // Guard: skip if captain already settled mid-shift
      const existingMidShift = await env.DB.prepare(
        'SELECT id FROM settlements WHERE point = ? AND settled_at > ? AND settled_at < ? LIMIT 1'
      ).bind(cc.captain_id, period_start, settledAt).first();

      if (!existingMidShift) {
        const cashExpected = (cc.orders_total || 0) - (cc.upi_amount || 0) - (cc.card_amount || 0) - (cc.comp_amount || 0);
        await env.DB.prepare(`
          INSERT INTO settlements (point, point_name, settled_by, settled_at, period_start, period_end,
            cash_expected, cash_collected, cash_variance, upi_odoo, upi_razorpay, upi_variance,
            card_amount, comp_amount, total_sales, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          cc.captain_id, cc.captain_name || cap.name, settled_by, settledAt,
          period_start, period_end,
          Math.round(cashExpected * 100) / 100, cc.cash_collected || 0,
          Math.round(((cc.cash_collected || 0) - cashExpected) * 100) / 100,
          0, cc.upi_amount || 0, 0,
          cc.card_amount || 0, cc.comp_amount || 0, cc.orders_total || 0,
          `Shift wizard: calc=${cc.cash_calculated}, collected=${cc.cash_collected}, variance=${cc.cash_variance}`
        ).run();
      }
    }
  }

  // 3. Legacy counter settlement
  await env.DB.prepare(`
    INSERT INTO settlements (point, point_name, settled_by, settled_at, period_start, period_end,
      cash_expected, cash_collected, cash_variance, upi_odoo, upi_razorpay, upi_variance,
      card_amount, comp_amount, total_sales, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    'counter', 'Cash Counter', settled_by, settledAt, period_start, period_end,
    counter?.cash_expected || 0, counter?.cash_entered || 0,
    Math.round(((counter?.cash_entered || 0) - (counter?.cash_expected || 0)) * 100) / 100,
    counter?.upi || 0, counter?.qr_razorpay || 0,
    Math.round(((counter?.qr_razorpay || 0) - (counter?.upi || 0)) * 100) / 100,
    counter?.card || 0, counter?.comp || 0,
    (counter?.cash_expected || 0) + (counter?.upi || 0) + (counter?.card || 0) + (counter?.comp || 0),
    `Shift wizard: drawer=${drawer_cash_entered || 0}, expected=${cb.expected_drawer || 0}, unresolved=${reconciliation?.variance_unresolved || 0}`
  ).run();

  return { success: true, shift_id: shiftId, message: 'Shift settled successfully' };
}

async function getCaptainShiftHistory(env, limit) {
  const shifts = await env.DB.prepare(
    'SELECT * FROM cashier_shifts ORDER BY settled_at DESC LIMIT ?'
  ).bind(Number(limit)).all();

  const results = [];
  for (const shift of (shifts.results || [])) {
    const checkpoints = await env.DB.prepare(
      'SELECT * FROM shift_captain_checkpoints WHERE shift_id = ? ORDER BY captain_id'
    ).bind(shift.id).all();
    results.push({ ...shift, checkpoints: checkpoints.results || [] });
  }

  return { success: true, shifts: results };
}

async function getCaptainPerformance(env, params) {
  const pin = params.get('pin');
  if (!['0305', '3754', '5882'].includes(pin)) {
    return { success: false, error: 'Not authorized' };
  }

  const fromIST = params.get('from');
  const toIST = params.get('to');
  if (!fromIST || !toIST) return { success: false, error: 'from and to required' };

  const apiKey = env.ODOO_API_KEY;
  if (!apiKey) return { success: false, error: 'Odoo not configured' };

  // IST→UTC: subtract 5.5 hours
  const fromUTC = new Date(new Date(fromIST).getTime() - 5.5 * 60 * 60 * 1000);
  const toUTC = new Date(new Date(toIST).getTime() - 5.5 * 60 * 60 * 1000);
  const fromOdoo = fromUTC.toISOString().replace('T', ' ').slice(0, 19);
  const toOdoo = toUTC.toISOString().replace('T', ' ').slice(0, 19);
  const fromUnix = Math.floor(fromUTC.getTime() / 1000);
  const toUnix = Math.floor(toUTC.getTime() / 1000);

  const auth = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
    ? btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET) : null;

  // Fetch ALL captain orders in date range (single Odoo call)
  const allOrders = await rpc(ODOO_URL, ODOO_DB, ODOO_UID, apiKey, 'pos.order', 'search_read',
    [[['config_id', '=', CAPTAIN_CONFIG_ID],
      ['date_order', '>=', fromOdoo], ['date_order', '<=', toOdoo],
      ['state', 'in', ['paid', 'done', 'invoiced', 'posted']]]],
    { fields: ['id', 'name', 'date_order', 'amount_total', 'employee_id', 'payment_ids'], order: 'date_order desc' });

  // Fetch all payment details
  const allPaymentIds = allOrders.flatMap(o => o.payment_ids || []);
  let paymentsMap = {};
  if (allPaymentIds.length > 0) {
    const payments = await rpc(ODOO_URL, ODOO_DB, ODOO_UID, apiKey, 'pos.payment', 'search_read',
      [[['id', 'in', allPaymentIds]]],
      { fields: ['id', 'amount', 'payment_method_id', 'pos_order_id'] });
    for (const p of payments) {
      const oid = p.pos_order_id ? p.pos_order_id[0] : 0;
      if (!paymentsMap[oid]) paymentsMap[oid] = [];
      paymentsMap[oid].push(p);
    }
  }

  // Fetch order lines for product breakdown
  const allOrderIds = allOrders.map(o => o.id);
  let linesMap = {};
  if (allOrderIds.length > 0) {
    const lines = await rpc(ODOO_URL, ODOO_DB, ODOO_UID, apiKey, 'pos.order.line', 'search_read',
      [[['order_id', 'in', allOrderIds]]],
      { fields: ['order_id', 'product_id', 'qty', 'price_subtotal_incl'] });
    for (const l of lines) {
      const oid = l.order_id[0];
      if (!linesMap[oid]) linesMap[oid] = [];
      linesMap[oid].push(l);
    }
  }

  // Fetch Razorpay QR payments for all captains
  const qrPromises = Object.values(CAPTAINS).map(async cap => {
    if (!auth || !cap.razorpayQR) return { id: cap.id, total: 0 };
    try {
      const payments = await fetchRazorpayQRPayments(auth, cap.razorpayQR, fromUnix, toUnix);
      const total = payments.reduce((sum, p) => sum + (p.amount / 100), 0);
      return { id: cap.id, total };
    } catch { return { id: cap.id, total: 0 }; }
  });
  const qrResults = await Promise.all(qrPromises);
  const qrByCapt = {};
  for (const r of qrResults) qrByCapt[r.id] = r.total;

  // Fetch settlement history from D1
  const settlementsRaw = await env.DB.prepare(
    "SELECT * FROM settlements WHERE point LIKE 'captain_%' AND settled_at >= ? AND settled_at <= ? ORDER BY settled_at DESC"
  ).bind(fromUTC.toISOString(), toUTC.toISOString()).all();
  const settlementsData = settlementsRaw.results || [];

  // Group by captain
  const captainMap = {};
  for (const cap of Object.values(CAPTAINS)) {
    captainMap[cap.id] = {
      id: cap.id, name: cap.name, employeeId: cap.employeeId,
      revenue: 0, orderCount: 0, cash: 0, upi: 0, card: 0, comp: 0,
      products: {}, firstOrder: null, lastOrder: null,
      settlements: [],
    };
  }

  // Assign orders to captains by employee_id
  const empToCaptain = {};
  for (const cap of Object.values(CAPTAINS)) empToCaptain[cap.employeeId] = cap.id;

  for (const order of allOrders) {
    const empId = order.employee_id ? order.employee_id[0] : null;
    const captId = empToCaptain[empId];
    if (!captId || !captainMap[captId]) continue;

    const c = captainMap[captId];
    c.revenue += order.amount_total;
    c.orderCount++;

    // Payment decomposition
    const orderPayments = paymentsMap[order.id] || [];
    const cap = CAPTAINS[captId];
    for (const p of orderPayments) {
      const pmId = p.payment_method_id ? p.payment_method_id[0] : 0;
      if (pmId === CAPTAIN_CASH_PM) c.cash += p.amount;
      else if (pmId === cap.upiPM) c.upi += p.amount;
      else if (pmId === CAPTAIN_CARD_PM) c.card += p.amount;
      else if (pmId === CAPTAIN_COMP_PM) c.comp += p.amount;
    }

    // Product aggregation
    const orderLines = linesMap[order.id] || [];
    for (const l of orderLines) {
      const pid = l.product_id[0];
      const pname = l.product_id[1] || `Product ${pid}`;
      if (!c.products[pid]) c.products[pid] = { name: pname, qty: 0, amount: 0 };
      c.products[pid].qty += Math.round(l.qty);
      c.products[pid].amount += l.price_subtotal_incl;
    }

    // Activity window
    const orderTime = order.date_order;
    if (!c.firstOrder || orderTime < c.firstOrder) c.firstOrder = orderTime;
    if (!c.lastOrder || orderTime > c.lastOrder) c.lastOrder = orderTime;
  }

  // Assign settlements
  for (const s of settlementsData) {
    if (captainMap[s.point]) captainMap[s.point].settlements.push(s);
  }

  // Build ranked results
  const runners = Object.values(captainMap)
    .filter(c => c.orderCount > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .map((c, i) => {
      const upiQR = qrByCapt[c.id] || 0;
      const cashInHand = c.revenue - upiQR - c.card - c.comp;
      const totalVariance = c.settlements.reduce((sum, s) => sum + (s.cash_variance || 0), 0);
      return {
        rank: i + 1,
        id: c.id, name: c.name, employeeId: c.employeeId,
        revenue: Math.round(c.revenue * 100) / 100,
        orderCount: c.orderCount,
        avgOrderValue: c.orderCount > 0 ? Math.round((c.revenue / c.orderCount) * 100) / 100 : 0,
        upi: Math.round(upiQR * 100) / 100,
        upiPercent: c.revenue > 0 ? Math.round((upiQR / c.revenue) * 100) : 0,
        card: Math.round(c.card * 100) / 100,
        comp: Math.round(c.comp * 100) / 100,
        cashInHand: Math.round(cashInHand * 100) / 100,
        products: Object.values(c.products).sort((a, b) => b.amount - a.amount).slice(0, 10),
        firstOrder: c.firstOrder, lastOrder: c.lastOrder,
        settlementCount: c.settlements.length,
        totalVariance: Math.round(totalVariance * 100) / 100,
        recentSettlements: c.settlements.slice(0, 5),
      };
    });

  const totalRevenue = runners.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = runners.reduce((s, r) => s + r.orderCount, 0);
  const totalUpi = runners.reduce((s, r) => s + r.upi, 0);
  const netVariance = runners.reduce((s, r) => s + r.totalVariance, 0);

  return {
    success: true,
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
      totalUpi: Math.round(totalUpi * 100) / 100,
      overallUpiPercent: totalRevenue > 0 ? Math.round((totalUpi / totalRevenue) * 100) : 0,
      netVariance: Math.round(netVariance * 100) / 100,
      activeCaptains: runners.length,
    },
    captains: runners,
  };
}

// Paginated Razorpay QR payment fetch (mirrors NCH fetchRunnerQrPayments)
async function fetchRazorpayQRPayments(auth, qrId, fromUnix, toUnix) {
  const payments = [];
  let skip = 0;
  const count = 100;
  for (let page = 0; page < 10; page++) {
    const res = await fetch(
      `https://api.razorpay.com/v1/payments/qr_codes/${qrId}/payments?from=${fromUnix}&to=${toUnix}&count=${count}&skip=${skip}`,
      { headers: { Authorization: 'Basic ' + auth } }
    );
    const data = await res.json();
    const items = data.items || [];
    for (const p of items) {
      if (p.status === 'captured') payments.push(p);
    }
    if (items.length < count) break;
    skip += count;
  }
  return payments;
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
