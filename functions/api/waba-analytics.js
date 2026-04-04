// WABA Marketing Analytics API
// GET /api/waba-analytics?period=7d|30d|all
// Returns all dashboard data in one call

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

  // Conversation view for a specific customer
  if (action === 'conversation') {
    const waId = url.searchParams.get('wa_id');
    if (!waId) return new Response(JSON.stringify({ error: 'wa_id required' }), { status: 400, headers: CORS });
    try {
      const [user, messages, orders] = await Promise.all([
        db.prepare('SELECT * FROM wa_users WHERE wa_id = ?').bind(waId).first(),
        db.prepare('SELECT * FROM wa_messages WHERE wa_id = ? ORDER BY created_at DESC LIMIT 100').bind(waId).all(),
        db.prepare('SELECT id, order_code, items, total, payment_status, status, created_at FROM wa_orders WHERE wa_id = ? ORDER BY id DESC LIMIT 10').bind(waId).all(),
      ]);
      return new Response(JSON.stringify({
        success: true,
        user: user || {},
        messages: (messages.results || []).reverse(),
        orders: orders.results || [],
      }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
  }

  const period = url.searchParams.get('period') || '30d';

  // Calculate date filter
  let dateFilter = '';
  if (period === '1d') dateFilter = "datetime('now', '-1 day')";
  else if (period === '7d') dateFilter = "datetime('now', '-7 days')";
  else if (period === '30d') dateFilter = "datetime('now', '-30 days')";
  else dateFilter = "datetime('now', '-10 years')"; // all

  try {
    // Run all queries in parallel
    const [overview, sources, segments, recent, daily, sourceLinks, aggregatorConv] = await Promise.all([
      // 1. Overview KPIs
      db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM wa_users) as totalCustomers,
          (SELECT COUNT(*) FROM wa_users WHERE created_at > ${dateFilter}) as newCustomers,
          (SELECT COUNT(*) FROM wa_orders WHERE payment_status = 'paid' AND created_at > ${dateFilter}) as totalOrders,
          (SELECT COALESCE(SUM(total), 0) FROM wa_orders WHERE payment_status = 'paid' AND created_at > ${dateFilter}) as revenue,
          (SELECT COALESCE(AVG(total), 0) FROM wa_orders WHERE payment_status = 'paid' AND created_at > ${dateFilter}) as aov,
          (SELECT COUNT(*) FROM wa_orders WHERE created_at > ${dateFilter}) as totalAttempts
      `).first(),

      // 2. Source attribution from wa_users.first_source
      db.prepare(`
        SELECT
          COALESCE(u.first_source, 'unknown') as source,
          COUNT(DISTINCT u.wa_id) as customers,
          COALESCE(SUM(u.total_orders), 0) as totalOrders,
          COALESCE(SUM(u.total_spent), 0) as totalSpent,
          COALESCE(AVG(u.total_spent), 0) as avgLtv,
          COALESCE(AVG(u.total_orders), 0) as avgOrders,
          COUNT(CASE WHEN u.total_orders >= 2 THEN 1 END) as repeatCustomers
        FROM wa_users u
        WHERE u.created_at > ${dateFilter}
        GROUP BY COALESCE(u.first_source, 'unknown')
        ORDER BY customers DESC
      `).all(),

      // 3. Customer segments
      db.prepare(`
        SELECT
          CASE
            WHEN total_orders = 0 THEN 'new'
            WHEN total_orders <= 2 THEN 'learning'
            WHEN total_orders <= 9 THEN 'familiar'
            WHEN total_orders >= 10 THEN 'regular'
          END as segment,
          COUNT(*) as count,
          COALESCE(SUM(total_spent), 0) as revenue,
          COALESCE(AVG(total_spent), 0) as avgLtv
        FROM wa_users
        GROUP BY segment
        ORDER BY count DESC
      `).all(),

      // 4. Recent activity (last 20 customers)
      db.prepare(`
        SELECT
          u.wa_id,
          u.name,
          u.total_orders,
          u.total_spent,
          u.first_source,
          u.last_active_at,
          u.created_at,
          CASE
            WHEN u.total_orders = 0 THEN 'new'
            WHEN u.total_orders <= 2 THEN 'learning'
            WHEN u.total_orders <= 9 THEN 'familiar'
            ELSE 'regular'
          END as tier
        FROM wa_users u
        ORDER BY u.last_active_at DESC
        LIMIT 20
      `).all(),

      // 5. Daily trends (last 14 days)
      db.prepare(`
        SELECT
          date(created_at) as day,
          COUNT(*) as orders,
          COALESCE(SUM(total), 0) as revenue,
          COUNT(DISTINCT wa_id) as uniqueCustomers
        FROM wa_orders
        WHERE payment_status = 'paid' AND created_at > datetime('now', '-14 days')
        GROUP BY date(created_at)
        ORDER BY day ASC
      `).all(),

      // 6. Source links (click data)
      db.prepare(`SELECT slug, label, category, clicks FROM source_links ORDER BY category, clicks DESC`).all(),

      // 7. Aggregator conversion
      db.prepare(`
        SELECT
          COUNT(*) as totalFromAggregator,
          COUNT(CASE WHEN total_orders >= 1 THEN 1 END) as ordered,
          COUNT(CASE WHEN total_orders >= 2 THEN 1 END) as reordered,
          COALESCE(SUM(total_spent), 0) as revenue,
          COALESCE(AVG(total_spent), 0) as avgLtv
        FROM wa_users
        WHERE first_source IN ('packaging-aggregator', 'packaging')
      `).first(),
    ]);

    // Calculate conversion rate
    const conversionRate = overview.totalCustomers > 0
      ? ((overview.totalOrders / overview.totalCustomers) * 100).toFixed(1)
      : '0.0';

    // Calculate funnel (approximate from available data)
    const totalClicks = (sourceLinks.results || []).reduce((s, l) => s + (l.clicks || 0), 0);
    const totalMessaged = overview.totalCustomers;
    const totalOrdered = overview.totalOrders;

    // Merge source links clicks with user attribution
    const sourceMap = {};
    for (const link of (sourceLinks.results || [])) {
      sourceMap[link.slug] = { ...link, customers: 0, orders: 0, revenue: 0, avgLtv: 0 };
    }
    for (const src of (sources.results || [])) {
      if (sourceMap[src.source]) {
        sourceMap[src.source].customers = src.customers;
        sourceMap[src.source].orders = src.totalOrders;
        sourceMap[src.source].revenue = src.totalSpent;
        sourceMap[src.source].avgLtv = src.avgLtv;
        sourceMap[src.source].repeatCustomers = src.repeatCustomers;
      } else {
        sourceMap[src.source] = {
          slug: src.source, label: src.source, category: 'unknown', clicks: 0,
          customers: src.customers, orders: src.totalOrders, revenue: src.totalSpent,
          avgLtv: src.avgLtv, repeatCustomers: src.repeatCustomers,
        };
      }
    }

    const response = {
      success: true,
      period,
      timestamp: new Date().toISOString(),
      overview: {
        totalCustomers: overview.totalCustomers || 0,
        newCustomers: overview.newCustomers || 0,
        totalOrders: overview.totalOrders || 0,
        revenue: Math.round(overview.revenue || 0),
        aov: Math.round(overview.aov || 0),
        conversionRate: parseFloat(conversionRate),
      },
      sources: Object.values(sourceMap).sort((a, b) => b.customers - a.customers),
      funnel: {
        clicks: totalClicks,
        messaged: totalMessaged,
        ordered: totalOrdered,
      },
      segments: (segments.results || []).map(s => ({
        segment: s.segment,
        count: s.count,
        revenue: Math.round(s.revenue),
        avgLtv: Math.round(s.avgLtv),
      })),
      aggregatorConversion: {
        total: aggregatorConv?.totalFromAggregator || 0,
        ordered: aggregatorConv?.ordered || 0,
        reordered: aggregatorConv?.reordered || 0,
        revenue: Math.round(aggregatorConv?.revenue || 0),
        avgLtv: Math.round(aggregatorConv?.avgLtv || 0),
      },
      recent: (recent.results || []).map(r => ({
        name: r.name || 'Unknown',
        waId: r.wa_id,
        phone: r.wa_id ? '...' + r.wa_id.slice(-4) : '?',
        source: r.first_source || 'unknown',
        tier: r.tier,
        orders: r.total_orders,
        spent: Math.round(r.total_spent || 0),
        lastActive: r.last_active_at,
        joined: r.created_at,
      })),
      daily: (daily.results || []).map(d => ({
        date: d.day,
        orders: d.orders,
        revenue: Math.round(d.revenue),
        customers: d.uniqueCustomers,
      })),
    };

    return new Response(JSON.stringify(response), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
}
