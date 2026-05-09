// HE Admin Sync — one-shot maintenance endpoints
// Cloudflare Pages Function: POST /api/admin-sync
//
// Current action: sync-employees-from-hnhotels
//   Mirrors HE hr.employee records from odoo.hnhotels.in (HR master) into
//   test.hamzahotel.com (HE POS Odoo) so POS employee auth, captain-owes
//   ledger, and settlement dashboards have a consistent staff list.
//
// Guarantees:
//   - No deletes. Existing employees on test.hamzahotel.com are never touched.
//   - Idempotent: re-runs skip anything already present (dedup by name, case-
//     insensitive + trimmed).
//   - Company-correct: new records land on HE's company_id on that instance,
//     auto-discovered from pos.config id=5 (HE counter).

const ODOO_URL = 'https://test.hamzahotel.com/jsonrpc';
const ODOO_DB  = 'main';
const ODOO_UID = 2;

const ADMIN_PINS = new Set(['5882', '0305']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function odoo(apiKey, model, method, args = [], kwargs = {}) {
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call',
      params: {
        service: 'object', method: 'execute_kw',
        args: [ODOO_DB, ODOO_UID, apiKey, model, method, args, kwargs],
      },
      id: Date.now(),
    }),
  });
  const d = await res.json();
  if (d.error) {
    const msg = d.error.data?.message || d.error.message || JSON.stringify(d.error);
    throw new Error(`${model}.${method}: ${msg}`);
  }
  return d.result;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { pin, action = 'discover' } = body;
  if (!ADMIN_PINS.has(pin)) return json({ error: 'Admin only' }, 403);

  const apiKey = env.ODOO_API_KEY;
  if (!apiKey) return json({ error: 'ODOO_API_KEY not configured in env' }, 500);

  try {
    if (action === 'discover' || action === 'sync-dry' || action === 'sync') {
      return await syncEmployeesFromHnhotels(apiKey, action);
    }
    if (action === 'preflight') {
      return await preflight(apiKey);
    }
    if (action === 'migrate-v2-schema') {
      return await migrateV2Schema(env.DB);
    }
    if (action === 'audit-shift-pos') {
      return await auditShiftPos(apiKey, env.DB);
    }
    if (action === 'probe-pos-employees') {
      return await probePosEmployees(apiKey);
    }
    if (action === 'grant-pos-employees') {
      return await grantPosEmployees(apiKey, body);
    }
    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e.message, stack: e.stack }, 500);
  }
}

/* ━━━ Probe: why is Noor missing from POS login? ━━━
 * Compares pos.config.employee_ids (the whitelist) vs hr.employee for HE
 * company. Shows which of the 14 synced employees are / aren't in the
 * login list of each POS config. Read-only. */
async function probePosEmployees(apiKey) {
  if (!apiKey) return json({ error: 'ODOO_API_KEY missing' }, 500);

  // Odoo 18 split pos.config employee whitelist into basic_employee_ids +
  // advanced_employee_ids (roles). Discover which fields actually exist first.
  const fieldInfo = await odoo(apiKey, 'ir.model.fields', 'search_read',
    [[['model', '=', 'pos.config'], ['name', 'in',
       ['employee_ids', 'basic_employee_ids', 'advanced_employee_ids', 'module_pos_hr']]]],
    { fields: ['name', 'ttype', 'relation'] });
  const availableFields = fieldInfo.map(f => f.name);

  // Build safe field list for read (only include fields that exist)
  const readFields = ['id', 'name', 'module_pos_hr', 'company_id'];
  if (availableFields.includes('basic_employee_ids'))    readFields.push('basic_employee_ids');
  if (availableFields.includes('advanced_employee_ids')) readFields.push('advanced_employee_ids');
  if (availableFields.includes('employee_ids'))          readFields.push('employee_ids');

  const cfgs = await odoo(apiKey, 'pos.config', 'read', [[5, 6]], { fields: readFields });

  // All active hr.employees on HE company (id=1 on test.hamzahotel.com)
  const emps = await odoo(apiKey, 'hr.employee', 'search_read',
    [[['active', '=', true], ['company_id', '=', 1]]],
    { fields: ['id', 'name', 'barcode', 'pin', 'job_title', 'department_id', 'company_id'],
      order: 'name asc' });

  const mapped_ids = [74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87];
  const my_emps = emps.filter(e => mapped_ids.includes(e.id));

  // Odoo 18 split: basic_employee_ids (PIN login) + advanced_employee_ids (managers)
  // Check both lists. Union = who can log in at all.
  const out = { configs: {} };
  for (const cfg of cfgs) {
    const basic = cfg.basic_employee_ids || [];
    const advanced = cfg.advanced_employee_ids || [];
    const legacy = cfg.employee_ids || [];
    const union = [...new Set([...basic, ...advanced, ...legacy])];
    out.configs[cfg.id] = {
      name: cfg.name,
      module_pos_hr: cfg.module_pos_hr,
      basic_employee_ids: basic,
      advanced_employee_ids: advanced,
      legacy_employee_ids: legacy,
      union_count: union.length,
      my_employees_in_union:    my_emps.filter(e =>  union.includes(e.id)).map(e => e.name),
      my_employees_MISSING:     my_emps.filter(e => !union.includes(e.id)).map(e => ({ id: e.id, name: e.name })),
      my_employees_in_basic:    my_emps.filter(e =>  basic.includes(e.id)).map(e => e.name),
      my_employees_in_advanced: my_emps.filter(e =>  advanced.includes(e.id)).map(e => e.name),
    };
  }

  const allMissing = cfgs.every(c => {
    const u = [...new Set([...(c.basic_employee_ids || []), ...(c.advanced_employee_ids || []), ...(c.employee_ids || [])])];
    return my_emps.every(e => !u.includes(e.id));
  });

  return json({
    success: true,
    odoo_18_fields_available: availableFields,
    configs: out.configs,
    all_he_employees_count: emps.length,
    my_synced_employees_count: my_emps.length,
    my_synced_employees: my_emps.map(e => ({ id: e.id, name: e.name, pin: e.pin, barcode: e.barcode })),
    interpretation: allMissing
      ? 'CONFIRMED: all 14 synced employees missing from pos.config whitelist. Run action=grant-pos-employees to add them.'
      : 'Some synced employees are in the whitelist. Check missing per-config breakdown above.',
  });
}

/* ━━━ Fix: add synced employees to POS config whitelist ━━━
 * Adds the 14 synced employee IDs to pos.config.employee_ids on both
 * configs (5 Counter, 6 Captain) so they appear in Select Cashier.
 * Uses (4, id, 0) link command to append without removing existing ones.
 * Body: { pin, only_ids?: [...] }  (default: all 14 synced) */
async function grantPosEmployees(apiKey, body) {
  if (!apiKey) return json({ error: 'ODOO_API_KEY missing' }, 500);
  const ids = Array.isArray(body.only_ids) && body.only_ids.length
    ? body.only_ids.map(Number)
    : [74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87];

  // Discover which employee-whitelist field exists (Odoo 18 split vs legacy)
  const fieldInfo = await odoo(apiKey, 'ir.model.fields', 'search_read',
    [[['model', '=', 'pos.config'], ['name', 'in',
       ['employee_ids', 'basic_employee_ids']]]],
    { fields: ['name'] });
  const availableFields = fieldInfo.map(f => f.name);
  // Prefer basic_employee_ids (Odoo 18) — that's the PIN-login field.
  // Fall back to legacy employee_ids for older instances.
  const targetField = availableFields.includes('basic_employee_ids')
    ? 'basic_employee_ids'
    : (availableFields.includes('employee_ids') ? 'employee_ids' : null);

  if (!targetField) {
    return json({ error: 'No writable employee whitelist field found on pos.config' }, 500);
  }

  const results = {};
  for (const cfgId of [5, 6]) {
    const cfg = await odoo(apiKey, 'pos.config', 'read', [[cfgId]],
      { fields: ['id', 'name', targetField] });
    const before = cfg[0][targetField] || [];
    const commands = ids.filter(id => !before.includes(id)).map(id => [4, id, 0]);
    if (commands.length === 0) {
      results[cfgId] = { name: cfg[0].name, field: targetField, added: 0, already_present: ids.length };
      continue;
    }
    await odoo(apiKey, 'pos.config', 'write',
      [[cfgId], { [targetField]: commands }]);
    const after = await odoo(apiKey, 'pos.config', 'read', [[cfgId]],
      { fields: [targetField] });
    results[cfgId] = {
      name: cfg[0].name,
      field: targetField,
      before_count: before.length,
      after_count: after[0][targetField].length,
      added: commands.length,
    };
  }
  return json({ success: true, field_used: targetField, results,
    note: 'POS terminal MUST close session + reopen to reload cashier list (Odoo POS bundles list into session data — live sessions use stale copy).' });
}

/* ━━━ Audit: exactly what the shift-live API sees on test.hamzahotel.com ━━━
 * Dumps every POS order + payment in the current shift window, grouped by
 * (config, payment_method, employee). Used to verify the captain-owes +
 * counter-cash logic matches reality. Read-only; safe to call anytime. */
async function auditShiftPos(apiKey, DB) {
  if (!DB) return json({ error: 'D1 not configured' }, 500);
  if (!apiKey) return json({ error: 'ODOO_API_KEY missing' }, 500);

  const shift = await DB.prepare(
    `SELECT * FROM he_v2_shifts WHERE state IN ('open','reconciling') ORDER BY id DESC LIMIT 1`
  ).first();
  if (!shift) return json({ success: true, note: 'No open shift', orders: [] });

  // Convert shift opened_at (IST) → UTC for Odoo date comparison
  const startUtc = new Date(new Date(shift.opened_at + '+05:30').getTime())
    .toISOString().slice(0, 19).replace('T', ' ');

  // Fetch ALL orders across BOTH POS configs since shift start, ANY state
  // (including draft/cancel so we can see what's filtered out)
  const orders = await odoo(apiKey, 'pos.order', 'search_read',
    [[['config_id', 'in', [5, 6]], ['date_order', '>=', startUtc]]],
    { fields: ['id', 'name', 'config_id', 'state', 'amount_total', 'employee_id',
                'user_id', 'date_order', 'partner_id', 'session_id'],
      order: 'date_order desc', limit: 500 });

  // Fetch ALL payments for these orders
  let payments = [];
  if (orders.length > 0) {
    payments = await odoo(apiKey, 'pos.payment', 'search_read',
      [[['pos_order_id', 'in', orders.map(o => o.id)]]],
      { fields: ['id', 'amount', 'payment_method_id', 'pos_order_id', 'payment_date'] });
  }

  // Fetch active POS sessions so we know WHO is logged in
  const sessions = await odoo(apiKey, 'pos.session', 'search_read',
    [[['state', 'in', ['opened', 'opening_control']], ['config_id', 'in', [5, 6]]]],
    { fields: ['id', 'name', 'state', 'config_id', 'user_id', 'start_at', 'cash_register_balance_start'] });

  // Fetch payment methods for reference
  const pms = await odoo(apiKey, 'pos.payment.method', 'read',
    [[11, 12, 14, 19, 52, 57, 58]], { fields: ['id', 'name', 'type', 'is_cash_count'] });
  const pmById = Object.fromEntries(pms.map(p => [p.id, p]));

  // Aggregate: cash (PM 11, 19) by config + by employee_id presence
  const summary = {
    counter_cash_total: 0,           // sum PM 11 on cfg 5 — INCLUDED in drawer formula
    captain_cash_total: 0,            // sum PM 19 on cfg 6 — split into tracked vs unattributed below
    captain_cash_tracked: 0,          // attributed to one of the 4 mapped employees
    captain_cash_unattributed: 0,     // cfg 6 cash with NO employee_id (e.g. Admin session)
    captain_cash_unknown_emp: 0,      // cfg 6 cash with employee_id that's NOT one of our 4 mapped (edge case)
    by_employee: {},                  // { emp_id: { name, cash } }
    filtered_out_state: [],           // orders in draft/cancel we exclude from drawer math
    unattributed_orders_detail: [],
  };
  const MAPPED_EMP_IDS = new Set([82, 83, 84, 86]); // Muntaz, Noor, Faizan, Hardev
  const orderById = Object.fromEntries(orders.map(o => [o.id, o]));

  for (const p of payments) {
    const oid = p.pos_order_id?.[0];
    const o = orderById[oid];
    if (!o) continue;

    const pmId = p.payment_method_id?.[0];
    const amt = p.amount || 0;
    const included = ['paid', 'done', 'invoiced'].includes(o.state);
    if (!included) {
      summary.filtered_out_state.push({
        order: o.name, state: o.state, amount: amt, pm: pmById[pmId]?.name,
      });
      continue;
    }

    // Counter cash (cfg 5, PM 11) — no employee filter in /ops/v2/ drawer math
    if (o.config_id?.[0] === 5 && pmId === 11) {
      summary.counter_cash_total += amt;
    }
    // Captain cash (cfg 6, PM 19) — attributed per-employee
    if (o.config_id?.[0] === 6 && pmId === 19) {
      summary.captain_cash_total += amt;
      const empId = o.employee_id?.[0];
      if (!empId) {
        summary.captain_cash_unattributed += amt;
        summary.unattributed_orders_detail.push({
          order: o.name, user: o.user_id?.[1], amount: amt,
        });
      } else if (MAPPED_EMP_IDS.has(empId)) {
        summary.captain_cash_tracked += amt;
        const key = empId;
        if (!summary.by_employee[key]) {
          summary.by_employee[key] = { name: o.employee_id[1], cash: 0, emp_id: empId };
        }
        summary.by_employee[key].cash += amt;
      } else {
        summary.captain_cash_unknown_emp += amt;
        summary.by_employee[empId] = summary.by_employee[empId] || {
          name: o.employee_id[1] + ' (NOT IN MAPPED SET — orphan)', cash: 0, emp_id: empId,
        };
        summary.by_employee[empId].cash += amt;
      }
    }
  }

  return json({
    success: true,
    shift: { id: shift.id, opened_at: shift.opened_at, state: shift.state },
    window_utc: startUtc,
    orders_found: orders.length,
    payments_found: payments.length,
    summary,
    sessions_open: sessions,
    payment_methods_reference: pmById,
    orders_detail: orders.slice(0, 50).map(o => ({
      id: o.id, name: o.name, state: o.state, amount_total: o.amount_total,
      config: o.config_id?.[1], employee: o.employee_id?.[1] || '(none)',
      session_user: o.user_id?.[1], date_order: o.date_order,
    })),
  });
}

/* ━━━ V2 schema migration ━━━
 * Creates the he_v2_* tables on the `he-whatsapp` D1 database. Idempotent
 * (CREATE TABLE IF NOT EXISTS). Safe to re-run. Schema source of truth is
 * schema-v2.sql — this function mirrors those DDL statements so we don't
 * have to ship the SQL file to the Worker. */
async function migrateV2Schema(DB) {
  if (!DB) return json({ error: 'D1 binding "DB" not configured' }, 500);
  const stmts = [
    `CREATE TABLE IF NOT EXISTS he_v2_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opened_by_pin TEXT NOT NULL, opened_by_name TEXT NOT NULL,
      opened_at TEXT NOT NULL, opening_float REAL NOT NULL DEFAULT 0,
      closed_at TEXT, closed_by_pin TEXT, closed_by_name TEXT,
      state TEXT NOT NULL DEFAULT 'open', notes TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_shifts_state ON he_v2_shifts(state)`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_shifts_opened ON he_v2_shifts(opened_at)`,
    `CREATE TABLE IF NOT EXISTS he_v2_handovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL, handed_over_at TEXT NOT NULL,
      from_employee_id INTEGER NOT NULL, from_employee_name TEXT NOT NULL, from_employee_pin TEXT NOT NULL,
      amount REAL NOT NULL, cashier_pin TEXT NOT NULL, cashier_name TEXT NOT NULL, notes TEXT,
      FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id))`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_handovers_shift ON he_v2_handovers(shift_id)`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_handovers_emp ON he_v2_handovers(from_employee_id)`,
    `CREATE TABLE IF NOT EXISTS he_v2_shift_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL, pos_config_id INTEGER NOT NULL, pos_label TEXT NOT NULL,
      odoo_cash REAL NOT NULL DEFAULT 0, odoo_upi REAL NOT NULL DEFAULT 0,
      odoo_card REAL NOT NULL DEFAULT 0, odoo_comp REAL NOT NULL DEFAULT 0,
      physical_cash REAL, paytm_reported REAL, card_reported REAL,
      variance_cash REAL, variance_upi REAL, variance_card REAL,
      state TEXT DEFAULT 'draft', submitted_at TEXT, submitted_by_pin TEXT, notes TEXT,
      FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id))`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_settlements_shift ON he_v2_shift_settlements(shift_id)`,
    `CREATE TABLE IF NOT EXISTS he_v2_paytm_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL, uploaded_at TEXT NOT NULL,
      uploaded_by_pin TEXT NOT NULL, uploaded_by_name TEXT NOT NULL,
      source TEXT NOT NULL, total_amount REAL NOT NULL, total_count INTEGER NOT NULL DEFAULT 0,
      raw_content TEXT, notes TEXT,
      FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id))`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_paytm_shift ON he_v2_paytm_statements(shift_id)`,
    `CREATE TABLE IF NOT EXISTS he_v2_paytm_reconciliation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL, paytm_txn_id TEXT, paytm_amount REAL NOT NULL, paytm_ts TEXT,
      odoo_payment_id INTEGER, match_type TEXT NOT NULL,
      resolved_by_pin TEXT, resolution_note TEXT,
      FOREIGN KEY (statement_id) REFERENCES he_v2_paytm_statements(id))`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_paytm_recon_stmt ON he_v2_paytm_reconciliation(statement_id)`,
    `CREATE TABLE IF NOT EXISTS he_v2_cash_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL, collected_at TEXT NOT NULL,
      collector_pin TEXT NOT NULL, collector_name TEXT NOT NULL,
      amount REAL NOT NULL, destination TEXT NOT NULL,
      receipt_drive_id TEXT, receipt_drive_link TEXT, notes TEXT,
      FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id))`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_collections_shift ON he_v2_cash_collections(shift_id)`,
    `CREATE TABLE IF NOT EXISTS he_v2_shift_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL, recorded_at TEXT NOT NULL,
      recorded_by_pin TEXT NOT NULL, recorded_by_name TEXT NOT NULL,
      category_id INTEGER NOT NULL, category_label TEXT NOT NULL,
      product_id INTEGER NOT NULL, product_name TEXT NOT NULL,
      vendor_id INTEGER, vendor_name TEXT,
      amount REAL NOT NULL, payment_method TEXT NOT NULL DEFAULT 'cash',
      hnhotels_expense_id INTEGER, photo_drive_link TEXT, notes TEXT,
      FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id))`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_expenses_shift ON he_v2_shift_expenses(shift_id)`,
    `CREATE INDEX IF NOT EXISTS idx_he_v2_expenses_category ON he_v2_shift_expenses(category_id)`,
  ];
  const executed = [];
  const errors = [];
  for (const sql of stmts) {
    try {
      await DB.prepare(sql).run();
      const head = sql.replace(/\s+/g, ' ').slice(0, 80);
      executed.push(head);
    } catch (e) {
      errors.push({ sql: sql.slice(0, 80), error: e.message });
    }
  }
  return json({
    success: errors.length === 0,
    executed_count: executed.length,
    error_count: errors.length,
    tables_now_present: ['he_v2_shifts','he_v2_handovers','he_v2_shift_settlements',
                          'he_v2_paytm_statements','he_v2_paytm_reconciliation',
                          'he_v2_cash_collections','he_v2_shift_expenses'],
    executed, errors,
  });
}

/* ━━━ Preflight check ━━━
 * Verifies every assumption the /ops/v2/ build depends on. Returns a
 * structured report with issues[] listing blockers, warnings[] listing
 * things to fix later, and all_clear boolean. Read-only, safe to re-run. */
async function preflight(apiKey) {
  const out = {
    generated_at: new Date().toISOString(),
    test_hamzahotel_com: {},
    odoo_hnhotels_in: {},
    expense_bridge: {},
    issues: [],
    warnings: [],
    all_clear: false,
  };

  // A. test.hamzahotel.com — companies, pos configs, payment methods
  const companies = await odoo(apiKey, 'res.company', 'search_read', [[]],
    { fields: ['id', 'name', 'currency_id'] });
  out.test_hamzahotel_com.companies = companies;

  // Minimal safe field set (Odoo 18 removed iface_start_categ_id etc.)
  const cfg5 = await odoo(apiKey, 'pos.config', 'read', [[5]],
    { fields: ['id', 'name', 'company_id', 'module_pos_hr', 'payment_method_ids'] });
  const cfg6 = await odoo(apiKey, 'pos.config', 'read', [[6]],
    { fields: ['id', 'name', 'company_id', 'module_pos_hr', 'payment_method_ids'] });
  out.test_hamzahotel_com.pos_config_5 = cfg5?.[0] || null;
  out.test_hamzahotel_com.pos_config_6 = cfg6?.[0] || null;

  // Check if HR-based employee login is enabled (critical for captain tracking)
  if (!cfg5?.[0]?.module_pos_hr) out.issues.push('pos.config 5 (Counter) has module_pos_hr=false — orders will NOT have employee_id, captain tracking impossible');
  if (!cfg6?.[0]?.module_pos_hr) out.issues.push('pos.config 6 (Captain) has module_pos_hr=false — orders will NOT have employee_id, captain tracking impossible');

  // B. Payment methods — do all the IDs in settlement.js actually exist?
  // Note: the existing PMs 14 ("HE - UPI Counter") and 52 ("HE - UPI Captain")
  // are provider-neutral by name — they represent "UPI received at this POS"
  // regardless of whether the physical QR is Razorpay or Paytm. At settlement
  // time we reconcile sum(PM 14+52) against Paytm dashboard aggregate. No need
  // for separate PM 59/60 unless Razorpay + Paytm coexist at the same counter.
  const expectedPMs = [
    { id: 11, purpose: 'cash_counter',       required: true  },
    { id: 19, purpose: 'cash_captain',       required: true  },
    { id: 14, purpose: 'upi_counter',        required: true  }, // provider-neutral
    { id: 52, purpose: 'upi_captain',        required: true  }, // provider-neutral
    { id: 12, purpose: 'card',               required: true  },
    { id: 57, purpose: 'comp',               required: true  },
  ];
  const pmIds = expectedPMs.map(p => p.id);
  const pms = await odoo(apiKey, 'pos.payment.method', 'read', [pmIds],
    { fields: ['id', 'name', 'type', 'company_id', 'is_cash_count', 'journal_id', 'use_payment_terminal'] });
  const pmById = Object.fromEntries((pms || []).map(p => [p.id, p]));
  out.test_hamzahotel_com.payment_methods = {};
  for (const ep of expectedPMs) {
    const found = pmById[ep.id];
    out.test_hamzahotel_com.payment_methods[ep.purpose] = found || { missing: true, expected_id: ep.id };
    if (!found && ep.required) out.issues.push(`Required payment method id=${ep.id} (${ep.purpose}) not found on test.hamzahotel.com`);
  }
  const cfg5Pms = cfg5?.[0]?.payment_method_ids || [];
  const cfg6Pms = cfg6?.[0]?.payment_method_ids || [];
  out.test_hamzahotel_com.config_5_pms_wired = cfg5Pms;
  out.test_hamzahotel_com.config_6_pms_wired = cfg6Pms;
  // Critical wiring: cash + UPI PMs must be on their configs
  if (!cfg5Pms.includes(11)) out.issues.push('Counter config 5 missing Cash PM 11');
  if (!cfg5Pms.includes(14)) out.issues.push('Counter config 5 missing UPI PM 14');
  if (!cfg6Pms.includes(19)) out.issues.push('Captain config 6 missing Cash PM 19');
  if (!cfg6Pms.includes(52)) out.issues.push('Captain config 6 missing UPI PM 52');

  // C. Employee sync sanity — confirm the 14 we created are there + Muntaz/Noor exist
  const heEmps = await odoo(apiKey, 'hr.employee', 'search_read',
    [[['active', '=', true], ['company_id', '=', 1]]],
    { fields: ['id', 'name', 'barcode', 'pin', 'job_title', 'company_id'] });
  out.test_hamzahotel_com.he_employees_count = heEmps.length;
  const key = (s) => (s || '').trim().toLowerCase();
  const byName = new Map(heEmps.map(e => [key(e.name), e]));
  const requiredPosOperators = [
    { name: 'SK Muntaz',          pin: '7',  role: 'captain'   },
    { name: 'Shaik Noor Ahmed',   pin: '15', role: 'cashier'   },
    { name: 'Faizan Hussain',     pin: '4',  role: 'waiter_1'  },
    { name: 'Hardev Prasad Singh',pin: '3',  role: 'waiter_2'  },
  ];
  out.test_hamzahotel_com.required_operators_verified = {};
  for (const r of requiredPosOperators) {
    const found = byName.get(key(r.name));
    if (!found) {
      out.issues.push(`Required POS operator "${r.name}" (${r.role}) not found on test.hamzahotel.com`);
      out.test_hamzahotel_com.required_operators_verified[r.role] = { found: false, expected: r };
    } else {
      const pinOk = String(found.pin) === r.pin;
      const barcodeOk = found.barcode === `HNHE${r.pin}`;
      if (!pinOk) out.warnings.push(`${r.name}: PIN on test=${found.pin}, expected=${r.pin}`);
      if (!barcodeOk) out.warnings.push(`${r.name}: barcode on test=${found.barcode}, expected=HNHE${r.pin}`);
      out.test_hamzahotel_com.required_operators_verified[r.role] = {
        found: true, id: found.id, name: found.name,
        pin: found.pin, barcode: found.barcode,
        pin_correct: pinOk, barcode_correct: barcodeOk,
      };
    }
  }

  // E2. Probe PM 58 + any other PMs on configs (what is PM 58?)
  const wiredPms = [...new Set([...(cfg5?.[0]?.payment_method_ids || []), ...(cfg6?.[0]?.payment_method_ids || [])])];
  const allWiredPms = await odoo(apiKey, 'pos.payment.method', 'read', [wiredPms],
    { fields: ['id', 'name', 'type', 'is_cash_count'] });
  out.test_hamzahotel_com.all_wired_pms_detail = allWiredPms;

  // E3. Check for any OPEN POS sessions that could interfere with /ops/v2/ cutover
  const openSessions = await odoo(apiKey, 'pos.session', 'search_read',
    [[['state', 'in', ['opened', 'opening_control']], ['config_id', 'in', [5, 6]]]],
    { fields: ['id', 'name', 'state', 'start_at', 'user_id', 'config_id'] });
  out.test_hamzahotel_com.open_sessions_count = openSessions.length;
  out.test_hamzahotel_com.open_sessions = openSessions;
  if (openSessions.length > 0) {
    out.warnings.push(`${openSessions.length} open POS session(s) on HE — these will populate captain-owes ledger on /ops/v2/ immediately after launch (not a blocker, just FYI)`);
  }

  // D. Bridge query test: can we filter pos.order by employee_id?
  //    Try a recent-orders fetch for Muntaz if he exists.
  const muntaz = out.test_hamzahotel_com.required_operators_verified.captain;
  if (muntaz?.found) {
    const recent = await odoo(apiKey, 'pos.order', 'search_count',
      [[['employee_id', '=', muntaz.id]]]);
    out.test_hamzahotel_com.bridge_query_test = {
      muntaz_employee_id: muntaz.id,
      historical_orders_with_this_employee_id: recent,
      note: recent === 0
        ? 'OK — new employee, no historical orders yet (expected). Bridge works structurally.'
        : `Found ${recent} historical orders — bridge works AND there's history.`,
    };
  }

  // E. hnhotels.in expense bridge — can /api/spend serve the HE cashier flow?
  try {
    const pinProbe = await fetch('https://hnhotels.in/api/spend?action=verify-pin&pin=15');
    const pinData = await pinProbe.json();
    out.expense_bridge.noor_pin_verify = {
      ok: pinData.success === true,
      user: pinData.user,
      brands: pinData.brands,
      can_admin: pinData.can_admin,
      categories_visible: (pinData.categories || []).length,
    };
    if (!pinData.success) out.issues.push('hnhotels.in/api/spend does not accept Noor PIN 15 — expense flow will be blocked');
    if (!(pinData.brands || []).includes('HE')) out.issues.push(`Noor is not scoped to HE brand on hnhotels.in (got brands=${JSON.stringify(pinData.brands)})`);

    // Also probe Basheer (8523) — collector role
    const basheerProbe = await fetch('https://hnhotels.in/api/spend?action=verify-pin&pin=8523').then(r => r.json()).catch(() => null);
    out.expense_bridge.basheer_pin_verify = basheerProbe && basheerProbe.success
      ? { ok: true, user: basheerProbe.user, brands: basheerProbe.brands, can_admin: basheerProbe.can_admin }
      : { ok: false, error: basheerProbe?.error || 'unknown' };

    // Probe: HE products for Cat 8 (Petty) — most common cashier expense
    const prodProbe = await fetch('https://hnhotels.in/api/spend?action=products&pin=15&cat=8&brand=HE').then(r => r.json()).catch(() => null);
    out.expense_bridge.sample_products_cat8_HE = {
      ok: prodProbe?.success === true,
      count: (prodProbe?.products || []).length,
      sample: (prodProbe?.products || []).slice(0, 3),
    };

    // Probe: HE vendors for Cat 8
    const vendProbe = await fetch('https://hnhotels.in/api/spend?action=vendors&brand=HE&cat_id=8').then(r => r.json()).catch(() => null);
    out.expense_bridge.sample_vendors_cat8_HE = {
      ok: vendProbe?.success === true,
      count: (vendProbe?.vendors || []).length,
      fallback: vendProbe?.fallback || false,
    };
  } catch (e) {
    out.issues.push(`Expense bridge probe failed: ${e.message}`);
  }

  // F. Existing HE settlement data — what will be archived?
  //    Check D1 via a counter-side query (this runs on HE Pages so env.DB = HE D1)
  //    We can count rows in `settlements` and `cash_collections` tables if they exist.
  try {
    const ctx = await fetch('https://hamzaexpress.in/api/settlement?action=list-points&pin=5882').then(r => r.json()).catch(() => null);
    out.test_hamzahotel_com.legacy_settlement_api_probe = ctx
      ? { ok: true, points: ctx.points || [], sample: ctx }
      : { ok: false };
  } catch (e) {
    out.warnings.push('Legacy settlement endpoint probe failed: ' + e.message);
  }

  // G. Odoo.hnhotels.in expense category verification
  try {
    const catList = await fetch('https://hnhotels.in/api/spend?action=verify-pin&pin=15').then(r => r.json());
    const cats = catList.categories || [];
    out.odoo_hnhotels_in.expense_categories_visible_to_noor = cats.map(c => ({ id: c.id, label: c.label, backend: c.backend }));
    const cashierCats = cats.filter(c => c.id !== 1 && c.id !== 15);
    if (cashierCats.length < 10) out.warnings.push(`Noor sees only ${cashierCats.length} categories — expected ~13 (CASHIER_CATS minus 1,15)`);
  } catch (e) {
    out.issues.push('Could not list categories for Noor — expense flow blocked');
  }

  // Final verdict
  out.all_clear = out.issues.length === 0;
  out.summary = {
    blockers: out.issues.length,
    warnings: out.warnings.length,
    decision: out.all_clear ? 'GO — safe to build /ops/v2/' : 'BLOCKED — resolve issues first',
  };
  return json(out);
}

async function syncEmployeesFromHnhotels(apiKey, action) {
  // 1. Fetch source list: HE employees on odoo.hnhotels.in (via its admin API).
  //    Using PIN 5882 = Nihaf admin (trusted).
  const srcRes = await fetch('https://hnhotels.in/api/hr-admin?action=employees&pin=5882&brand=HE');
  if (!srcRes.ok) throw new Error(`hnhotels.in fetch failed: ${srcRes.status}`);
  const srcData = await srcRes.json();
  const srcEmps = (srcData.employees || []).filter(e => e.is_active !== 0 && e.is_active !== false);

  // 2. Discover HE company_id on test.hamzahotel.com — inferred from pos.config id=5
  //    (HE counter POS). That config's company_id IS the HE company on that instance.
  const cfg5 = await odoo(apiKey, 'pos.config', 'read', [[5]], { fields: ['id', 'name', 'company_id'] });
  if (!cfg5?.[0]?.company_id) throw new Error('pos.config id=5 not found — cannot infer HE company_id on test.hamzahotel.com');
  const heCompanyId = cfg5[0].company_id[0];
  const heCompanyName = cfg5[0].company_id[1];

  // 3. List ALL active hr.employee records on test.hamzahotel.com — dedup-by-name
  //    is GLOBAL (any company) so we never create a name-collision with anyone
  //    existing on the instance.
  const dstEmps = await odoo(apiKey, 'hr.employee', 'search_read',
    [[['active', '=', true]]],
    { fields: ['id', 'name', 'barcode', 'pin', 'company_id', 'job_title'] });

  const norm = (s) => (s || '').trim().toLowerCase();
  const existingByName = new Map();
  for (const e of dstEmps) existingByName.set(norm(e.name), e);

  // 4. Compute plan
  const toCreate = [];
  const toSkip = [];
  for (const e of srcEmps) {
    const key = norm(e.name);
    const existing = existingByName.get(key);
    if (existing) {
      toSkip.push({
        name: e.name, reason: 'already_exists_on_test',
        existing_id: existing.id, existing_company: existing.company_id?.[1] || 'none',
        existing_barcode: existing.barcode, existing_pin: existing.pin,
      });
    } else {
      toCreate.push({
        source: {
          hn_id: e.id, name: e.name, known_as: e.known_as,
          pin: e.pin, job: e.job_name, dept: e.department_name, phone: e.phone,
        },
      });
    }
  }

  const plan = {
    test_hamzahotel_com: {
      he_company_id: heCompanyId,
      he_company_name: heCompanyName,
      total_active_employees: dstEmps.length,
    },
    hnhotels_in: {
      he_active_employees: srcEmps.length,
    },
    summary: {
      will_create: toCreate.length,
      will_skip: toSkip.length,
    },
    to_create_preview: toCreate.map(t => ({
      name: t.source.name, pin: t.source.pin, job: t.source.job, dept: t.source.dept,
      will_set_barcode: t.source.pin ? `HNHE${t.source.pin}` : null,
    })),
    to_skip: toSkip,
  };

  if (action === 'discover' || action === 'sync-dry') {
    return json({ success: true, action, plan });
  }

  // 5. Execute — create each missing employee. No deletes, no updates to existing.
  const created = [];
  const errors = [];
  for (const t of toCreate) {
    const s = t.source;
    const vals = {
      name: s.name,
      company_id: heCompanyId,
      active: true,
    };
    // Barcode: prefix with HNHE so it's unique across brands if NCH ever
    // shares this instance. Pin: straight copy from hnhotels.in.
    if (s.pin) {
      vals.barcode = `HNHE${s.pin}`;
      vals.pin = String(s.pin);
    }
    if (s.job)   vals.job_title = s.job;
    if (s.phone) vals.work_phone = s.phone;

    try {
      const newId = await odoo(apiKey, 'hr.employee', 'create', [vals]);
      created.push({ id: newId, name: s.name, pin: s.pin, barcode: vals.barcode, job: s.job });
    } catch (e) {
      errors.push({ name: s.name, error: e.message });
    }
  }

  return json({
    success: errors.length === 0,
    action: 'sync',
    he_company_id: heCompanyId,
    created_count: created.length,
    skipped_count: toSkip.length,
    error_count: errors.length,
    created, errors,
    skipped_names: toSkip.map(s => s.name),
  });
}
