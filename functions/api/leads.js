// Leads CRM API — Hamza Express
//
// Source of truth: `leads` table (see schema-leads.sql).
// Legacy compat: wa_users/wa_sessions/wa_orders/wa_bookings still drive the derivations,
// but status/notes/tags/assignee/score are authoritative in the `leads` table.
//
// Endpoints (dispatched by method + ?action=):
//
//   GET  /api/leads                        → list (same shape as before, + new CRM fields)
//   GET  /api/leads?action=history&wa_id=  → full journey (messages + orders + bookings + audit)
//   GET  /api/leads?action=audit&wa_id=    → audit log for one lead
//   GET  /api/leads?action=segments        → saved segments
//   GET  /api/leads?action=counts          → stage/status/assignee/source counts for dashboard tiles
//
//   POST /api/leads                        → PATCH semantics: { wa_id, patch:{...}, actor }
//   POST /api/leads?action=update          → LEGACY compat: { waId, status, notes } (single-field)
//   POST /api/leads?action=bulk            → bulk patch: { wa_ids:[...], patch:{...}, actor }
//   POST /api/leads?action=sync            → refresh denormalized counters + stage (all leads or one)
//   POST /api/leads?action=segment-save    → create/update saved segment
//
// Roles (actor field): nihaf | basheer | faheem | mumtaz | naveen | system | webhook

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Fields a human/client is allowed to PATCH. Everything else is system-managed.
const PATCHABLE = new Set([
  'status', 'stage', 'manual_stage', 'score', 'tags', 'assignee', 'notes',
]);
const VALID_STATUS = new Set([
  'new', 'called', 'interested', 'not_interested', 'converted', 'follow_up', 'dnd',
]);
const VALID_STAGE = new Set([
  'new', 'engaged', 'payment_pending', 'booking_dropped', 'ordered', 'booked', 'lost',
]);
const VALID_ASSIGNEE = new Set([
  'basheer', 'faheem', 'mumtaz', 'nihaf', 'naveen', 'unassigned',
]);
const VALID_ACTOR = new Set([
  'nihaf', 'basheer', 'faheem', 'mumtaz', 'naveen', 'system', 'webhook', 'unknown',
]);

// ── Helpers ───────────────────────────────────────────────────────────────

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}
function bad(msg, status = 400) {
  return json({ success: false, error: msg }, status);
}
function sanitiseActor(a) {
  const v = (a || 'unknown').toLowerCase();
  return VALID_ACTOR.has(v) ? v : 'unknown';
}
function normalizeTags(t) {
  if (Array.isArray(t)) return JSON.stringify(t.map(String));
  if (typeof t === 'string') {
    try { const p = JSON.parse(t); return Array.isArray(p) ? JSON.stringify(p.map(String)) : '[]'; }
    catch { return '[]'; }
  }
  return '[]';
}
function toPublicLead(row) {
  return {
    id: row.id,
    waId: row.wa_id,
    phone: (row.phone || row.wa_id || '').replace(/^91/, ''),
    name: row.name || 'Unknown',
    stage: row.manual_stage || row.stage,           // manual override wins in UI
    computedStage: row.stage,
    stageOverridden: !!row.manual_stage,
    status: row.status,
    score: row.score || 0,
    tags: (() => { try { return JSON.parse(row.tags || '[]'); } catch { return []; } })(),
    assignee: row.assignee || null,
    notes: row.notes || '',
    source: row.source || 'unknown',
    sourceDetail: row.source_detail,
    adSourceId: row.ad_source_id,
    adHeadline: row.ad_headline || '',
    ctwaClid: row.ctwa_clid,
    isCTWA: !!row.ctwa_clid,
    totalOrders: row.total_orders || 0,
    totalSpent: Math.round(row.total_spent || 0),
    lastOrderAt: row.last_order_at,
    totalBookings: row.total_bookings || 0,
    lastBookingAt: row.last_booking_at,
    firstSeen: row.first_seen_at,
    lastSeen: row.last_seen_at,
    lastActivity: row.last_seen_at,                  // legacy alias
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Recompute denormalized fields for ONE lead from live wa_* tables.
async function syncOne(db, wa_id, actor = 'system') {
  const u = await db.prepare('SELECT * FROM wa_users WHERE wa_id = ?').bind(wa_id).first();
  if (!u) return null;
  const s = await db.prepare('SELECT * FROM wa_sessions WHERE wa_id = ?').bind(wa_id).first();

  // Aggregates
  const ordAgg = await db.prepare(
    `SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS total, MAX(created_at) AS last_at
       FROM wa_orders WHERE wa_id = ? AND payment_status = 'paid'`
  ).bind(wa_id).first();
  const bkAgg = await db.prepare(
    `SELECT COUNT(*) AS c, MAX(created_at) AS last_at
       FROM wa_bookings WHERE wa_id = ? AND status != 'cancelled'`
  ).bind(wa_id).first();
  const dropCt = await db.prepare(
    `SELECT COUNT(*) AS c FROM booking_attempts WHERE wa_id = ? AND completed = 0`
  ).bind(wa_id).first().catch(() => ({ c: 0 })); // table may not exist on fresh DBs

  // Computed stage
  let stage = 'new';
  if ((ordAgg.c || 0) > 0) stage = 'ordered';
  else if ((bkAgg.c || 0) > 0) stage = 'booked';
  else if (s && (s.state === 'awaiting_upi_payment' || s.state === 'awaiting_payment')) stage = 'payment_pending';
  else if (s && (s.state === 'awaiting_menu' || (s.cart_total || 0) > 0)) stage = 'engaged';
  else if ((dropCt.c || 0) > 0) stage = 'booking_dropped';

  const firstSeen = u.created_at;
  const lastSeen = s?.updated_at || u.last_active_at || u.created_at;

  // Upsert
  const existing = await db.prepare('SELECT id, stage FROM leads WHERE wa_id = ?').bind(wa_id).first();
  if (!existing) {
    await db.prepare(`
      INSERT INTO leads (wa_id, phone, name, stage, source, source_detail, ad_source_id, ad_headline,
        ctwa_clid, total_orders, total_spent, last_order_at, total_bookings, last_booking_at,
        first_seen_at, last_seen_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      wa_id, u.phone, u.name, stage,
      (s?.ctwa_clid ? 'ctwa_paid' : (s?.counter_source ? 'station_qr' : (u.first_source || 'direct'))),
      s?.counter_source || u.first_source || null,
      s?.ad_source_id || null,
      s?.ad_headline || null,
      s?.ctwa_clid || null,
      ordAgg.c || 0, ordAgg.total || 0, ordAgg.last_at || null,
      bkAgg.c || 0, bkAgg.last_at || null,
      firstSeen, lastSeen
    ).run();
    return 'inserted';
  }

  await db.prepare(`
    UPDATE leads SET
      phone = ?, name = COALESCE(?, name),
      stage = ?,
      total_orders = ?, total_spent = ?, last_order_at = ?,
      total_bookings = ?, last_booking_at = ?,
      last_seen_at = ?,
      updated_at = datetime('now')
    WHERE wa_id = ?
  `).bind(
    u.phone, u.name, stage,
    ordAgg.c || 0, ordAgg.total || 0, ordAgg.last_at || null,
    bkAgg.c || 0, bkAgg.last_at || null,
    lastSeen, wa_id
  ).run();

  if (existing.stage !== stage) {
    await db.prepare(
      `INSERT INTO lead_audit (lead_id, wa_id, actor, field, old_value, new_value)
         VALUES (?,?,?,?,?,?)`
    ).bind(existing.id, wa_id, actor, 'stage', existing.stage, stage).run();
  }
  return 'updated';
}

// ── Main router ───────────────────────────────────────────────────────────

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const db = context.env.DB;
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';
  const method = context.request.method;

  try {
    // ─── GET list ─────────────────────────────────────────────────────────
    if (method === 'GET' && (action === '' || action === 'list')) {
      const dateFrom = url.searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const showAll = url.searchParams.get('show') === 'all';
      const stageFilter = url.searchParams.get('stage');
      const statusFilter = url.searchParams.get('status');
      const sourceFilter = url.searchParams.get('source');
      const assigneeFilter = url.searchParams.get('assignee');
      const search = url.searchParams.get('q');  // phone or name search

      const where = [];
      const binds = [];
      if (!showAll) { where.push(`last_seen_at >= ?`); binds.push(dateFrom); }
      if (stageFilter)    { where.push(`COALESCE(manual_stage, stage) = ?`); binds.push(stageFilter); }
      if (statusFilter)   { where.push(`status = ?`);   binds.push(statusFilter); }
      if (sourceFilter)   { where.push(`source = ?`);   binds.push(sourceFilter); }
      if (assigneeFilter) {
        if (assigneeFilter === 'unassigned') where.push(`assignee IS NULL`);
        else { where.push(`assignee = ?`); binds.push(assigneeFilter); }
      }
      if (search) {
        where.push(`(phone LIKE ? OR name LIKE ? OR wa_id LIKE ?)`);
        const like = `%${search}%`;
        binds.push(like, like, like);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const leadsRes = await db.prepare(`
        SELECT * FROM leads
        ${whereSql}
        ORDER BY
          CASE WHEN source = 'ctwa_paid' THEN 0 ELSE 1 END,
          last_seen_at DESC
        LIMIT 1000
      `).bind(...binds).all();

      const leads = (leadsRes.results || []).map(toPublicLead);

      // Pull last-message preview + live order/booking status for each lead (batch)
      // One round-trip each, safe for <1000 leads.
      const waIds = leads.map(l => l.waId);
      let lastMsgMap = {}, lastOrderMap = {}, bookingMap = {};
      if (waIds.length) {
        const placeholders = waIds.map(() => '?').join(',');
        const msgs = await db.prepare(`
          SELECT wa_id, content, direction, created_at
            FROM (
              SELECT wa_id, content, direction, created_at,
                ROW_NUMBER() OVER (PARTITION BY wa_id ORDER BY created_at DESC) AS rn
                FROM wa_messages
               WHERE wa_id IN (${placeholders})
                 AND msg_type NOT IN ('lead_status','lead_notes','combo_mpm_debug')
            ) WHERE rn = 1
        `).bind(...waIds).all().catch(() => ({ results: [] }));
        for (const m of (msgs.results || [])) lastMsgMap[m.wa_id] = m;

        const ords = await db.prepare(`
          SELECT wa_id, order_code, total, payment_status
            FROM (
              SELECT wa_id, order_code, total, payment_status,
                ROW_NUMBER() OVER (PARTITION BY wa_id ORDER BY created_at DESC) AS rn
                FROM wa_orders
               WHERE wa_id IN (${placeholders})
            ) WHERE rn = 1
        `).bind(...waIds).all().catch(() => ({ results: [] }));
        for (const o of (ords.results || [])) lastOrderMap[o.wa_id] = o;

        const bks = await db.prepare(`
          SELECT wa_id, booking_date || ' ' || booking_time AS info, mumtaz_status
            FROM (
              SELECT wa_id, booking_date, booking_time, mumtaz_status,
                ROW_NUMBER() OVER (PARTITION BY wa_id ORDER BY created_at DESC) AS rn
                FROM wa_bookings WHERE wa_id IN (${placeholders}) AND status != 'cancelled'
            ) WHERE rn = 1
        `).bind(...waIds).all().catch(() => ({ results: [] }));
        for (const b of (bks.results || [])) bookingMap[b.wa_id] = b;
      }

      // Attach live bits + preserve legacy shape expected by /ops/leads/
      const enriched = leads.map(l => {
        const m = lastMsgMap[l.waId] || {};
        const o = lastOrderMap[l.waId] || {};
        const b = bookingMap[l.waId] || {};
        return {
          ...l,
          sessionState: null,          // kept for compat; not stored on leads
          funnelStage: l.stage,        // legacy alias
          leadStatus: l.status,        // legacy alias
          leadNotes: l.notes,          // legacy alias
          firstContact: l.firstSeen,   // legacy alias
          lastOrderCode: o.order_code || null,
          lastOrderTotal: o.total || null,
          bookingInfo: b.info || null,
          bookingStatus: b.mumtaz_status || null,
          lastMessage: m.content || '',
          lastMessageDir: m.direction || '',
          cartTotal: 0,                // kept for compat; live value on sessions
        };
      });

      // Global metrics (unchanged signature)
      const metrics = await db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM leads)                                         AS total_leads,
          (SELECT COUNT(*) FROM leads WHERE source = 'ctwa_paid')              AS ctwa_leads,
          (SELECT COUNT(*) FROM wa_orders WHERE payment_status = 'paid')       AS orders,
          (SELECT COALESCE(SUM(total),0) FROM wa_orders WHERE payment_status='paid') AS revenue,
          (SELECT COUNT(*) FROM wa_bookings WHERE status != 'cancelled')       AS bookings,
          (SELECT COUNT(*) FROM wa_bookings WHERE arrived = 1)                 AS arrived,
          (SELECT COUNT(*) FROM booking_attempts WHERE completed = 0)          AS booking_drops,
          (SELECT COUNT(*) FROM wa_sessions WHERE state IN
              ('awaiting_menu','awaiting_upi_payment','awaiting_payment'))     AS active_carts
      `).first().catch(() => ({}));

      const sources = await db.prepare(`
        SELECT COALESCE(source, 'direct') AS source, COUNT(*) AS count
          FROM leads GROUP BY source ORDER BY count DESC
      `).all();

      return json({
        success: true,
        leads: enriched,
        metrics: {
          totalLeads: metrics.total_leads || 0,
          ctwaLeads: metrics.ctwa_leads || 0,
          orders: metrics.orders || 0,
          revenue: Math.round(metrics.revenue || 0),
          bookings: metrics.bookings || 0,
          arrived: metrics.arrived || 0,
          bookingDrops: metrics.booking_drops || 0,
          activeCarts: metrics.active_carts || 0,
        },
        sources: sources.results || [],
      });
    }

    // ─── GET counts (for dashboard tiles / segment builder) ─────────────
    if (method === 'GET' && action === 'counts') {
      const byStage    = await db.prepare(`SELECT COALESCE(manual_stage, stage) AS k, COUNT(*) AS n FROM leads GROUP BY k`).all();
      const byStatus   = await db.prepare(`SELECT status AS k, COUNT(*) AS n FROM leads GROUP BY k`).all();
      const bySource   = await db.prepare(`SELECT source AS k, COUNT(*) AS n FROM leads GROUP BY k`).all();
      const byAssignee = await db.prepare(`SELECT COALESCE(assignee,'unassigned') AS k, COUNT(*) AS n FROM leads GROUP BY k`).all();
      return json({
        success: true,
        byStage:    Object.fromEntries((byStage.results    || []).map(r => [r.k, r.n])),
        byStatus:   Object.fromEntries((byStatus.results   || []).map(r => [r.k, r.n])),
        bySource:   Object.fromEntries((bySource.results   || []).map(r => [r.k, r.n])),
        byAssignee: Object.fromEntries((byAssignee.results || []).map(r => [r.k, r.n])),
      });
    }

    // ─── GET history (legacy — full journey) ────────────────────────────
    if (method === 'GET' && action === 'history') {
      const waId = url.searchParams.get('wa_id');
      if (!waId) return bad('wa_id required');

      const lead = await db.prepare('SELECT * FROM leads WHERE wa_id = ?').bind(waId).first();
      const user = await db.prepare('SELECT * FROM wa_users WHERE wa_id = ?').bind(waId).first();
      const session = await db.prepare('SELECT * FROM wa_sessions WHERE wa_id = ?').bind(waId).first();
      const messages = await db.prepare(
        `SELECT wa_id, direction, msg_type, content, created_at FROM wa_messages
          WHERE wa_id = ? ORDER BY created_at ASC LIMIT 100`
      ).bind(waId).all();
      const orders = await db.prepare(
        `SELECT order_code, items, total, payment_status, status, created_at FROM wa_orders
          WHERE wa_id = ? ORDER BY created_at DESC LIMIT 10`
      ).bind(waId).all();
      const bookings = await db.prepare(
        `SELECT booking_date, booking_time, party_size, guest_name, special_request, status, mumtaz_status, created_at
           FROM wa_bookings WHERE wa_id = ? ORDER BY created_at DESC LIMIT 10`
      ).bind(waId).all();
      const audit = await db.prepare(
        `SELECT actor, field, old_value, new_value, at FROM lead_audit
          WHERE wa_id = ? ORDER BY at DESC LIMIT 50`
      ).bind(waId).all();

      return json({
        success: true,
        waId,
        lead: lead ? toPublicLead(lead) : null,
        user: user || {},
        session: session || {},
        messages: messages.results || [],
        orders: orders.results || [],
        bookings: bookings.results || [],
        audit: audit.results || [],
      });
    }

    // ─── GET audit for one lead ─────────────────────────────────────────
    if (method === 'GET' && action === 'audit') {
      const waId = url.searchParams.get('wa_id');
      if (!waId) return bad('wa_id required');
      const rows = await db.prepare(
        `SELECT actor, field, old_value, new_value, at FROM lead_audit
          WHERE wa_id = ? ORDER BY at DESC LIMIT 200`
      ).bind(waId).all();
      return json({ success: true, audit: rows.results || [] });
    }

    // ─── GET segments ───────────────────────────────────────────────────
    if (method === 'GET' && action === 'segments') {
      const rows = await db.prepare(
        `SELECT id, name, description, query_json, created_by, created_at, updated_at
           FROM segments ORDER BY name ASC`
      ).all();
      return json({
        success: true,
        segments: (rows.results || []).map(r => ({
          id: r.id, name: r.name, description: r.description,
          query: (() => { try { return JSON.parse(r.query_json); } catch { return {}; } })(),
          createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
        })),
      });
    }

    // ─── POST PATCH (canonical write path) ──────────────────────────────
    if (method === 'POST' && action === '') {
      const body = await context.request.json().catch(() => ({}));
      const { wa_id, patch, actor } = body;
      if (!wa_id) return bad('wa_id required');
      if (!patch || typeof patch !== 'object') return bad('patch object required');
      return await applyPatch(db, wa_id, patch, sanitiseActor(actor));
    }

    // ─── POST legacy update (single-field compat with old dashboard) ────
    if (method === 'POST' && action === 'update') {
      const body = await context.request.json().catch(() => ({}));
      const { waId, wa_id, status, notes, actor } = body;
      const id = waId || wa_id;
      if (!id) return bad('waId required');
      const patch = {};
      if (status !== undefined) patch.status = status;
      if (notes !== undefined) patch.notes = notes;
      if (!Object.keys(patch).length) return bad('nothing to update');
      return await applyPatch(db, id, patch, sanitiseActor(actor));
    }

    // ─── POST bulk ──────────────────────────────────────────────────────
    if (method === 'POST' && action === 'bulk') {
      const body = await context.request.json().catch(() => ({}));
      const { wa_ids, patch, actor } = body;
      if (!Array.isArray(wa_ids) || !wa_ids.length) return bad('wa_ids[] required');
      if (!patch || typeof patch !== 'object') return bad('patch object required');
      if (wa_ids.length > 500) return bad('bulk limited to 500 leads per call');
      const a = sanitiseActor(actor);
      let ok = 0, failed = [];
      for (const id of wa_ids) {
        try {
          const r = await applyPatchInternal(db, id, patch, a);
          if (r.ok) ok++; else failed.push({ wa_id: id, reason: r.reason });
        } catch (e) {
          failed.push({ wa_id: id, reason: e.message });
        }
      }
      return json({ success: true, updated: ok, failed });
    }

    // ─── POST sync (refresh denormalized fields) ────────────────────────
    if (method === 'POST' && action === 'sync') {
      const body = await context.request.json().catch(() => ({}));
      const { wa_id, actor } = body;
      const a = sanitiseActor(actor || 'system');
      if (wa_id) {
        const r = await syncOne(db, wa_id, a);
        return json({ success: true, result: r });
      }
      // Full sync — iterate over all wa_users
      const users = await db.prepare('SELECT wa_id FROM wa_users').all();
      let inserted = 0, updated = 0;
      for (const u of (users.results || [])) {
        const r = await syncOne(db, u.wa_id, a);
        if (r === 'inserted') inserted++;
        else if (r === 'updated') updated++;
      }
      return json({ success: true, scanned: (users.results || []).length, inserted, updated });
    }

    // ─── POST save segment ──────────────────────────────────────────────
    if (method === 'POST' && action === 'segment-save') {
      const body = await context.request.json().catch(() => ({}));
      const { name, description, query, actor } = body;
      if (!name || !query) return bad('name and query required');
      const a = sanitiseActor(actor);
      const existing = await db.prepare('SELECT id FROM segments WHERE name = ?').bind(name).first();
      if (existing) {
        await db.prepare(
          `UPDATE segments SET description = ?, query_json = ?, updated_at = datetime('now')
             WHERE id = ?`
        ).bind(description || '', JSON.stringify(query), existing.id).run();
        return json({ success: true, id: existing.id, updated: true });
      }
      const r = await db.prepare(
        `INSERT INTO segments (name, description, query_json, created_by) VALUES (?,?,?,?)`
      ).bind(name, description || '', JSON.stringify(query), a).run();
      return json({ success: true, id: r.meta?.last_row_id, created: true });
    }

    return bad('Unknown action');
  } catch (err) {
    return json({ success: false, error: err.message, stack: err.stack }, 500);
  }
}

// ── Patch implementation (used by POST and bulk) ─────────────────────────

async function applyPatch(db, wa_id, patch, actor) {
  const r = await applyPatchInternal(db, wa_id, patch, actor);
  if (r.ok) return json({ success: true, lead: r.lead });
  return json({ success: false, error: r.reason }, 400);
}

async function applyPatchInternal(db, wa_id, patch, actor) {
  // Ensure lead exists — if not, sync it from wa_users (for leads created before migration)
  let existing = await db.prepare('SELECT * FROM leads WHERE wa_id = ?').bind(wa_id).first();
  if (!existing) {
    await syncOne(db, wa_id, 'system');
    existing = await db.prepare('SELECT * FROM leads WHERE wa_id = ?').bind(wa_id).first();
    if (!existing) return { ok: false, reason: 'lead not found and wa_user not found' };
  }

  // Build safe SET clause
  const sets = [];
  const binds = [];
  const auditRows = [];

  for (const [k, rawV] of Object.entries(patch)) {
    if (!PATCHABLE.has(k)) continue;
    let v = rawV;

    // Validation + normalisation
    if (k === 'status') {
      if (v && !VALID_STATUS.has(v)) return { ok: false, reason: `invalid status: ${v}` };
    }
    if (k === 'stage' || k === 'manual_stage') {
      if (v && !VALID_STAGE.has(v)) return { ok: false, reason: `invalid stage: ${v}` };
    }
    if (k === 'assignee') {
      if (v === null || v === '' || v === 'unassigned') v = null;
      else if (!VALID_ASSIGNEE.has(v)) return { ok: false, reason: `invalid assignee: ${v}` };
    }
    if (k === 'score') {
      v = parseInt(v, 10);
      if (isNaN(v) || v < 0 || v > 100) return { ok: false, reason: 'score must be 0-100' };
    }
    if (k === 'tags') v = normalizeTags(v);

    const oldV = existing[k] ?? null;
    const newV = v ?? null;
    // Skip no-op
    if (String(oldV) === String(newV)) continue;

    sets.push(`${k} = ?`);
    binds.push(newV);
    auditRows.push([existing.id, wa_id, actor, k, oldV == null ? null : String(oldV), newV == null ? null : String(newV)]);
  }

  if (!sets.length) return { ok: true, lead: toPublicLead(existing), noop: true };

  sets.push(`updated_at = datetime('now')`);
  binds.push(wa_id);
  await db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE wa_id = ?`).bind(...binds).run();

  // Audit — one row per changed field
  for (const row of auditRows) {
    await db.prepare(
      `INSERT INTO lead_audit (lead_id, wa_id, actor, field, old_value, new_value) VALUES (?,?,?,?,?,?)`
    ).bind(...row).run();
  }

  const updated = await db.prepare('SELECT * FROM leads WHERE wa_id = ?').bind(wa_id).first();
  return { ok: true, lead: toPublicLead(updated) };
}
