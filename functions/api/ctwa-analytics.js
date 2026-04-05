// Meta CTWA Command Center API
// GET /api/ctwa-analytics?period=7d|30d|all
// Tracks: Ad clicks → Conversations → Combos viewed → Orders/Bookings → Revenue

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const db = context.env.DB;
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');
  const period = url.searchParams.get('period') || '7d';

  let dateFilter = "datetime('now', '-7 days')";
  if (period === '1d') dateFilter = "datetime('now', '-1 day')";
  else if (period === '30d') dateFilter = "datetime('now', '-30 days')";
  else if (period === 'all') dateFilter = "datetime('now', '-10 years')";

  // Conversation detail for a specific customer
  if (action === 'conversation') {
    const waId = url.searchParams.get('wa_id');
    if (!waId) return new Response(JSON.stringify({ error: 'wa_id required' }), { status: 400, headers: CORS });
    try {
      const [user, session, messages, orders, bookings] = await Promise.all([
        db.prepare('SELECT * FROM wa_users WHERE wa_id = ?').bind(waId).first(),
        db.prepare('SELECT * FROM wa_sessions WHERE wa_id = ?').bind(waId).first(),
        db.prepare('SELECT * FROM wa_messages WHERE wa_id = ? ORDER BY created_at DESC LIMIT 100').bind(waId).all(),
        db.prepare('SELECT * FROM wa_orders WHERE wa_id = ? ORDER BY id DESC LIMIT 10').bind(waId).all(),
        db.prepare('SELECT * FROM wa_bookings WHERE wa_id = ? ORDER BY id DESC LIMIT 10').bind(waId).all(),
      ]);
      return new Response(JSON.stringify({
        success: true, user: user || {}, session: session || {},
        messages: (messages.results || []).reverse(),
        orders: orders.results || [], bookings: bookings.results || [],
      }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  try {
    const [
      ctwaOverview, ctwaByCombo, ctwaFunnel, ctwaConversations,
      ctwaDaily, ctwaOrders, ctwaBookings, organicComparison
    ] = await Promise.all([

      // 1. CTWA Overview KPIs
      db.prepare(`SELECT
        (SELECT COUNT(DISTINCT wa_id) FROM wa_sessions WHERE ctwa_clid IS NOT NULL AND ctwa_first_contact > ${dateFilter}) as totalConversations,
        (SELECT COUNT(*) FROM wa_orders WHERE payment_status = 'paid' AND ctwa_clid IS NOT NULL AND created_at > ${dateFilter}) as totalOrders,
        (SELECT COALESCE(SUM(total), 0) FROM wa_orders WHERE payment_status = 'paid' AND ctwa_clid IS NOT NULL AND created_at > ${dateFilter}) as totalRevenue,
        (SELECT COALESCE(AVG(total), 0) FROM wa_orders WHERE payment_status = 'paid' AND ctwa_clid IS NOT NULL AND created_at > ${dateFilter}) as avgOrderValue,
        (SELECT COUNT(*) FROM wa_bookings WHERE wa_id IN (SELECT wa_id FROM wa_sessions WHERE ctwa_clid IS NOT NULL) AND created_at > ${dateFilter}) as totalBookings
      `).first(),

      // 2. Per-combo performance (which ad creative wins)
      db.prepare(`SELECT
        COALESCE(s.ad_headline, 'Unknown Ad') as adHeadline,
        s.ad_source_id as adId,
        COUNT(DISTINCT s.wa_id) as conversations,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN o.wa_id END) as orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total ELSE 0 END), 0) as revenue
      FROM wa_sessions s
      LEFT JOIN wa_orders o ON s.wa_id = o.wa_id AND o.created_at > ${dateFilter}
      WHERE s.ctwa_clid IS NOT NULL AND s.ctwa_first_contact > ${dateFilter}
      GROUP BY s.ad_headline, s.ad_source_id
      ORDER BY conversations DESC`).all(),

      // 3. Funnel metrics
      db.prepare(`SELECT
        (SELECT COUNT(DISTINCT wa_id) FROM wa_sessions WHERE ctwa_clid IS NOT NULL AND ctwa_first_contact > ${dateFilter}) as adTaps,
        (SELECT COUNT(DISTINCT wa_id) FROM wa_messages WHERE direction = 'in' AND wa_id IN (SELECT wa_id FROM wa_sessions WHERE ctwa_clid IS NOT NULL AND ctwa_first_contact > ${dateFilter})) as messaged,
        (SELECT COUNT(DISTINCT wa_id) FROM wa_messages WHERE direction = 'out' AND msg_type = 'combo_list' AND wa_id IN (SELECT wa_id FROM wa_sessions WHERE ctwa_clid IS NOT NULL)) as viewedCombos,
        (SELECT COUNT(DISTINCT wa_id) FROM wa_orders WHERE payment_status = 'paid' AND wa_id IN (SELECT wa_id FROM wa_sessions WHERE ctwa_clid IS NOT NULL) AND created_at > ${dateFilter}) as ordered,
        (SELECT COUNT(DISTINCT wa_id) FROM wa_bookings WHERE wa_id IN (SELECT wa_id FROM wa_sessions WHERE ctwa_clid IS NOT NULL) AND created_at > ${dateFilter}) as booked
      `).first(),

      // 4. Recent CTWA conversations (last 30)
      db.prepare(`SELECT
        u.wa_id, u.name, u.total_orders, u.total_spent,
        s.ad_headline, s.ctwa_first_contact, s.nurture_stage,
        s.ad_source_id,
        CASE WHEN u.total_orders = 0 THEN 'new' WHEN u.total_orders <= 2 THEN 'learning' WHEN u.total_orders <= 9 THEN 'familiar' ELSE 'regular' END as tier
      FROM wa_sessions s
      JOIN wa_users u ON s.wa_id = u.wa_id
      WHERE s.ctwa_clid IS NOT NULL
      ORDER BY s.ctwa_first_contact DESC
      LIMIT 30`).all(),

      // 5. Daily CTWA trend
      db.prepare(`SELECT
        date(s.ctwa_first_contact) as day,
        COUNT(DISTINCT s.wa_id) as conversations,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN o.wa_id END) as orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total ELSE 0 END), 0) as revenue
      FROM wa_sessions s
      LEFT JOIN wa_orders o ON s.wa_id = o.wa_id
      WHERE s.ctwa_clid IS NOT NULL AND s.ctwa_first_contact > ${dateFilter}
      GROUP BY date(s.ctwa_first_contact)
      ORDER BY day ASC`).all(),

      // 6. CTWA orders detail
      db.prepare(`SELECT
        o.order_code, o.wa_id, o.items, o.total, o.status, o.payment_status, o.created_at,
        s.ad_headline
      FROM wa_orders o
      JOIN wa_sessions s ON o.wa_id = s.wa_id
      WHERE s.ctwa_clid IS NOT NULL AND o.created_at > ${dateFilter}
      ORDER BY o.created_at DESC
      LIMIT 20`).all(),

      // 7. CTWA bookings detail
      db.prepare(`SELECT
        b.*, s.ad_headline, u.name
      FROM wa_bookings b
      JOIN wa_sessions s ON b.wa_id = s.wa_id
      JOIN wa_users u ON b.wa_id = u.wa_id
      WHERE s.ctwa_clid IS NOT NULL AND b.created_at > ${dateFilter}
      ORDER BY b.created_at DESC
      LIMIT 20`).all(),

      // 8. Organic vs CTWA comparison
      db.prepare(`SELECT
        CASE WHEN s.ctwa_clid IS NOT NULL THEN 'ctwa' ELSE 'organic' END as source,
        COUNT(DISTINCT u.wa_id) as customers,
        COALESCE(SUM(u.total_orders), 0) as totalOrders,
        COALESCE(SUM(u.total_spent), 0) as totalRevenue,
        COALESCE(AVG(u.total_spent), 0) as avgLtv
      FROM wa_users u
      LEFT JOIN wa_sessions s ON u.wa_id = s.wa_id
      WHERE u.created_at > ${dateFilter}
      GROUP BY CASE WHEN s.ctwa_clid IS NOT NULL THEN 'ctwa' ELSE 'organic' END`).all(),
    ]);

    // Calculate conversion rate
    const convRate = ctwaOverview.totalConversations > 0
      ? ((ctwaOverview.totalOrders / ctwaOverview.totalConversations) * 100).toFixed(1) : '0.0';
    const bookRate = ctwaOverview.totalConversations > 0
      ? ((ctwaOverview.totalBookings / ctwaOverview.totalConversations) * 100).toFixed(1) : '0.0';

    // Estimate cost (user can input actual spend)
    const estCostPerConv = ctwaOverview.totalConversations > 0 ? Math.round(1500 / Math.max(ctwaOverview.totalConversations / 7, 1)) : 0;

    return new Response(JSON.stringify({
      success: true, period,
      overview: {
        conversations: ctwaOverview.totalConversations || 0,
        orders: ctwaOverview.totalOrders || 0,
        bookings: ctwaOverview.totalBookings || 0,
        revenue: Math.round(ctwaOverview.totalRevenue || 0),
        aov: Math.round(ctwaOverview.avgOrderValue || 0),
        orderConvRate: parseFloat(convRate),
        bookingConvRate: parseFloat(bookRate),
        estCostPerConversation: estCostPerConv,
      },
      comboPerformance: (ctwaByCombo.results || []).map(c => ({
        adHeadline: c.adHeadline, adId: c.adId,
        conversations: c.conversations, orders: c.orders,
        revenue: Math.round(c.revenue),
        convRate: c.conversations > 0 ? ((c.orders / c.conversations) * 100).toFixed(1) : '0.0',
      })),
      funnel: {
        adTaps: ctwaFunnel.adTaps || 0,
        messaged: ctwaFunnel.messaged || 0,
        viewedCombos: ctwaFunnel.viewedCombos || 0,
        ordered: ctwaFunnel.ordered || 0,
        booked: ctwaFunnel.booked || 0,
      },
      conversations: (ctwaConversations.results || []).map(c => ({
        waId: c.wa_id, name: c.name || 'Unknown',
        phone: c.wa_id ? '...' + c.wa_id.slice(-4) : '?',
        tier: c.tier, orders: c.total_orders, spent: Math.round(c.total_spent || 0),
        adHeadline: c.ad_headline, firstContact: c.ctwa_first_contact,
        nurtureStage: c.nurture_stage,
      })),
      daily: (ctwaDaily.results || []).map(d => ({
        date: d.day, conversations: d.conversations,
        orders: d.orders, revenue: Math.round(d.revenue),
      })),
      orders: (ctwaOrders.results || []).map(o => {
        let items = '';
        try { items = JSON.parse(o.items).map(i => i.name).join(', '); } catch (e) { items = ''; }
        return {
          code: o.order_code, total: Math.round(o.total),
          status: o.payment_status, adHeadline: o.ad_headline,
          items, createdAt: o.created_at,
        };
      }),
      bookings: (ctwaBookings.results || []).map(b => ({
        name: b.name, date: b.booking_date, time: b.booking_time,
        guests: b.party_size, status: b.status, adHeadline: b.ad_headline,
      })),
      organic: (organicComparison.results || []).map(o => ({
        source: o.source, customers: o.customers,
        orders: o.totalOrders, revenue: Math.round(o.totalRevenue),
        avgLtv: Math.round(o.avgLtv),
      })),
    }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
}
