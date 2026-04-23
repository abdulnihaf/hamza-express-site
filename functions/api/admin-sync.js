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
    return json({ error: `Unknown action: ${action}. Use discover|sync-dry|sync` }, 400);
  } catch (e) {
    return json({ error: e.message, stack: e.stack }, 500);
  }
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
