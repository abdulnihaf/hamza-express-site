// Lead Tracking API for Meta CTWA Campaign
// GET /api/leads — all leads with funnel stage, filterable by date and status
// POST /api/leads?action=update — update lead status (called, converted, notes)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const db = context.env.DB;
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'list';

  try {
    if (action === 'list' && context.request.method === 'GET') {
      const dateFrom = url.searchParams.get('from') || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const dateTo = url.searchParams.get('to') || new Date().toISOString().slice(0, 10);

      // Get ALL WhatsApp users with their journey stage
      const leads = await db.prepare(`
        SELECT
          u.wa_id,
          u.name,
          u.total_orders,
          u.total_spent,
          u.first_source,
          u.created_at as first_contact,
          s.state as session_state,
          s.ctwa_clid,
          s.ad_source,
          s.ad_headline,
          s.counter_source,
          s.cart_total,
          s.updated_at as last_activity,
          -- Funnel stage
          CASE
            WHEN EXISTS (SELECT 1 FROM wa_orders WHERE wa_id = u.wa_id AND payment_status = 'paid' AND created_at >= ?) THEN 'ordered'
            WHEN EXISTS (SELECT 1 FROM wa_bookings WHERE wa_id = u.wa_id AND status != 'cancelled' AND created_at >= ?) THEN 'booked'
            WHEN s.state = 'awaiting_upi_payment' OR s.state = 'awaiting_payment' THEN 'payment_pending'
            WHEN s.state = 'awaiting_menu' OR s.cart_total > 0 THEN 'browsing_menu'
            WHEN EXISTS (SELECT 1 FROM booking_attempts WHERE wa_id = u.wa_id AND completed = 0 AND started_at >= ?) THEN 'booking_dropped'
            WHEN s.state = 'idle' AND u.total_orders = 0 THEN 'messaged_only'
            ELSE 'messaged_only'
          END as funnel_stage,
          -- Lead status (for manual tracking)
          COALESCE(
            (SELECT content FROM wa_messages WHERE wa_id = u.wa_id AND msg_type = 'lead_status' ORDER BY created_at DESC LIMIT 1),
            'new'
          ) as lead_status,
          COALESCE(
            (SELECT content FROM wa_messages WHERE wa_id = u.wa_id AND msg_type = 'lead_notes' ORDER BY created_at DESC LIMIT 1),
            ''
          ) as lead_notes,
          -- Last order info
          (SELECT order_code FROM wa_orders WHERE wa_id = u.wa_id ORDER BY created_at DESC LIMIT 1) as last_order_code,
          (SELECT total FROM wa_orders WHERE wa_id = u.wa_id AND payment_status = 'paid' ORDER BY created_at DESC LIMIT 1) as last_order_total,
          -- Booking info
          (SELECT booking_date || ' ' || booking_time FROM wa_bookings WHERE wa_id = u.wa_id AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1) as booking_info,
          (SELECT mumtaz_status FROM wa_bookings WHERE wa_id = u.wa_id ORDER BY created_at DESC LIMIT 1) as booking_status
        FROM wa_users u
        LEFT JOIN wa_sessions s ON u.wa_id = s.wa_id
        WHERE u.created_at >= ? AND u.created_at <= ?
        ORDER BY
          CASE
            WHEN s.ctwa_clid IS NOT NULL THEN 0
            ELSE 1
          END,
          u.created_at DESC
      `).bind(dateFrom, dateFrom, dateFrom, dateFrom, dateTo + 'T23:59:59').all();

      // Funnel metrics
      const metrics = await db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM wa_users WHERE created_at >= ? AND created_at <= ?) as total_leads,
          (SELECT COUNT(*) FROM wa_sessions WHERE ctwa_clid IS NOT NULL AND updated_at >= ?) as ctwa_leads,
          (SELECT COUNT(*) FROM wa_orders WHERE payment_status = 'paid' AND created_at >= ? AND created_at <= ?) as orders,
          (SELECT SUM(total) FROM wa_orders WHERE payment_status = 'paid' AND created_at >= ? AND created_at <= ?) as revenue,
          (SELECT COUNT(*) FROM wa_bookings WHERE status != 'cancelled' AND created_at >= ? AND created_at <= ?) as bookings,
          (SELECT COUNT(*) FROM wa_bookings WHERE arrived = 1 AND created_at >= ? AND created_at <= ?) as arrived,
          (SELECT COUNT(*) FROM booking_attempts WHERE completed = 0 AND started_at >= ? AND started_at <= ?) as booking_drops,
          (SELECT COUNT(*) FROM wa_sessions WHERE state IN ('awaiting_menu','awaiting_upi_payment','awaiting_payment') AND updated_at >= ?) as active_carts
      `).bind(
        dateFrom, dateTo + 'T23:59:59',
        dateFrom,
        dateFrom, dateTo + 'T23:59:59',
        dateFrom, dateTo + 'T23:59:59',
        dateFrom, dateTo + 'T23:59:59',
        dateFrom, dateTo + 'T23:59:59',
        dateFrom, dateTo + 'T23:59:59',
        dateFrom
      ).first();

      // Source breakdown
      const sources = await db.prepare(`
        SELECT
          COALESCE(first_source, 'direct') as source,
          COUNT(*) as count
        FROM wa_users
        WHERE created_at >= ? AND created_at <= ?
        GROUP BY first_source
        ORDER BY count DESC
      `).bind(dateFrom, dateTo + 'T23:59:59').all();

      return new Response(JSON.stringify({
        success: true,
        leads: (leads.results || []).map(l => ({
          waId: l.wa_id,
          phone: l.wa_id ? l.wa_id.replace(/^91/, '') : '',
          name: l.name || 'Unknown',
          totalOrders: l.total_orders || 0,
          totalSpent: Math.round(l.total_spent || 0),
          source: l.first_source || 'direct',
          isCTWA: !!l.ctwa_clid,
          adHeadline: l.ad_headline || '',
          firstContact: l.first_contact,
          lastActivity: l.last_activity,
          sessionState: l.session_state || 'idle',
          funnelStage: l.funnel_stage,
          leadStatus: l.lead_status || 'new',
          leadNotes: l.lead_notes || '',
          cartTotal: l.cart_total || 0,
          lastOrderCode: l.last_order_code,
          lastOrderTotal: l.last_order_total,
          bookingInfo: l.booking_info,
          bookingStatus: l.booking_status,
        })),
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
        sources: (sources.results || []),
      }), { headers: CORS });
    }

    // Update lead status
    if (action === 'update' && context.request.method === 'POST') {
      const body = await context.request.json();
      const { waId, status, notes } = body;
      if (!waId) return new Response(JSON.stringify({ error: 'waId required' }), { status: 400, headers: CORS });

      const now = new Date().toISOString();
      if (status) {
        await db.prepare('INSERT INTO wa_messages (wa_id, direction, msg_type, content, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(waId, 'system', 'lead_status', status, now).run();
      }
      if (notes) {
        await db.prepare('INSERT INTO wa_messages (wa_id, direction, msg_type, content, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(waId, 'system', 'lead_notes', notes, now).run();
      }
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
