// /api/inbox — Ops inbox endpoint for human-handoff conversations.
//
// Phase 3b of message-architecture rollout. See BUILD-PLAN-MESSAGE-ARCH.md.
//
// Auth model: Ops PIN (4-digit, stored in HR hr_employees table). Every call
// includes { pin } in the body (POST) or ?pin=XXXX (GET). We validate against
// the HIRING_DB binding cross-DB — hr_employees.pin is unique.
//
// Actions:
//   GET  ?action=whoami&pin=XXXX                     → {ok, hr_id, name, role, phone}
//   GET  ?action=list&pin=XXXX                       → list paused/escalated convos
//   GET  ?action=thread&pin=XXXX&wa=91xxxxxxxxxx     → full message history
//   GET  ?action=stats&pin=XXXX                      → {open_escalations, claimed_by_me, ...}
//   POST {action:'reply',   pin, wa, text}           → send via Meta, claim, log
//   POST {action:'release', pin, wa, note}           → resume bot, resolve escalation
//   POST {action:'tick',    pin}                     → run checkCascadeTimers (poll hook)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const url = new URL(request.url);
  const method = request.method;
  const action = url.searchParams.get('action') || (await safeJsonAction(request));
  const pin = url.searchParams.get('pin') || (await safeJsonField(request, 'pin'));

  // Every action requires a valid Ops PIN
  const agent = await validateOpsPin(env, pin);
  if (!agent) return json({ ok: false, error: 'invalid_pin' }, 401);

  try {
    if (action === 'whoami') return json({ ok: true, agent });
    if (action === 'list')   return json(await listConversations(env, agent));
    if (action === 'thread') return json(await loadThread(env, agent, url.searchParams.get('wa')));
    if (action === 'stats')  return json(await computeStats(env, agent));
    if (method === 'POST') {
      const body = await safeJson(request);
      if (action === 'reply')   return json(await agentReply(env, agent, body));
      if (action === 'release') return json(await agentRelease(env, agent, body));
      if (action === 'tick')    return json(await runTick(env));
      if (action === 'escalate') return json(await manualEscalate(env, agent, body));
    }
    return json({ ok: false, error: 'unknown_action', action }, 400);
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: String(e?.message || e) }, 500);
  }
}

// ═══════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════

async function validateOpsPin(env, pin) {
  if (!pin || !/^\d{1,6}$/.test(String(pin))) return null;
  if (!env.HIRING_DB) return null;
  try {
    const row = await env.HIRING_DB.prepare(
      `SELECT id, name, phone, brand_label, job_name, is_active
         FROM hr_employees
        WHERE pin = ? AND is_active = 1
        LIMIT 1`
    ).bind(String(pin)).first();
    if (!row) return null;
    // Admin role = sees all. Tier agents (Faheem/Basheer/Nihaf) see all too for now.
    // Refine later based on brand_label and role.
    const hrId = row.id;
    const role = hrId === 29 ? 'admin' // Nihaf
               : hrId === 33 ? 'manager' // Basheer
               : hrId === 35 ? 'agent'   // Faheem
               : (row.brand_label === 'HQ' ? 'manager' : 'agent');
    return { hr_id: hrId, name: row.name, phone: row.phone, role };
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// DATA: LIST, THREAD, STATS
// ═══════════════════════════════════════════════════════════════════

async function listConversations(env, agent) {
  const db = env.DB;
  // All paused sessions + recent 7d unclaimed escalations, joined with user
  const rows = await db.prepare(
    `SELECT s.wa_id,
            s.bot_paused,
            s.paused_until,
            s.paused_reason,
            s.assigned_to,
            s.updated_at,
            u.name AS customer_name,
            u.phone AS customer_phone,
            u.total_orders,
            e.id   AS escalation_id,
            e.tier AS escalation_tier,
            e.status AS escalation_status,
            e.reason AS escalation_reason,
            e.claimed_by AS claimed_by,
            e.created_at AS escalation_at,
            (SELECT content FROM wa_messages
               WHERE wa_id = s.wa_id
               ORDER BY id DESC LIMIT 1) AS last_msg,
            (SELECT direction FROM wa_messages
               WHERE wa_id = s.wa_id
               ORDER BY id DESC LIMIT 1) AS last_dir,
            (SELECT created_at FROM wa_messages
               WHERE wa_id = s.wa_id
               ORDER BY id DESC LIMIT 1) AS last_at
       FROM wa_sessions s
       LEFT JOIN wa_users u ON u.wa_id = s.wa_id
       LEFT JOIN escalations e ON e.wa_id = s.wa_id AND e.status IN ('active','claimed')
      WHERE s.bot_paused = 1
         OR (e.id IS NOT NULL AND e.status IN ('active','claimed'))
      ORDER BY
        CASE WHEN e.status = 'active' THEN 0 WHEN e.status = 'claimed' THEN 1 ELSE 2 END,
        COALESCE(e.created_at, s.updated_at) DESC
      LIMIT 100`
  ).all();
  return { ok: true, conversations: rows.results || [] };
}

async function loadThread(env, agent, waId) {
  if (!waId) return { ok: false, error: 'missing_wa' };
  const db = env.DB;
  const user = await db.prepare('SELECT * FROM wa_users WHERE wa_id = ?').bind(waId).first();
  const session = await db.prepare('SELECT * FROM wa_sessions WHERE wa_id = ?').bind(waId).first();
  const messages = await db.prepare(
    `SELECT id, direction, msg_type, content, intent, created_at
       FROM wa_messages
      WHERE wa_id = ?
      ORDER BY id DESC LIMIT 80`
  ).bind(waId).all();
  const escalation = await db.prepare(
    `SELECT id, reason, tier, status, claimed_by, claimed_at, created_at, resolved_at
       FROM escalations
      WHERE wa_id = ?
      ORDER BY id DESC LIMIT 1`
  ).bind(waId).first();
  const actions = await db.prepare(
    `SELECT hr_id, action, details, created_at
       FROM agent_actions
      WHERE wa_id = ?
      ORDER BY id DESC LIMIT 20`
  ).bind(waId).all();
  return {
    ok: true,
    user: user || { wa_id: waId },
    session: session || null,
    escalation: escalation || null,
    messages: (messages.results || []).reverse(),
    actions: actions.results || [],
  };
}

async function computeStats(env, agent) {
  const db = env.DB;
  try {
    const open = await db.prepare(
      `SELECT COUNT(*) AS n FROM escalations WHERE status = 'active'`
    ).first();
    const claimedByMe = await db.prepare(
      `SELECT COUNT(*) AS n FROM escalations
        WHERE status = 'claimed' AND claimed_by = ?`
    ).bind(agent.hr_id).first();
    const pausedTotal = await db.prepare(
      `SELECT COUNT(*) AS n FROM wa_sessions WHERE bot_paused = 1`
    ).first();
    const today = new Date().toISOString().slice(0, 10);
    const resolvedToday = await db.prepare(
      `SELECT COUNT(*) AS n FROM escalations
        WHERE status = 'resolved' AND resolved_at LIKE ?`
    ).bind(today + '%').first();
    return {
      ok: true,
      stats: {
        open_escalations: open?.n || 0,
        claimed_by_me: claimedByMe?.n || 0,
        paused_total: pausedTotal?.n || 0,
        resolved_today: resolvedToday?.n || 0,
      },
    };
  } catch (e) {
    return { ok: true, stats: { open_escalations: 0, claimed_by_me: 0, paused_total: 0, resolved_today: 0 } };
  }
}

// ═══════════════════════════════════════════════════════════════════
// ACTIONS: REPLY, RELEASE, TICK, ESCALATE
// ═══════════════════════════════════════════════════════════════════

// Send a message to the customer AS THE HE WABA (not from the agent's personal
// number). The customer sees the reply in their existing Hamza Express thread.
async function agentReply(env, agent, body) {
  const waId = body?.wa;
  const text = (body?.text || '').trim();
  if (!waId) return { ok: false, error: 'missing_wa' };
  if (!text) return { ok: false, error: 'empty_text' };
  if (text.length > 4000) return { ok: false, error: 'text_too_long' };
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) return { ok: false, error: 'no_meta_creds' };

  // Send via Meta
  let metaResp = null;
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: waId,
          type: 'text',
          text: { body: text, preview_url: true },
        }),
      }
    );
    metaResp = await resp.json();
    if (!resp.ok || metaResp.error) {
      return { ok: false, error: 'meta_send_failed', detail: metaResp };
    }
  } catch (e) {
    return { ok: false, error: 'meta_network', detail: String(e) };
  }

  const wamid = metaResp?.messages?.[0]?.id || null;
  const db = env.DB;

  // Log outbound message with intent='agent_reply' and the hr_id in content_json for audit
  try {
    await db.prepare(
      `INSERT INTO wa_messages
         (wa_id, direction, msg_type, content, wa_message_id, content_json, intent, created_at)
       VALUES (?, 'out', 'text', ?, ?, ?, ?, ?)`
    ).bind(
      waId, text, wamid,
      JSON.stringify({ agent_hr_id: agent.hr_id, agent_name: agent.name }),
      'agent_reply',
      new Date().toISOString()
    ).run();
  } catch (e) { /* swallow */ }

  // Claim the active escalation (first reply wins, stops cascade)
  try {
    await db.prepare(
      `UPDATE escalations
          SET status = 'claimed', claimed_by = ?, claimed_at = ?
        WHERE wa_id = ? AND status = 'active'`
    ).bind(agent.hr_id, new Date().toISOString(), waId).run();
  } catch (e) { /* swallow */ }

  // Update assigned_to on session
  try {
    await db.prepare(
      `UPDATE wa_sessions SET assigned_to = ? WHERE wa_id = ?`
    ).bind(agent.hr_id, waId).run();
  } catch (e) { /* swallow */ }

  // Audit log
  try {
    await db.prepare(
      `INSERT INTO agent_actions (wa_id, hr_id, action, details, created_at)
       VALUES (?, ?, 'reply', ?, ?)`
    ).bind(waId, agent.hr_id, text.slice(0, 500), new Date().toISOString()).run();
  } catch (e) { /* swallow */ }

  return { ok: true, sent: true, wamid, claimed_by: agent.hr_id };
}

// Release: resume the bot for this conversation, mark escalation resolved.
async function agentRelease(env, agent, body) {
  const waId = body?.wa;
  const note = (body?.note || '').slice(0, 500);
  if (!waId) return { ok: false, error: 'missing_wa' };
  const db = env.DB;
  try {
    await db.prepare(
      `UPDATE wa_sessions
          SET bot_paused = 0, paused_until = NULL, paused_reason = NULL, assigned_to = NULL
        WHERE wa_id = ?`
    ).bind(waId).run();
  } catch (e) { /* swallow */ }
  try {
    await db.prepare(
      `UPDATE escalations
          SET status = 'resolved', resolved_at = ?
        WHERE wa_id = ? AND status IN ('active','claimed')`
    ).bind(new Date().toISOString(), waId).run();
  } catch (e) { /* swallow */ }
  try {
    await db.prepare(
      `INSERT INTO agent_actions (wa_id, hr_id, action, details, created_at)
       VALUES (?, ?, 'release', ?, ?)`
    ).bind(waId, agent.hr_id, note, new Date().toISOString()).run();
  } catch (e) { /* swallow */ }
  return { ok: true, released: true };
}

// Tick: advance overdue escalations. Called from the inbox page every 30s
// while it's open. This is what keeps the cascade timer honest outside
// of webhook traffic.
async function runTick(env) {
  const db = env.DB;
  const nowIso = new Date().toISOString().slice(0, 19);
  let overdue = [];
  try {
    const q = await db.prepare(
      `SELECT id, wa_id, reason, tier, last_pinged_tier, context_snapshot
         FROM escalations
        WHERE status = 'active' AND next_escalate_at <= ?
        ORDER BY id ASC LIMIT 10`
    ).bind(nowIso).all();
    overdue = q.results || [];
  } catch (e) { return { ok: true, ticked: 0 }; }

  const CASCADE = [
    { tier: 1, hr_id: 35, name: 'Faheem',  phone: '919149967411' },
    { tier: 2, hr_id: 33, name: 'Basheer', phone: '919061906916' },
    { tier: 3, hr_id: 29, name: 'Nihaf',   phone: '917010426808' },
  ];

  let ticked = 0;
  for (const row of overdue) {
    const nextTier = Math.min((row.last_pinged_tier || row.tier || 1) + 1, 3);
    const target = CASCADE.find(t => t.tier === nextTier);
    if (!target) continue;
    let ctx = {};
    try { ctx = JSON.parse(row.context_snapshot || '{}'); } catch (_) {}
    await sendStaffPing(env, target, row.wa_id, ctx.customerName, row.reason, ctx.recentLines || []);
    const nextAt = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 19);
    try {
      await db.prepare(
        `UPDATE escalations SET tier = ?, last_pinged_tier = ?, next_escalate_at = ? WHERE id = ?`
      ).bind(nextTier, nextTier, nextAt, row.id).run();
    } catch (e) { /* swallow */ }
    ticked++;
  }
  return { ok: true, ticked };
}

// Manual escalation trigger (used for testing or forced handoff from inbox)
async function manualEscalate(env, agent, body) {
  const waId = body?.wa;
  const reason = (body?.reason || 'manual_escalation').slice(0, 100);
  if (!waId) return { ok: false, error: 'missing_wa' };
  const db = env.DB;

  // Check for existing active
  try {
    const existing = await db.prepare(
      `SELECT id FROM escalations WHERE wa_id = ? AND status = 'active' LIMIT 1`
    ).bind(waId).first();
    if (existing) return { ok: true, existing: true, escalation_id: existing.id };
  } catch (e) { /* swallow */ }

  // Get customer info
  const user = await db.prepare('SELECT name FROM wa_users WHERE wa_id = ?').bind(waId).first();
  const customerName = user?.name || null;

  // Pull last 5 inbound for context
  let recentLines = [];
  try {
    const msgs = await db.prepare(
      `SELECT content, msg_type FROM wa_messages
        WHERE wa_id = ? AND direction = 'in'
        ORDER BY id DESC LIMIT 5`
    ).bind(waId).all();
    recentLines = (msgs.results || []).reverse().map(m => (m.content || `[${m.msg_type}]`).slice(0, 120));
  } catch (e) { /* swallow */ }

  // Insert escalation row
  const nextAt = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 19);
  const now = new Date().toISOString().slice(0, 19);
  let escalationId = null;
  try {
    const res = await db.prepare(
      `INSERT INTO escalations
         (wa_id, reason, tier, status, last_pinged_tier, next_escalate_at, created_at, context_snapshot)
       VALUES (?, ?, 1, 'active', 1, ?, ?, ?)`
    ).bind(waId, reason, nextAt, now, JSON.stringify({ customerName, recentLines })).run();
    escalationId = res.meta?.last_row_id || null;
  } catch (e) { /* swallow */ }

  // Pause bot
  const pausedUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 19);
  try {
    await db.prepare(
      `UPDATE wa_sessions
          SET bot_paused = 1, paused_until = ?, paused_reason = ?, assigned_to = 35
        WHERE wa_id = ?`
    ).bind(pausedUntil, reason, waId).run();
  } catch (e) { /* swallow */ }

  // Ping tier 1 (Faheem)
  const target = { tier: 1, hr_id: 35, name: 'Faheem', phone: '919149967411' };
  await sendStaffPing(env, target, waId, customerName, reason, recentLines);

  return { ok: true, escalation_id: escalationId, tier: 1, target_name: 'Faheem' };
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

async function sendStaffPing(env, target, customerWaId, customerName, reason, recentLines) {
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) return { sent: false };
  const displayName = customerName || 'Customer';
  const phoneDisplay = customerWaId.length > 10
    ? `+${customerWaId.slice(0, 2)} ${customerWaId.slice(2, 7)} ${customerWaId.slice(7)}`
    : customerWaId;
  const tailLines = (recentLines || []).slice(-3).map(l => `  • ${l}`).join('\n') || '  (no recent messages)';
  const inboxUrl = `https://hamzaexpress.in/ops/inbox/?wa=${encodeURIComponent(customerWaId)}`;
  const body =
    `🔔 New handoff — tier ${target.tier}\n\n` +
    `*${displayName}* (${phoneDisplay})\n` +
    `Reason: *${reason}*\n\n` +
    `Recent:\n${tailLines}\n\n` +
    `Reply in Ops inbox:\n${inboxUrl}\n\n` +
    `(Bot paused 24h. First agent to reply claims the case.)`;
  try {
    await fetch(
      `https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: target.phone, type: 'text',
          text: { body, preview_url: true },
        }),
      }
    );
    return { sent: true };
  } catch (e) {
    return { sent: false, error: String(e) };
  }
}

async function safeJson(req) {
  try { return await req.json(); } catch (_) { return {}; }
}

async function safeJsonAction(req) {
  if (req.method !== 'POST') return null;
  try {
    const clone = req.clone();
    const b = await clone.json();
    return b?.action || null;
  } catch (_) { return null; }
}

async function safeJsonField(req, field) {
  if (req.method !== 'POST') return null;
  try {
    const clone = req.clone();
    const b = await clone.json();
    return b?.[field] || null;
  } catch (_) { return null; }
}
