// Hamza Express — Organic Marketing API
// Handles: Google Reviews tracking, weekly post state
// Bindings: DB (D1), GOOGLE_PLACES_API_KEY (secret)
// No auth required — public dashboard endpoint

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// HE Google Place ID — from Google Maps URL
// Source: index.html maps link → 0x3bae1771b42304f9:0xb86ab64920519df9
const HE_PLACE_ID = 'ChIJ-QQjtHEXrjsR-Z1RIEm2arg'; // Verified — 4.9★, 110 reviews

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    switch (action) {
      case 'get-reviews':
        return await getReviews(url, env);
      case 'get-review-log':
        return await getReviewLog(url, env);
      default:
        return json({ success: false, error: 'Unknown action. Available: get-reviews, get-review-log' }, 400);
    }
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}

function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  return dt;
}

// ═══════════════════════════════════════════════════
// GOOGLE REVIEWS
// ═══════════════════════════════════════════════════

async function getReviews(url, env) {
  const brand = url.searchParams.get('brand') || 'he';
  const today = new Date().toISOString().slice(0, 10);

  // Try today's snapshot from DB first
  const existing = await env.DB.prepare(
    'SELECT * FROM review_snapshots WHERE brand = ? AND snapshot_date = ?'
  ).bind(brand, today).first();

  // Get yesterday's snapshot
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yesterdaySnap = await env.DB.prepare(
    'SELECT * FROM review_snapshots WHERE brand = ? AND snapshot_date = ?'
  ).bind(brand, yesterday).first();

  // Get week start snapshot
  const weekStart = getMonday(new Date()).toISOString().slice(0, 10);
  const weekSnap = await env.DB.prepare(
    'SELECT * FROM review_snapshots WHERE brand = ? AND snapshot_date <= ? ORDER BY snapshot_date ASC LIMIT 1'
  ).bind(brand, weekStart).first();

  if (!env.GOOGLE_PLACES_API_KEY) {
    // No API key — fall back to cached snapshot
    if (existing) {
      const newToday = yesterdaySnap ? existing.total_reviews - yesterdaySnap.total_reviews : 0;
      const thisWeek = weekSnap ? existing.total_reviews - weekSnap.total_reviews : 0;
      return json({ success: true, rating: existing.average_rating, totalReviews: existing.total_reviews, newToday, thisWeek, lastUpdated: existing.created_at });
    }
    return json({ success: true, rating: '--', totalReviews: '--', newToday: '--', thisWeek: '--', note: 'GOOGLE_PLACES_API_KEY not configured' });
  }

  // Always fetch live from Google Places API
  let liveRating = null, liveCount = null, lastUpdated = null;
  try {
    const placeId = HE_PLACE_ID;
    const resp = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=rating,userRatingCount&key=${env.GOOGLE_PLACES_API_KEY}`
    );
    const data = await resp.json();
    if (data.rating) {
      liveRating = data.rating;
      liveCount = data.userRatingCount || 0;
      lastUpdated = new Date().toISOString();

      await env.DB.prepare(
        `INSERT OR REPLACE INTO review_snapshots (brand, snapshot_date, total_reviews, average_rating) VALUES (?, ?, ?, ?)`
      ).bind(brand, today, liveCount, liveRating).run();
    }
  } catch (e) {
    // Live fetch failed — fall back to cached
    if (existing) {
      liveRating = existing.average_rating;
      liveCount = existing.total_reviews;
      lastUpdated = existing.created_at;
    }
  }

  if (liveRating === null) {
    return json({ success: true, rating: '--', totalReviews: '--', newToday: '--', thisWeek: '--', note: 'Could not fetch reviews' });
  }

  const newToday = yesterdaySnap ? liveCount - yesterdaySnap.total_reviews : 0;
  const thisWeek = weekSnap ? liveCount - weekSnap.total_reviews : 0;

  return json({
    success: true,
    rating: liveRating,
    totalReviews: liveCount,
    newToday,
    thisWeek,
    lastUpdated,
  });
}

async function getReviewLog(url, env) {
  const brand = url.searchParams.get('brand') || 'he';
  const limit = parseInt(url.searchParams.get('limit') || '30');

  const rows = await env.DB.prepare(
    'SELECT * FROM review_snapshots WHERE brand = ? ORDER BY snapshot_date DESC LIMIT ?'
  ).bind(brand, limit).all();

  return json({ success: true, snapshots: rows.results || [] });
}
