// Meta CTWA Command Center API
// GET /api/ctwa-analytics?period=7d|30d|all
// Tracks: Ad clicks → Conversations → Combos viewed → Orders/Bookings → Revenue
// Now includes: Meta Ads API data (impressions, reach, spend, clicks, per-combo, audience)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Meta Ads campaign IDs
const META_CAMPAIGN_ID = '120243729366800505';
const META_ADSET_ID = '120243729917650505';

// Fetch Meta Ads Insights API data
async function fetchMetaAdsData(token, period) {
  if (!token) return null;

  // Map period to Meta date_preset
  // Always use IST (UTC+5:30) for date calculation — Meta resolves date_preset in US Pacific which is wrong for India
  const nowIST = new Date(Date.now() + 5.5 * 3600 * 1000);
  const todayIST = nowIST.toISOString().slice(0, 10);
  let dateParam;
  if (period === '1d' || period === 'today') {
    // Use explicit time_range with IST today — never use date_preset=today (Meta uses Pacific time)
    dateParam = `time_range={"since":"${todayIST}","until":"${todayIST}"}`;
  } else if (period === '7d') {
    const d7IST = new Date(Date.now() + 5.5 * 3600 * 1000 - 7 * 86400000).toISOString().slice(0, 10);
    dateParam = `time_range={"since":"${d7IST}","until":"${todayIST}"}`;
  } else if (period === '30d') {
    const d30IST = new Date(Date.now() + 5.5 * 3600 * 1000 - 30 * 86400000).toISOString().slice(0, 10);
    dateParam = `time_range={"since":"${d30IST}","until":"${todayIST}"}`;
  } else {
    dateParam = 'date_preset=maximum';
  }

  try {
    const [campaignRes, perAdRes, audienceRes, dailyRes] = await Promise.all([
      // 1. Campaign overview
      fetch(`https://graph.facebook.com/v25.0/${META_CAMPAIGN_ID}/insights?${dateParam}&fields=impressions,reach,spend,actions,cost_per_action_type,cpc,cpm,ctr,frequency&access_token=${token}`),
      // 2. Per-ad breakdown
      fetch(`https://graph.facebook.com/v25.0/${META_ADSET_ID}/insights?${dateParam}&level=ad&fields=ad_name,impressions,reach,spend,frequency,actions,cost_per_action_type&access_token=${token}`),
      // 3. Audience breakdown (always lifetime for meaningful data)
      fetch(`https://graph.facebook.com/v25.0/${META_CAMPAIGN_ID}/insights?date_preset=maximum&fields=impressions,reach,spend,actions&breakdowns=age,gender&access_token=${token}`),
      // 4. Daily trend
      fetch(`https://graph.facebook.com/v25.0/${META_CAMPAIGN_ID}/insights?date_preset=maximum&time_increment=1&fields=impressions,spend,actions&access_token=${token}`),
    ]);

    const [campaign, perAd, audience, daily] = await Promise.all([
      campaignRes.json(), perAdRes.json(), audienceRes.json(), dailyRes.json(),
    ]);

    // Parse campaign overview
    const c = (campaign.data || [])[0] || {};
    const actions = (c.actions || []).reduce((m, a) => { m[a.action_type] = parseInt(a.value); return m; }, {});
    const costs = (c.cost_per_action_type || []).reduce((m, a) => { m[a.action_type] = parseFloat(a.value); return m; }, {});

    // Parse per-ad breakdown
    const ads = (perAd.data || []).map(a => {
      const aActions = (a.actions || []).reduce((m, x) => { m[x.action_type] = parseInt(x.value); return m; }, {});
      const aCosts = (a.cost_per_action_type || []).reduce((m, x) => { m[x.action_type] = parseFloat(x.value); return m; }, {});
      return {
        name: a.ad_name || 'Unknown',
        impressions: parseInt(a.impressions || 0),
        reach: parseInt(a.reach || 0),
        spend: parseFloat(a.spend || 0),
        frequency: parseFloat(a.frequency || 0),
        clicks: aActions.link_click || 0,
        conversations: aActions['onsite_conversion.messaging_conversation_started_7d'] || 0,
        costPerConversation: aCosts['onsite_conversion.messaging_conversation_started_7d'] || 0,
        depth2: aActions['onsite_conversion.messaging_user_depth_2_message_send'] || 0,
        depth3: aActions['onsite_conversion.messaging_user_depth_3_message_send'] || 0,
      };
    });

    // Parse audience (with actions — clicks, messages)
    const aud = (audience.data || []).map(a => {
      const aActs = (a.actions || []).reduce((m, x) => { m[x.action_type] = parseInt(x.value); return m; }, {});
      return {
        age: a.age, gender: a.gender,
        impressions: parseInt(a.impressions || 0),
        reach: parseInt(a.reach || 0),
        spend: parseFloat(a.spend || 0),
        clicks: aActs.link_click || 0,
        conversations: aActs['onsite_conversion.messaging_conversation_started_7d'] || 0,
      };
    });

    // Parse daily trend
    const dailyTrend = (daily.data || []).map(d => {
      const dActs = (d.actions || []).reduce((m, x) => { m[x.action_type] = parseInt(x.value); return m; }, {});
      return {
        date: d.date_start,
        impressions: parseInt(d.impressions || 0),
        spend: parseFloat(d.spend || 0),
        clicks: dActs.link_click || 0,
        conversations: dActs['onsite_conversion.messaging_conversation_started_7d'] || 0,
      };
    });

    return {
      available: true,
      impressions: parseInt(c.impressions || 0),
      reach: parseInt(c.reach || 0),
      spend: parseFloat(c.spend || 0),
      linkClicks: actions.link_click || 0,
      ctr: c.ctr || '0',
      cpc: parseFloat(c.cpc || 0),
      cpm: parseFloat(c.cpm || 0),
      frequency: parseFloat(c.frequency || 0),
      conversations: actions['onsite_conversion.messaging_conversation_started_7d'] || 0,
      costPerConversation: costs['onsite_conversion.messaging_conversation_started_7d'] || 0,
      depth2: actions['onsite_conversion.messaging_user_depth_2_message_send'] || 0,
      depth3: actions['onsite_conversion.messaging_user_depth_3_message_send'] || 0,
      reactions: actions.post_reaction || 0,
      saves: actions['onsite_conversion.post_save'] || 0,
      shares: actions.post || 0,
      comments: actions.comment || 0,
      perAd: ads,
      audience: aud,
      dailyTrend: dailyTrend,
    };
  } catch (e) {
    console.log('Meta Ads API error:', e.message);
    return { available: false, error: e.message };
  }
}

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
    // Fetch Meta Ads data in parallel with D1 queries
    const metaAdsToken = context.env.WA_ACCESS_TOKEN;
    const metaAdsPromise = fetchMetaAdsData(metaAdsToken, period);

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

    // Wait for Meta Ads data
    const adMetrics = await metaAdsPromise;

    // Use real spend from Meta if available, otherwise estimate
    const realSpend = adMetrics?.available ? adMetrics.spend : 0;
    const realCostPerConv = adMetrics?.available ? adMetrics.costPerConversation : 0;

    return new Response(JSON.stringify({
      success: true, period,
      adMetrics: adMetrics || { available: false },
      overview: {
        conversations: ctwaOverview.totalConversations || 0,
        orders: ctwaOverview.totalOrders || 0,
        bookings: ctwaOverview.totalBookings || 0,
        revenue: Math.round(ctwaOverview.totalRevenue || 0),
        aov: Math.round(ctwaOverview.avgOrderValue || 0),
        orderConvRate: parseFloat(convRate),
        bookingConvRate: parseFloat(bookRate),
        costPerConversation: realCostPerConv,
        totalSpend: realSpend,
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
