// HE cockpit-export — read-only feed for HN Money Cockpit aggregator.
//
// Called server-to-server from hnhotels.in/api/money. Auth via shared
// COCKPIT_TOKEN env var.
//
// Surfaces every he_v2_shift_expenses row in an IST date window. Since HE
// captures `hnhotels_expense_id` from the central /api/spend response,
// orphans (Odoo dual-write failed) are explicit here: hnhotels_expense_id
// IS NULL.
//
// Read-only. No writes. CORS off.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function todayIST() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

// HE stores recorded_at via istISO() helper in v2.js — format like
// '2026-04-24T00:59:14' (no Z, already IST local). So we filter on the IST
// day directly by string prefix.
export async function onRequest(context) {
  const { request, env } = context;

  const expected = env.COCKPIT_TOKEN;
  if (!expected) return json({ success: false, error: 'COCKPIT_TOKEN not set on HE' }, 500);
  const got = request.headers.get('x-cockpit-token') || '';
  if (got !== expected) return json({ success: false, error: 'Unauthorized' }, 401);

  if (!env.DB) return json({ success: false, error: 'DB not configured' }, 500);

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || todayIST();
  const to = url.searchParams.get('to') || todayIST();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return json({ success: false, error: 'from/to must be YYYY-MM-DD' }, 400);
  }

  // HE recorded_at is stored as IST-local ISO (no Z). Compare as strings
  // with a prefix range covering the full IST day span.
  const startStr = `${from}T00:00:00`;
  const toPlus1 = new Date(Date.parse(`${to}T00:00:00.000Z`) + 86400000)
    .toISOString().slice(0, 10);
  const endStr = `${toPlus1}T00:00:00`;

  try {
    const rows = await env.DB.prepare(
      `SELECT id, shift_id, recorded_at, recorded_by_pin, recorded_by_name,
              category_id, category_label, product_id, product_name,
              vendor_id, vendor_name, amount, payment_method,
              hnhotels_expense_id, notes
         FROM he_v2_shift_expenses
        WHERE recorded_at >= ? AND recorded_at < ?
        ORDER BY recorded_at DESC`
    ).bind(startStr, endStr).all();

    const normalized = (rows.results || []).map((r) => ({
      source: 'HE-Outlet',
      brand: 'HE',
      kind: 'Expense',
      state: r.hnhotels_expense_id ? 'paid' : 'paid-orphan', // sync failed = orphan
      payment_method: r.payment_method || 'cash',
      source_id: r.id,
      odoo_id: r.hnhotels_expense_id || null,
      recorded_at: r.recorded_at,           // IST-local ISO string (no Z)
      ist_date: (r.recorded_at || '').slice(0, 10),
      amount: r.amount,
      category_code: null,                  // HE uses numeric cat_id
      category_id: r.category_id,
      category_label: r.category_label || null,
      vendor_id: r.vendor_id || null,
      vendor_name: r.vendor_name || null,
      item: r.product_name || null,
      description: r.notes || '',
      recorded_by_pin: r.recorded_by_pin || null,
      recorded_by_name: r.recorded_by_name || null,
      shift_id: r.shift_id || null,
    }));

    // ── Phase 3: optional cash_summary for /ops/money/ Cash Position card ──
    let cash_summary = null;
    if ((url.searchParams.get('include') || '').includes('cash_summary')) {
      try {
        const todayDate = todayIST();
        const todayStr = `${todayDate}T00:00:00`;
        // Today's expenses out from HE shift expenses
        const expRow = await env.DB.prepare(
          `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n
             FROM he_v2_shift_expenses
            WHERE recorded_at >= ?`
        ).bind(todayStr).first().catch(() => ({ total: 0, n: 0 }));

        // In-transit cash collections (cashier handed off to collector but not deposited)
        const inTransitRow = await env.DB.prepare(
          `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n,
                  GROUP_CONCAT(collector_name || ': ' || amount, ', ') AS breakdown
             FROM he_v2_cash_collections
            WHERE destination NOT IN ('deposited', 'naveen_received')`
        ).first().catch(() => ({ total: 0, n: 0, breakdown: null }));

        cash_summary = {
          today_expenses_out: expRow.total || 0,
          today_expenses_count: expRow.n || 0,
          in_transit_total: inTransitRow.total || 0,
          in_transit_count: inTransitRow.n || 0,
          in_transit_breakdown: inTransitRow.breakdown || '',
        };
      } catch (e) {
        cash_summary = { error: e.message };
      }
    }

    return json({
      success: true,
      brand: 'HE',
      from, to,
      count: normalized.length,
      total: normalized.reduce((s, r) => s + (r.amount || 0), 0),
      orphan_count: normalized.filter((r) => r.state === 'paid-orphan').length,
      rows: normalized,
      cash_summary,
    });
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}
