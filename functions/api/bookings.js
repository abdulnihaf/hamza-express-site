// Dine-In Bookings Management API
// GET  /api/bookings                     — today's bookings + drop-offs + metrics
// GET  /api/bookings?date=YYYY-MM-DD     — bookings for specific date
// GET  /api/bookings?action=dropoffs     — booking flow drop-offs
// POST /api/bookings?action=update       — update booking status (Mumtaz actions)
// POST /api/bookings?action=notes        — add notes to a booking
// GET  /api/bookings?action=metrics      — conversion metrics for date range

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
  const today = new Date().toISOString().slice(0, 10);
  const dateParam = url.searchParams.get('date') || today;
  const view = url.searchParams.get('view') || 'date'; // 'date' or 'upcoming'

  try {
    // ── LIST: Bookings with guest info ──
    if (action === 'list' && context.request.method === 'GET') {
      // Date filter: single date or upcoming (today + future)
      const dateWhere = view === 'upcoming' ? 'b.booking_date >= ?' : 'b.booking_date = ?';
      const dateVal = view === 'upcoming' ? today : dateParam;
      const dropoffDateWhere = view === 'upcoming' ? 'date(a.started_at) >= ?' : 'date(a.started_at) = ?';
      const metricsDateWhere = view === 'upcoming' ? 'booking_date >= ?' : 'booking_date = ?';
      const attemptsDateWhere = view === 'upcoming' ? 'date(started_at) >= ?' : 'date(started_at) = ?';

      const [bookings, dropoffs, metrics, recentBookings] = await Promise.all([
        // Bookings for selected view
        db.prepare(`
          SELECT b.*, u.name as user_name, u.wa_id, u.total_orders, u.total_spent,
            CASE
              WHEN u.total_orders = 0 THEN 'new'
              WHEN u.total_orders <= 2 THEN 'learning'
              WHEN u.total_orders <= 9 THEN 'familiar'
              ELSE 'regular'
            END as tier
          FROM wa_bookings b
          LEFT JOIN wa_users u ON b.wa_id = u.wa_id
          WHERE ${dateWhere}
          ORDER BY
            CASE b.mumtaz_status
              WHEN 'pending' THEN 1
              WHEN 'called' THEN 2
              WHEN 'confirmed' THEN 3
              WHEN 'arrived' THEN 4
              WHEN 'no_show' THEN 5
              WHEN 'cancelled' THEN 6
              ELSE 7
            END,
            b.booking_date ASC,
            b.booking_time ASC
        `).bind(dateVal).all(),

        // Drop-offs: started booking flow but didn't complete
        db.prepare(`
          SELECT a.*, u.name as user_name, u.wa_id, u.total_orders,
            CASE
              WHEN u.total_orders = 0 THEN 'new'
              WHEN u.total_orders <= 2 THEN 'learning'
              WHEN u.total_orders <= 9 THEN 'familiar'
              ELSE 'regular'
            END as tier
          FROM booking_attempts a
          LEFT JOIN wa_users u ON a.wa_id = u.wa_id
          WHERE a.completed = 0
            AND ${dropoffDateWhere}
          ORDER BY a.started_at DESC
        `).bind(dateVal).all(),

        // Metrics
        db.prepare(`
          SELECT
            (SELECT COUNT(*) FROM wa_bookings WHERE ${metricsDateWhere}) as total_bookings,
            (SELECT COUNT(*) FROM wa_bookings WHERE ${metricsDateWhere} AND status != 'cancelled') as active_bookings,
            (SELECT COUNT(*) FROM wa_bookings WHERE ${metricsDateWhere} AND mumtaz_status = 'confirmed') as confirmed_by_mumtaz,
            (SELECT COUNT(*) FROM wa_bookings WHERE ${metricsDateWhere} AND arrived = 1) as arrived,
            (SELECT COUNT(*) FROM wa_bookings WHERE ${metricsDateWhere} AND mumtaz_status = 'no_show') as no_shows,
            (SELECT COUNT(*) FROM wa_bookings WHERE ${metricsDateWhere} AND status = 'cancelled') as cancelled,
            (SELECT COUNT(*) FROM booking_attempts WHERE ${attemptsDateWhere} AND completed = 0) as dropoffs,
            (SELECT COUNT(*) FROM booking_attempts WHERE ${attemptsDateWhere}) as total_attempts,
            (SELECT SUM(CAST(party_size AS INTEGER)) FROM wa_bookings WHERE ${metricsDateWhere} AND status != 'cancelled') as total_guests
          `).bind(dateVal, dateVal, dateVal, dateVal, dateVal, dateVal, dateVal, dateVal, dateVal).first(),

        // Recent bookings (last 30 min) — for live alerts
        db.prepare(`
          SELECT b.*, u.name as user_name
          FROM wa_bookings b
          LEFT JOIN wa_users u ON b.wa_id = u.wa_id
          WHERE b.created_at > datetime('now', '-30 minutes')
          ORDER BY b.created_at DESC
          LIMIT 5
        `).all(),
      ]);

      return new Response(JSON.stringify({
        success: true,
        date: dateParam,
        view,
        recentBookings: (recentBookings.results || []).map(r => ({
          id: r.id, guestName: r.guest_name || r.user_name || 'Guest',
          partySize: r.party_size, bookingDate: r.booking_date, bookingTime: r.booking_time,
          createdAt: r.created_at,
        })),
        bookings: (bookings.results || []).map(b => ({
          id: b.id,
          waId: b.wa_id,
          phone: b.wa_id ? b.wa_id.replace(/^91/, '') : '',
          guestName: b.guest_name || b.user_name || 'Guest',
          userName: b.user_name || '',
          partySize: b.party_size,
          bookingDate: b.booking_date,
          bookingTime: b.booking_time,
          specialRequest: b.special_request || '',
          status: b.status,
          mumtazStatus: b.mumtaz_status || 'pending',
          mumtazCalledAt: b.mumtaz_called_at,
          mumtazNotes: b.mumtaz_notes || '',
          arrived: b.arrived === 1,
          tier: b.tier || 'new',
          totalOrders: b.total_orders || 0,
          totalSpent: Math.round(b.total_spent || 0),
          createdAt: b.created_at,
          reminderSent: b.reminder_sent === 1,
        })),
        dropoffs: (dropoffs.results || []).map(d => ({
          id: d.id,
          waId: d.wa_id,
          phone: d.wa_id ? d.wa_id.replace(/^91/, '') : '',
          guestName: d.user_name || 'Unknown',
          triggerSource: d.trigger_source || 'flow',
          startedAt: d.started_at,
          tier: d.tier || 'new',
          totalOrders: d.total_orders || 0,
        })),
        metrics: {
          totalBookings: metrics.total_bookings || 0,
          activeBookings: metrics.active_bookings || 0,
          confirmedByMumtaz: metrics.confirmed_by_mumtaz || 0,
          arrived: metrics.arrived || 0,
          noShows: metrics.no_shows || 0,
          cancelled: metrics.cancelled || 0,
          dropoffs: metrics.dropoffs || 0,
          totalAttempts: metrics.total_attempts || 0,
          totalGuests: metrics.total_guests || 0,
          conversionRate: metrics.total_attempts > 0
            ? ((metrics.active_bookings / metrics.total_attempts) * 100).toFixed(1) : '0.0',
          showUpRate: metrics.active_bookings > 0
            ? ((metrics.arrived / metrics.active_bookings) * 100).toFixed(1) : '0.0',
        },
      }), { headers: CORS });
    }

    // ── UPDATE: Mumtaz marks a booking status ──
    if (action === 'update' && context.request.method === 'POST') {
      const body = await context.request.json();
      const { id, mumtaz_status, arrived, mumtaz_notes } = body;
      if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: CORS });

      const updates = [];
      const params = [];

      if (mumtaz_status) {
        updates.push('mumtaz_status = ?');
        params.push(mumtaz_status);
        if (mumtaz_status === 'called') {
          updates.push("mumtaz_called_at = datetime('now')");
        }
        if (mumtaz_status === 'no_show') {
          // Also update main status
          updates.push("status = 'no_show'");
        }
        if (mumtaz_status === 'cancelled') {
          updates.push("status = 'cancelled'");
        }
      }
      if (arrived !== undefined) {
        updates.push('arrived = ?');
        params.push(arrived ? 1 : 0);
        if (arrived) {
          updates.push("mumtaz_status = 'arrived'");
        }
      }
      if (mumtaz_notes !== undefined) {
        updates.push('mumtaz_notes = ?');
        params.push(mumtaz_notes);
      }

      if (updates.length === 0) {
        return new Response(JSON.stringify({ error: 'Nothing to update' }), { status: 400, headers: CORS });
      }

      params.push(id);
      await db.prepare(`UPDATE wa_bookings SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params).run();

      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // ── METRICS: Conversion metrics for date range ──
    if (action === 'metrics') {
      const from = url.searchParams.get('from') || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const to = url.searchParams.get('to') || new Date().toISOString().slice(0, 10);

      const daily = await db.prepare(`
        SELECT
          b.booking_date as date,
          COUNT(*) as bookings,
          SUM(CASE WHEN b.status != 'cancelled' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN b.mumtaz_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
          SUM(CASE WHEN b.arrived = 1 THEN 1 ELSE 0 END) as arrived,
          SUM(CASE WHEN b.mumtaz_status = 'no_show' THEN 1 ELSE 0 END) as no_shows,
          SUM(CAST(b.party_size AS INTEGER)) as guests
        FROM wa_bookings b
        WHERE b.booking_date BETWEEN ? AND ?
        GROUP BY b.booking_date
        ORDER BY b.booking_date ASC
      `).bind(from, to).all();

      const totals = await db.prepare(`
        SELECT
          COUNT(*) as total_bookings,
          SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN arrived = 1 THEN 1 ELSE 0 END) as arrived,
          SUM(CASE WHEN mumtaz_status = 'no_show' THEN 1 ELSE 0 END) as no_shows,
          SUM(CAST(party_size AS INTEGER)) as total_guests
        FROM wa_bookings
        WHERE booking_date BETWEEN ? AND ?
      `).bind(from, to).first();

      const dropoffCount = await db.prepare(`
        SELECT COUNT(*) as cnt FROM booking_attempts
        WHERE completed = 0 AND date(started_at) BETWEEN ? AND ?
      `).bind(from, to).first();

      return new Response(JSON.stringify({
        success: true, from, to,
        daily: (daily.results || []),
        totals: {
          ...totals,
          dropoffs: dropoffCount.cnt || 0,
          showUpRate: totals.active > 0 ? ((totals.arrived / totals.active) * 100).toFixed(1) : '0.0',
        },
      }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
}
