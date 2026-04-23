// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HE v2 Cashier Deployment — Unified API
// Cloudflare Pages Function: POST|GET /api/v2?action=...
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Scope:
//   • Shift lifecycle (open/current/close)
//   • Captain-owes live ledger (query test.hamzahotel.com pos.order by employee_id)
//   • Handover recording (captain/waiter → cashier cash, local D1 only)
//   • Cash collection (collector pickups, local D1 only)
//   • Expense passthrough (dual-write: local he_v2_shift_expenses + hnhotels.in/api/spend)
//   • Paytm statement upload (CSV/manual)
//   • Shift close reconciliation
//
// Conventions:
//   • All timestamps IST (no Z suffix) as NCH v2 pattern
//   • PIN-gated per action; different actions allow different roles
//   • Source of truth: Odoo (test.hamzahotel.com for pos data,
//     odoo.hnhotels.in for expense/HR). D1 is read-through cache + local state.

// ── Odoo config (HE POS instance) ──────────────────────────────────────
const ODOO_URL = 'https://test.hamzahotel.com/jsonrpc';
const ODOO_DB  = 'main';
const ODOO_UID = 2;

// HE company_id on test.hamzahotel.com (verified by preflight 2026-04-23)
const HE_COMPANY_ID_ON_TEST = 1;

// POS configs + payment methods (verified by preflight)
const POS_CONFIG_COUNTER = 5;
const POS_CONFIG_CAPTAIN = 6;
const PM_CASH_COUNTER    = 11;
const PM_CASH_CAPTAIN    = 19;
const PM_CARD            = 12;
const PM_COMP            = 57;
// UPI PMs are provider-neutral — aggregate sum reconciles against Paytm total.
const PM_UPI_COUNTER     = 14;
const PM_UPI_CAPTAIN     = 52;
const PM_UPI_SHARED      = 58;
const UPI_PMS_ALL        = [PM_UPI_COUNTER, PM_UPI_CAPTAIN, PM_UPI_SHARED];
const CASH_PMS_ALL       = [PM_CASH_COUNTER, PM_CASH_CAPTAIN];

// ── Staff PINs ─────────────────────────────────────────────────────────
// PIN → role/brand/Odoo employee_id mapping. Consistent with hnhotels.in
// (spend.js USERS map) so cross-origin calls use the same PIN.
//
// employee_id values are hr.employee ids on test.hamzahotel.com (the
// synced-2026-04-23 set — ids 82–87 for Service + Support staff).
const STAFF = {
  // Admin + collectors
  '5882': { name: 'Nihaf',    role: 'admin',     can_collect: true,  can_reconcile: true },
  '0305': { name: 'Nihaf',    role: 'admin',     can_collect: true,  can_reconcile: true },
  '8523': { name: 'Basheer',  role: 'gm',        can_collect: true,  can_reconcile: true },
  '3754': { name: 'Naveen',   role: 'cfo',       can_collect: false, can_reconcile: false, read_only: true },

  // POS operators (matching test.hamzahotel.com hr.employee ids)
  '15':   { name: 'Shaik Noor Ahmed',      role: 'cashier', test_emp_id: 83, can_reconcile: true },
  '7':    { name: 'SK Muntaz',             role: 'captain', test_emp_id: 82 },
  '4':    { name: 'Faizan Hussain',        role: 'waiter',  test_emp_id: 84 },
  '3':    { name: 'Hardev Prasad Singh',   role: 'waiter',  test_emp_id: 86 },
};

// ── HTTP helpers ───────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function istNow() {
  const d = new Date(Date.now() + 5.5 * 3600000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function istISO() {
  // Same as istNow but with T separator — what NCH v2 uses
  return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 19);
}

// ── Odoo JSON-RPC ──────────────────────────────────────────────────────
async function odoo(apiKey, model, method, args = [], kwargs = {}) {
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call',
      params: {
        service: 'object', method: 'execute_kw',
        args: [ODOO_DB, ODOO_UID, apiKey, model, method, args, kwargs],
      }, id: Date.now(),
    }),
  });
  const d = await res.json();
  if (d.error) {
    const msg = d.error.data?.message || d.error.message || JSON.stringify(d.error);
    throw new Error(`${model}.${method}: ${msg}`);
  }
  return d.result;
}

// ── Main handler ───────────────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const DB = env.DB;
  const apiKey = env.ODOO_API_KEY;

  try {
    if (request.method === 'GET') {
      // ── GET actions (reads, PIN optional for public data, required for scoped) ──
      if (action === 'verify-pin')     return await verifyPin(url);
      if (action === 'current-shift')  return await getCurrentShift(url, DB);
      if (action === 'captain-owes')   return await captainOwes(url, DB, apiKey);
      if (action === 'shift-live')     return await shiftLive(url, DB, apiKey);
      if (action === 'recent-handovers') return await recentHandovers(url, DB);
      if (action === 'recent-expenses')  return await recentExpenses(url, DB);
      return json({ error: `Unknown GET action: ${action}` }, 400);
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const user = validateStaff(body.pin);
      if (!user) return json({ error: 'Invalid PIN' }, 401);

      if (action === 'open-shift')       return await openShift(body, user, DB);
      if (action === 'close-shift')      return await closeShift(body, user, DB);
      if (action === 'record-handover')  return await recordHandover(body, user, DB);
      if (action === 'record-expense')   return await recordExpense(body, user, DB);
      if (action === 'record-collection') return await recordCollection(body, user, DB);
      if (action === 'submit-settlement') return await submitSettlement(body, user, DB, apiKey);
      if (action === 'upload-paytm')     return await uploadPaytm(body, user, DB);
      if (action === 'retry-expense-sync') return await retryExpenseSync(body, user, DB);
      return json({ error: `Unknown POST action: ${action}` }, 400);
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message, stack: e.stack?.split('\n').slice(0, 4) }, 500);
  }
}

function validateStaff(pin) {
  if (!pin) return null;
  const s = STAFF[String(pin)];
  if (!s) return null;
  return { pin: String(pin), ...s };
}

// ──────────────────────────────────────────────────────────────────────
// GET: verify-pin
// Returns user info + their capabilities. Used by UI to route to the
// right screen after PIN entry. No DB touch.
// ──────────────────────────────────────────────────────────────────────
async function verifyPin(url) {
  const pin = url.searchParams.get('pin');
  const u = validateStaff(pin);
  if (!u) return json({ success: false, error: 'Invalid PIN' }, 401);
  return json({
    success: true,
    user: { name: u.name, role: u.role, test_emp_id: u.test_emp_id || null },
    can_collect: !!u.can_collect,
    can_reconcile: !!u.can_reconcile,
    read_only: !!u.read_only,
  });
}

// ──────────────────────────────────────────────────────────────────────
// GET: current-shift
// Returns the currently-open shift (state='open' OR 'reconciling') or null.
// Public (no PIN needed) so the UI can show shift state on PIN screen.
// ──────────────────────────────────────────────────────────────────────
async function getCurrentShift(_url, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  const row = await DB.prepare(
    `SELECT * FROM he_v2_shifts WHERE state IN ('open','reconciling') ORDER BY id DESC LIMIT 1`
  ).first();
  return json({ success: true, shift: row || null });
}

// ──────────────────────────────────────────────────────────────────────
// POST: open-shift
// Creates a new he_v2_shifts row. Idempotent: if an open shift exists,
// returns it instead of creating a duplicate. Opening float defaults to
// previous shift's final drawer balance if available, else 0 — owner
// seeds real float via wrangler CLI.
// Body: { pin, opening_float? (optional override), notes? }
// ──────────────────────────────────────────────────────────────────────
async function openShift(body, user, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);

  // Guard: only cashier/admin can open shift
  if (!['cashier', 'admin', 'gm'].includes(user.role)) {
    return json({ error: 'Only cashier/admin can open a shift' }, 403);
  }

  // Idempotency: return existing open shift
  const existing = await DB.prepare(
    `SELECT * FROM he_v2_shifts WHERE state = 'open' ORDER BY id DESC LIMIT 1`
  ).first();
  if (existing) {
    return json({ success: true, shift: existing, created: false, note: 'Shift already open — returned existing' });
  }

  // Determine opening float: explicit override > previous close balance > 0
  let openingFloat = parseFloat(body.opening_float);
  if (!Number.isFinite(openingFloat) || openingFloat < 0) {
    const prev = await DB.prepare(
      `SELECT id FROM he_v2_shifts WHERE state = 'closed' ORDER BY id DESC LIMIT 1`
    ).first();
    // For MVP: if no explicit float and no prev, default 0 — owner sets real value via CLI
    openingFloat = 0;
    if (prev) {
      // Future: carry over drawer balance from previous settlement. For now default 0.
    }
  }

  const now = istISO();
  const res = await DB.prepare(
    `INSERT INTO he_v2_shifts (opened_by_pin, opened_by_name, opened_at, opening_float, state, notes)
     VALUES (?, ?, ?, ?, 'open', ?)`
  ).bind(user.pin, user.name, now, openingFloat, body.notes || null).run();

  const shift = await DB.prepare(`SELECT * FROM he_v2_shifts WHERE id = ?`)
    .bind(res.meta.last_row_id).first();

  return json({ success: true, shift, created: true });
}

// ──────────────────────────────────────────────────────────────────────
// POST: close-shift
// Marks shift as 'closed' after reconciliation. Requires all POS
// settlements to be submitted (one row per config in he_v2_shift_settlements
// with state='submitted').
// Body: { pin, shift_id, notes? }
// ──────────────────────────────────────────────────────────────────────
async function closeShift(body, user, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  if (!user.can_reconcile) return json({ error: 'Not allowed to close shift' }, 403);

  const shift = await DB.prepare(`SELECT * FROM he_v2_shifts WHERE id = ?`)
    .bind(body.shift_id).first();
  if (!shift) return json({ error: 'Shift not found' }, 404);
  if (shift.state === 'closed') return json({ error: 'Shift already closed' }, 400);

  // Require both POS settlements submitted
  const settlements = await DB.prepare(
    `SELECT pos_config_id, state FROM he_v2_shift_settlements WHERE shift_id = ?`
  ).bind(body.shift_id).all();
  const submittedConfigs = new Set((settlements.results || [])
    .filter(r => r.state === 'submitted').map(r => r.pos_config_id));
  const missing = [POS_CONFIG_COUNTER, POS_CONFIG_CAPTAIN].filter(c => !submittedConfigs.has(c));
  if (missing.length > 0) {
    return json({ error: `Settlement not submitted for POS configs: ${missing.join(', ')}` }, 400);
  }

  await DB.prepare(
    `UPDATE he_v2_shifts SET state='closed', closed_at=?, closed_by_pin=?, closed_by_name=?, notes = COALESCE(?, notes) WHERE id = ?`
  ).bind(istISO(), user.pin, user.name, body.notes || null, body.shift_id).run();

  const updated = await DB.prepare(`SELECT * FROM he_v2_shifts WHERE id = ?`).bind(body.shift_id).first();
  return json({ success: true, shift: updated });
}

// ──────────────────────────────────────────────────────────────────────
// GET: captain-owes
// Live query: for each POS operator (captain + waiters), how much cash
// have they collected (via Captain POS, cash PM) that HASN'T been handed
// over to the cashier yet?
//
// Formula:
//   owes = Σ(pos.payment.amount WHERE config=6 AND PM=19 AND order.employee_id=X
//           AND payment_date >= shift_start)
//         - Σ(he_v2_handovers.amount WHERE from_employee_id=X AND shift_id=current)
//
// Query params: ?shift_id=N  (optional; default = current open shift)
// ──────────────────────────────────────────────────────────────────────
async function captainOwes(url, DB, apiKey) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  if (!apiKey) return json({ error: 'ODOO_API_KEY missing' }, 500);

  // Find the shift context
  const shiftId = url.searchParams.get('shift_id');
  const shift = shiftId
    ? await DB.prepare(`SELECT * FROM he_v2_shifts WHERE id = ?`).bind(shiftId).first()
    : await DB.prepare(`SELECT * FROM he_v2_shifts WHERE state IN ('open','reconciling') ORDER BY id DESC LIMIT 1`).first();
  if (!shift) return json({ success: true, shift: null, operators: [], note: 'No open shift' });

  const shiftStart = shift.opened_at; // IST, no Z
  // Convert IST to UTC for Odoo (it stores UTC)
  const startUtc = new Date(new Date(shiftStart + '+05:30').getTime()).toISOString().slice(0, 19).replace('T', ' ');

  // List of operators we care about — pull from STAFF map
  const operators = Object.values(STAFF).filter(s => s.test_emp_id).map(s => ({
    test_emp_id: s.test_emp_id, name: s.name, role: s.role,
  }));

  // Fetch all captain-cash payments since shift start, grouped client-side
  //   config_id = 6 (Captain POS), payment_method_id = 19 (Cash Captain)
  //   join via pos.order.employee_id
  //
  // Strategy: find pos.order ids on config 6 opened since shift start + their cash payments.
  const orderIds = await odoo(apiKey, 'pos.order', 'search', [[
    ['config_id', '=', POS_CONFIG_CAPTAIN],
    ['date_order', '>=', startUtc],
    ['state', 'in', ['paid', 'done', 'invoiced']],
  ]], { limit: 500 });

  let orderMap = {};
  let cashPayments = [];
  if (orderIds.length > 0) {
    const orders = await odoo(apiKey, 'pos.order', 'read', [orderIds],
      { fields: ['id', 'name', 'employee_id', 'amount_total', 'date_order'] });
    for (const o of orders) orderMap[o.id] = o;

    cashPayments = await odoo(apiKey, 'pos.payment', 'search_read',
      [[['pos_order_id', 'in', orderIds], ['payment_method_id', '=', PM_CASH_CAPTAIN]]],
      { fields: ['id', 'pos_order_id', 'amount', 'payment_date'] });
  }

  // Aggregate: captain_cash[employee_id] = sum of cash payment amounts
  const cashByEmp = {};
  for (const p of cashPayments) {
    const oid = p.pos_order_id?.[0];
    const order = orderMap[oid];
    if (!order) continue;
    const empId = order.employee_id?.[0];
    if (!empId) continue; // untracked / admin-user session
    cashByEmp[empId] = (cashByEmp[empId] || 0) + (p.amount || 0);
  }
  // Also unattributed (no employee_id) — show as "unassigned"
  const unattributedOrders = Object.values(orderMap).filter(o => !o.employee_id);
  const unattribCash = cashPayments
    .filter(p => {
      const o = orderMap[p.pos_order_id?.[0]];
      return o && !o.employee_id;
    })
    .reduce((s, p) => s + (p.amount || 0), 0);

  // Fetch handover totals per employee, for this shift
  const handovers = await DB.prepare(
    `SELECT from_employee_id, SUM(amount) AS total FROM he_v2_handovers WHERE shift_id = ? GROUP BY from_employee_id`
  ).bind(shift.id).all();
  const handByEmp = Object.fromEntries((handovers.results || []).map(r => [r.from_employee_id, r.total]));

  // Assemble response. Note: if (handed > collected), captain is OWED money
  // by counter (e.g. handed cash, then original order got voided). Surface
  // this as `excess_handover` rather than hiding a negative owes.
  const opsOut = operators.map(op => {
    const collected = cashByEmp[op.test_emp_id] || 0;
    const handed = handByEmp[op.test_emp_id] || 0;
    const delta = collected - handed;
    return {
      employee_id: op.test_emp_id, name: op.name, role: op.role,
      cash_collected: collected, cash_handed_over: handed,
      owes: delta > 0 ? delta : 0,
      excess_handover: delta < 0 ? -delta : 0,
      // if excess_handover > 0 → a void/refund likely happened after handover.
      // Cashier should investigate before closing shift.
    };
  }).sort((a, b) => (b.owes + b.excess_handover) - (a.owes + a.excess_handover));

  return json({
    success: true,
    shift: { id: shift.id, opened_at: shift.opened_at, state: shift.state },
    operators: opsOut,
    unattributed: { orders: unattributedOrders.length, cash: unattribCash,
                     note: unattribOrdersNote(unattributedOrders) },
    totals: {
      total_captain_cash_collected: Object.values(cashByEmp).reduce((s, v) => s + v, 0) + unattribCash,
      total_handed_over: Object.values(handByEmp).reduce((s, v) => s + v, 0),
      total_owed_to_counter: opsOut.reduce((s, o) => s + o.owes, 0),
    },
  });
}

function unattribOrdersNote(orders) {
  if (!orders.length) return null;
  return `${orders.length} captain orders without employee_id (likely Administrator session). Have operators log in with their PIN to attribute.`;
}

// ──────────────────────────────────────────────────────────────────────
// POST: record-handover
// Cashier records that captain/waiter handed over ₹X cash.
// Body: { pin, shift_id, from_employee_id, amount, notes? }
// ──────────────────────────────────────────────────────────────────────
async function recordHandover(body, user, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  if (user.role !== 'cashier' && user.role !== 'admin' && user.role !== 'gm') {
    return json({ error: 'Only cashier/admin/gm can record handover' }, 403);
  }

  const { shift_id, from_employee_id, amount, notes } = body;
  if (!shift_id || !from_employee_id || !amount) {
    return json({ error: 'shift_id, from_employee_id, amount required' }, 400);
  }
  const amt = parseFloat(amount);
  if (!(amt > 0)) return json({ error: 'amount must be positive' }, 400);

  const shift = await DB.prepare(`SELECT * FROM he_v2_shifts WHERE id = ?`).bind(shift_id).first();
  if (!shift) return json({ error: 'Shift not found' }, 404);
  if (shift.state === 'closed') return json({ error: 'Cannot record to closed shift' }, 400);

  // Look up operator name + pin from STAFF map
  const operator = Object.entries(STAFF).find(([_, s]) => s.test_emp_id === parseInt(from_employee_id));
  if (!operator) return json({ error: `Unknown test_emp_id: ${from_employee_id}` }, 400);
  const [opPin, opData] = operator;

  const res = await DB.prepare(
    `INSERT INTO he_v2_handovers
       (shift_id, handed_over_at, from_employee_id, from_employee_name, from_employee_pin,
        amount, cashier_pin, cashier_name, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(shift_id, istISO(), parseInt(from_employee_id), opData.name, opPin,
         amt, user.pin, user.name, notes || null).run();

  return json({
    success: true,
    handover: { id: res.meta.last_row_id, amount: amt,
                 from: opData.name, shift_id, at: istISO() },
  });
}

// ──────────────────────────────────────────────────────────────────────
// GET: recent-handovers
// Lists handovers for a shift (default: current). Used on cashier home to
// show recent activity + let them reverse an accidental entry (TODO Phase 2).
// Query: ?shift_id=N
// ──────────────────────────────────────────────────────────────────────
async function recentHandovers(url, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  const shiftId = url.searchParams.get('shift_id');
  const shift = shiftId
    ? await DB.prepare(`SELECT * FROM he_v2_shifts WHERE id = ?`).bind(shiftId).first()
    : await DB.prepare(`SELECT * FROM he_v2_shifts WHERE state IN ('open','reconciling') ORDER BY id DESC LIMIT 1`).first();
  if (!shift) return json({ success: true, handovers: [] });
  const rows = await DB.prepare(
    `SELECT * FROM he_v2_handovers WHERE shift_id = ? ORDER BY id DESC LIMIT 50`
  ).bind(shift.id).all();
  return json({ success: true, handovers: rows.results || [] });
}

// ──────────────────────────────────────────────────────────────────────
// POST: record-expense
// Dual-write: local D1 (he_v2_shift_expenses tied to shift_id) + central
// hnhotels.in/api/spend (Odoo hr.expense on company_id=2 for HE).
//
// Body: { pin, shift_id, category_id, category_label, product_id,
//         product_name, vendor_id?, vendor_name?, amount, payment_method,
//         notes?, photo_b64? }
// ──────────────────────────────────────────────────────────────────────
async function recordExpense(body, user, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  const { shift_id, category_id, category_label, product_id, product_name,
          vendor_id, vendor_name, amount, payment_method, notes, photo_b64 } = body;
  if (!shift_id || !category_id || !product_id || !amount) {
    return json({ error: 'shift_id, category_id, product_id, amount required' }, 400);
  }

  const shift = await DB.prepare(`SELECT * FROM he_v2_shifts WHERE id = ?`).bind(shift_id).first();
  if (!shift) return json({ error: 'Shift not found' }, 404);
  if (shift.state === 'closed') return json({ error: 'Cannot record to closed shift' }, 400);

  const amt = parseFloat(amount);
  if (!(amt > 0)) return json({ error: 'amount must be positive' }, 400);
  const pm = payment_method || 'cash';

  // Step 1: central write — hnhotels.in/api/spend (Odoo is source of truth)
  let hnExpenseId = null;
  let hnWarning = null;
  try {
    const hnRes = await fetch('https://hnhotels.in/api/spend?action=record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: user.pin, brand: 'HE', category_id, product_id, amount: amt,
        vendor_id: vendor_id || null, payment_method: pm,
        notes: notes || null, photo_b64: photo_b64 || null,
      }),
    });
    const hnData = await hnRes.json();
    if (hnData.success) {
      hnExpenseId = hnData.expense_id || hnData.id || null;
    } else {
      hnWarning = hnData.error || 'hnhotels.in returned success=false';
    }
  } catch (e) {
    hnWarning = `hnhotels.in unreachable: ${e.message}`;
  }

  // Step 2: local mirror — always write, even if central failed (user can retry sync later)
  const res = await DB.prepare(
    `INSERT INTO he_v2_shift_expenses
       (shift_id, recorded_at, recorded_by_pin, recorded_by_name,
        category_id, category_label, product_id, product_name,
        vendor_id, vendor_name, amount, payment_method,
        hnhotels_expense_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(shift_id, istISO(), user.pin, user.name,
         category_id, category_label || null, product_id, product_name || null,
         vendor_id || null, vendor_name || null, amt, pm,
         hnExpenseId, notes || null).run();

  return json({
    success: true,
    expense: { id: res.meta.last_row_id, amount: amt, payment_method: pm, hnhotels_expense_id: hnExpenseId },
    hn_warning: hnWarning,  // non-fatal; local record exists
  });
}

// ──────────────────────────────────────────────────────────────────────
// GET: recent-expenses
// Query: ?shift_id=N
// ──────────────────────────────────────────────────────────────────────
async function recentExpenses(url, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  const shiftId = url.searchParams.get('shift_id');
  const shift = shiftId
    ? await DB.prepare(`SELECT * FROM he_v2_shifts WHERE id = ?`).bind(shiftId).first()
    : await DB.prepare(`SELECT * FROM he_v2_shifts WHERE state IN ('open','reconciling') ORDER BY id DESC LIMIT 1`).first();
  if (!shift) return json({ success: true, expenses: [] });
  const rows = await DB.prepare(
    `SELECT * FROM he_v2_shift_expenses WHERE shift_id = ? ORDER BY id DESC LIMIT 50`
  ).bind(shift.id).all();
  const total = (rows.results || []).reduce((s, r) => s + (r.amount || 0), 0);
  return json({ success: true, expenses: rows.results || [], total });
}

// ──────────────────────────────────────────────────────────────────────
// POST: record-collection
// Collector (Basheer / Nihaf) picks up cash from drawer. Local write only.
// Body: { pin, shift_id, amount, destination, notes? }
// ──────────────────────────────────────────────────────────────────────
async function recordCollection(body, user, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  if (!user.can_collect) return json({ error: 'Not authorized to collect cash' }, 403);

  const { shift_id, amount, destination, notes } = body;
  if (!shift_id || !amount || !destination) {
    return json({ error: 'shift_id, amount, destination required' }, 400);
  }
  const amt = parseFloat(amount);
  if (!(amt > 0)) return json({ error: 'amount must be positive' }, 400);

  const res = await DB.prepare(
    `INSERT INTO he_v2_cash_collections
       (shift_id, collected_at, collector_pin, collector_name, amount, destination, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(shift_id, istISO(), user.pin, user.name, amt, destination, notes || null).run();

  return json({ success: true, collection: { id: res.meta.last_row_id, amount: amt, destination } });
}

// ──────────────────────────────────────────────────────────────────────
// POST: upload-paytm
// Records a Paytm statement for reconciliation. Supports CSV (parsed
// client-side-free via server parser), manual_total, or mobile_upload.
// Body: { pin, shift_id, source, total_amount, total_count, raw_content }
// ──────────────────────────────────────────────────────────────────────
async function uploadPaytm(body, user, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  if (!user.can_reconcile) return json({ error: 'Not authorized' }, 403);

  const { shift_id, source, total_amount, total_count, raw_content, notes } = body;
  if (!shift_id || !source || total_amount == null) {
    return json({ error: 'shift_id, source, total_amount required' }, 400);
  }
  if (!['csv', 'manual_total', 'mobile_upload'].includes(source)) {
    return json({ error: 'source must be csv|manual_total|mobile_upload' }, 400);
  }

  const res = await DB.prepare(
    `INSERT INTO he_v2_paytm_statements
       (shift_id, uploaded_at, uploaded_by_pin, uploaded_by_name, source,
        total_amount, total_count, raw_content, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(shift_id, istISO(), user.pin, user.name, source,
         parseFloat(total_amount), parseInt(total_count) || 0,
         raw_content || null, notes || null).run();

  return json({ success: true, statement_id: res.meta.last_row_id });
}

// ──────────────────────────────────────────────────────────────────────
// POST: retry-expense-sync
// Re-attempts hnhotels.in/api/spend write for any he_v2_shift_expenses
// row with hnhotels_expense_id IS NULL. Covers the "local write succeeded
// but central Odoo write failed" case (bug found in NCH v2 audit — no
// retry existed there). Body: { pin, shift_id? (optional — default: all unsynced) }
// ──────────────────────────────────────────────────────────────────────
async function retryExpenseSync(body, user, DB) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  if (!user.can_reconcile && user.role !== 'cashier') return json({ error: 'Not authorized' }, 403);

  const shiftFilter = body.shift_id ? ' AND shift_id = ?' : '';
  const args = body.shift_id ? [body.shift_id] : [];
  const rows = await DB.prepare(
    `SELECT * FROM he_v2_shift_expenses WHERE hnhotels_expense_id IS NULL${shiftFilter} ORDER BY id ASC LIMIT 50`
  ).bind(...args).all();

  const results = { attempted: 0, synced: 0, still_failing: 0, errors: [] };
  for (const e of (rows.results || [])) {
    results.attempted++;
    try {
      const hnRes = await fetch('https://hnhotels.in/api/spend?action=record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: e.recorded_by_pin, brand: 'HE',
          category_id: e.category_id, product_id: e.product_id,
          amount: e.amount, vendor_id: e.vendor_id || null,
          payment_method: e.payment_method, notes: `[retry] ${e.notes || ''}`,
        }),
      });
      const hnData = await hnRes.json();
      if (hnData.success) {
        const hnId = hnData.expense_id || hnData.id || null;
        await DB.prepare(`UPDATE he_v2_shift_expenses SET hnhotels_expense_id = ? WHERE id = ?`)
          .bind(hnId, e.id).run();
        results.synced++;
      } else {
        results.still_failing++;
        results.errors.push({ expense_id: e.id, error: hnData.error });
      }
    } catch (err) {
      results.still_failing++;
      results.errors.push({ expense_id: e.id, error: err.message });
    }
  }
  return json({ success: true, ...results });
}

// ──────────────────────────────────────────────────────────────────────
// POST: submit-settlement
// Reconciliation wizard submits a single POS config's settlement row.
// Body: { pin, shift_id, pos_config_id, physical_cash, paytm_reported,
//         card_reported, notes? }
// Also queries Odoo to get the live odoo_cash/odoo_upi/odoo_card/odoo_comp
// totals at submit time (not trusting client-side state).
// ──────────────────────────────────────────────────────────────────────
async function submitSettlement(body, user, DB, apiKey) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  if (!apiKey) return json({ error: 'ODOO_API_KEY missing' }, 500);
  if (!user.can_reconcile) return json({ error: 'Not authorized' }, 403);

  const { shift_id, pos_config_id, physical_cash, paytm_reported, card_reported, notes } = body;
  if (!shift_id || !pos_config_id) {
    return json({ error: 'shift_id, pos_config_id required' }, 400);
  }

  const shift = await DB.prepare(`SELECT * FROM he_v2_shifts WHERE id = ?`).bind(shift_id).first();
  if (!shift) return json({ error: 'Shift not found' }, 404);

  // Fetch live Odoo totals for this POS config during shift window
  const startUtc = new Date(new Date(shift.opened_at + '+05:30').getTime()).toISOString().slice(0, 19).replace('T', ' ');
  const orderIds = await odoo(apiKey, 'pos.order', 'search',
    [[['config_id', '=', parseInt(pos_config_id)],
       ['date_order', '>=', startUtc],
       ['state', 'in', ['paid', 'done', 'invoiced']]]], { limit: 1000 });

  let totals = { odoo_cash: 0, odoo_upi: 0, odoo_card: 0, odoo_comp: 0 };
  let pos_label = pos_config_id == POS_CONFIG_COUNTER ? 'Counter' : (pos_config_id == POS_CONFIG_CAPTAIN ? 'Captain' : `Config ${pos_config_id}`);

  if (orderIds.length > 0) {
    const pms = await odoo(apiKey, 'pos.payment', 'search_read',
      [[['pos_order_id', 'in', orderIds]]],
      { fields: ['amount', 'payment_method_id'] });
    for (const p of pms) {
      const pmId = p.payment_method_id?.[0];
      const amt = p.amount || 0;
      if (CASH_PMS_ALL.includes(pmId)) totals.odoo_cash += amt;
      else if (UPI_PMS_ALL.includes(pmId)) totals.odoo_upi += amt;
      else if (pmId === PM_CARD) totals.odoo_card += amt;
      else if (pmId === PM_COMP) totals.odoo_comp += amt;
    }
  }

  const phyCash = physical_cash == null ? null : parseFloat(physical_cash);
  const phyPaytm = paytm_reported == null ? null : parseFloat(paytm_reported);
  const phyCard = card_reported == null ? null : parseFloat(card_reported);
  const varCash = phyCash == null ? null : (phyCash - totals.odoo_cash);
  const varUpi = phyPaytm == null ? null : (phyPaytm - totals.odoo_upi);
  const varCard = phyCard == null ? null : (phyCard - totals.odoo_card);

  // Upsert: one row per (shift_id, pos_config_id)
  const existing = await DB.prepare(
    `SELECT id FROM he_v2_shift_settlements WHERE shift_id = ? AND pos_config_id = ?`
  ).bind(shift_id, pos_config_id).first();

  if (existing) {
    await DB.prepare(
      `UPDATE he_v2_shift_settlements
         SET odoo_cash=?, odoo_upi=?, odoo_card=?, odoo_comp=?,
             physical_cash=?, paytm_reported=?, card_reported=?,
             variance_cash=?, variance_upi=?, variance_card=?,
             state='submitted', submitted_at=?, submitted_by_pin=?, notes=?
       WHERE id = ?`
    ).bind(totals.odoo_cash, totals.odoo_upi, totals.odoo_card, totals.odoo_comp,
           phyCash, phyPaytm, phyCard, varCash, varUpi, varCard,
           istISO(), user.pin, notes || null, existing.id).run();
    const row = await DB.prepare(`SELECT * FROM he_v2_shift_settlements WHERE id = ?`).bind(existing.id).first();
    return json({ success: true, settlement: row, action: 'updated' });
  } else {
    const res = await DB.prepare(
      `INSERT INTO he_v2_shift_settlements
         (shift_id, pos_config_id, pos_label, odoo_cash, odoo_upi, odoo_card, odoo_comp,
          physical_cash, paytm_reported, card_reported,
          variance_cash, variance_upi, variance_card,
          state, submitted_at, submitted_by_pin, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`
    ).bind(shift_id, pos_config_id, pos_label,
           totals.odoo_cash, totals.odoo_upi, totals.odoo_card, totals.odoo_comp,
           phyCash, phyPaytm, phyCard, varCash, varUpi, varCard,
           istISO(), user.pin, notes || null).run();
    const row = await DB.prepare(`SELECT * FROM he_v2_shift_settlements WHERE id = ?`).bind(res.meta.last_row_id).first();
    return json({ success: true, settlement: row, action: 'created' });
  }
}

// ──────────────────────────────────────────────────────────────────────
// GET: shift-live
// Consolidated "cashier home" view — single call returns everything
// needed to render the dashboard:
//   - current shift
//   - captain-owes ledger (all 4 operators)
//   - recent handovers
//   - recent expenses
//   - drawer formula components
//
// Query: ?pin=XXXX (required)
// ──────────────────────────────────────────────────────────────────────
async function shiftLive(url, DB, apiKey) {
  if (!DB) return json({ error: 'DB not configured' }, 500);
  const pin = url.searchParams.get('pin');
  const user = validateStaff(pin);
  if (!user) return json({ success: false, error: 'Invalid PIN' }, 401);

  const shift = await DB.prepare(
    `SELECT * FROM he_v2_shifts WHERE state IN ('open','reconciling') ORDER BY id DESC LIMIT 1`
  ).first();

  if (!shift) {
    return json({ success: true, user: { name: user.name, role: user.role }, shift: null });
  }

  // Captain-owes
  const ocRes = await captainOwes(new URL('https://x/?shift_id=' + shift.id), DB, apiKey);
  const owes = await ocRes.json();

  // Recent handovers
  const hRes = await DB.prepare(
    `SELECT * FROM he_v2_handovers WHERE shift_id = ? ORDER BY id DESC LIMIT 20`
  ).bind(shift.id).all();

  // Recent expenses
  const eRes = await DB.prepare(
    `SELECT * FROM he_v2_shift_expenses WHERE shift_id = ? ORDER BY id DESC LIMIT 20`
  ).bind(shift.id).all();

  // Aggregate for drawer
  const handoverTotal = (hRes.results || []).reduce((s, r) => s + (r.amount || 0), 0);
  const cashExpenseTotal = (eRes.results || []).filter(r => r.payment_method === 'cash').reduce((s, r) => s + (r.amount || 0), 0);

  // Counter-side cash (shift-window cash payments at config 5)
  let counterCash = 0;
  if (apiKey) {
    try {
      const startUtc = new Date(new Date(shift.opened_at + '+05:30').getTime()).toISOString().slice(0, 19).replace('T', ' ');
      const orderIds = await odoo(apiKey, 'pos.order', 'search',
        [[['config_id', '=', POS_CONFIG_COUNTER], ['date_order', '>=', startUtc],
          ['state', 'in', ['paid', 'done', 'invoiced']]]], { limit: 1000 });
      if (orderIds.length) {
        const pms = await odoo(apiKey, 'pos.payment', 'search_read',
          [[['pos_order_id', 'in', orderIds], ['payment_method_id', '=', PM_CASH_COUNTER]]],
          { fields: ['amount'] });
        counterCash = pms.reduce((s, p) => s + (p.amount || 0), 0);
      }
    } catch (e) { /* soft-fail; counter cash shows 0 */ }
  }

  // Cash collections this shift
  const cRes = await DB.prepare(
    `SELECT SUM(amount) AS total FROM he_v2_cash_collections WHERE shift_id = ?`
  ).bind(shift.id).first();
  const collectionsTotal = (cRes?.total) || 0;

  const drawerExpected = (shift.opening_float || 0) + counterCash + handoverTotal - cashExpenseTotal - collectionsTotal;

  return json({
    success: true,
    user: { name: user.name, role: user.role, pin: user.pin,
             can_collect: !!user.can_collect, can_reconcile: !!user.can_reconcile },
    shift: { ...shift, age_minutes: Math.floor((Date.now() - new Date(shift.opened_at + '+05:30').getTime()) / 60000) },
    captain_owes: owes.operators || [],
    captain_unattributed: owes.unattributed || null,
    handovers: hRes.results || [],
    expenses: eRes.results || [],
    drawer: {
      opening_float: shift.opening_float || 0,
      counter_cash: counterCash,
      handover_total: handoverTotal,
      cash_expense_total: cashExpenseTotal,
      collections_total: collectionsTotal,
      expected: drawerExpected,
    },
  });
}
