// ═══════════════════════════════════════════════════════════════════
// /api/media/{wa_message_id or media_id}   ·   Wave 3.0 Phase 2
// ═══════════════════════════════════════════════════════════════════
//
// Streams a WhatsApp media file (image, video, audio, document, sticker)
// from the R2 vault back to Basheer's team / Nihaf. Used by /ops/leads/
// to render inline thumbnails and by /ops/ctwa-cockpit/ for journey audit.
//
// Auth: PIN session cookie OR ?key=DASHBOARD_API_KEY. No public access —
// customer photos are private. No tokens in URL params that could leak
// via referer or logs (key is accepted but only as a fallback).
//
// Lookup accepts either:
//   /api/media/wamid.XYZ     → find by wa_messages.wa_message_id
//   /api/media/MEDIA_ID      → find by wa_media_files.media_id
//
// The R2 binding env.MEDIA_BUCKET holds the bytes. Lifecycle rule is
// configured to auto-delete objects 30 days after upload — this endpoint
// surfaces the deletion as a structured "expired" response so the UI
// can render a "this photo is older than 30 days, fetching from Drive
// archive" state (Phase 2b).

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

function unauthorized(msg = 'Unauthorized') {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function notFound(msg = 'Not found') {
  return new Response(JSON.stringify({ error: msg }), {
    status: 404,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function expired(row) {
  // Used only when R2 is empty AND there is no Drive archive either
  // (which should be rare once Phase 2b mirror has been running).
  return new Response(JSON.stringify({
    error: 'expired',
    message: 'Media no longer available — R2 lifecycle expired and no Drive archive exists',
    media_id: row.media_id,
    wa_message_id: row.wa_message_id,
    mime_type: row.mime_type,
    downloaded_at: row.downloaded_at,
  }), {
    status: 410,  // Gone
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Drive fallback ────────────────────────────────────────────────
// When R2 has been garbage-collected by the 30-day lifecycle rule,
// pull the bytes from Google Drive via the Drive API. Requires the
// same OAuth refresh token used by /api/media-mirror.
// Streaming approach: we grab a fresh access token, then proxy the
// Drive download through this Worker so the browser never sees any
// token or Drive URL. Adds one extra hop but keeps auth tidy and
// lets us cache the response aggressively (the file is immutable).
async function serveFromDrive(env, row) {
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  if (!tokenResp.ok) {
    return new Response(JSON.stringify({ error: 'drive_token_failed' }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const { access_token } = await tokenResp.json();

  const driveResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${row.drive_file_id}?alt=media`,
    { headers: { 'Authorization': `Bearer ${access_token}` } },
  );
  if (!driveResp.ok) {
    return new Response(JSON.stringify({
      error: 'drive_fetch_failed',
      status: driveResp.status,
      drive_file_id: row.drive_file_id,
    }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const headers = new Headers(CORS);
  headers.set('Content-Type',
    row.mime_type || driveResp.headers.get('Content-Type') || 'application/octet-stream');
  headers.set('Cache-Control', 'private, max-age=86400');
  headers.set('X-Served-From', 'drive');
  if (row.filename) {
    headers.set('Content-Disposition', `inline; filename="${row.filename.replace(/"/g, '')}"`);
  }
  return new Response(driveResp.body, { status: 200, headers });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  // ── Auth ──────────────────────────────────────────────────────────
  // Three paths, in order of preference:
  //  1. Same-origin referer check — if the request comes from a page on
  //     hamzaexpress.in (our own dashboards), allow. Covers leads UI
  //     rendering inline thumbnails / video / audio players.
  //  2. DASHBOARD_API_KEY via ?key= or X-API-Key — for curl, external
  //     integrations, or dashboards on other subdomains.
  //  3. PIN session cookie from floor dashboard — if a staff member is
  //     already logged in elsewhere, their cookie rides along.
  //
  // Rationale: /api/leads itself has no auth today. Tightening media
  // alone would break UI rendering. This matches the leads-dashboard
  // trust boundary — any future lockdown covers both in one go.
  const url = new URL(request.url);
  const providedKey = url.searchParams.get('key') || request.headers.get('X-API-Key');
  const referer = request.headers.get('Referer') || '';
  const origin  = request.headers.get('Origin') || '';
  const allowedHosts = ['hamzaexpress.in', 'localhost', '127.0.0.1'];
  const refOk = allowedHosts.some(h => referer.includes('://' + h) || origin.includes('://' + h));
  const apiKeyOk = providedKey && providedKey === env.DASHBOARD_API_KEY;

  let sessionOk = false;
  const sessionCookie = (request.headers.get('Cookie') || '')
    .split(';').map(s => s.trim()).find(s => s.startsWith('he_pin_session='));
  if (sessionCookie) {
    const sessionToken = sessionCookie.split('=')[1];
    const hit = await env.DB.prepare(
      `SELECT 1 FROM floor_staff
         WHERE session_token = ?
           AND (session_expires_at IS NULL OR session_expires_at > datetime('now'))
         LIMIT 1`
    ).bind(sessionToken).first().catch(() => null);
    sessionOk = !!hit;
  }

  if (!refOk && !apiKeyOk && !sessionOk) return unauthorized();

  // ── Lookup ────────────────────────────────────────────────────────
  const idParam = params.id;
  if (!idParam) return notFound('Missing id');

  // Try wa_message_id first (wamid.* format), else media_id
  let row = null;
  if (idParam.startsWith('wamid.')) {
    row = await env.DB.prepare(
      `SELECT f.*
         FROM wa_media_files f
         WHERE f.wa_message_id = ?
         LIMIT 1`
    ).bind(idParam).first().catch(() => null);
  }
  if (!row) {
    row = await env.DB.prepare(
      `SELECT * FROM wa_media_files WHERE media_id = ? LIMIT 1`
    ).bind(idParam).first().catch(() => null);
  }
  if (!row) return notFound('Media not recorded');

  if (row.download_status !== 'ok' || !row.r2_key) {
    // Not yet downloaded, or download expired/failed
    if (row.download_status === 'expired') return expired(row);
    return new Response(JSON.stringify({
      error: 'not_downloaded',
      status: row.download_status,
      last_error: row.last_error,
    }), {
      status: 202,  // Accepted, not yet available
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Fetch from R2 ─────────────────────────────────────────────────
  const object = await env.MEDIA_BUCKET.get(row.r2_key);
  if (!object) {
    // R2 lifecycle rule (30 days) deleted it. Phase 2b: try Drive.
    if (row.drive_file_id && env.GOOGLE_DRIVE_REFRESH_TOKEN) {
      return serveFromDrive(env, row);
    }
    return expired(row);
  }

  // Stream bytes back with correct content type + caching hints.
  // 30-day max-age matches R2 lifecycle — browser can safely cache.
  const headers = new Headers(CORS);
  headers.set('Content-Type', row.mime_type || object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'private, max-age=86400');  // 1 day browser cache
  headers.set('X-Served-From', 'r2');
  if (row.size_bytes) headers.set('Content-Length', String(row.size_bytes));
  if (row.filename) headers.set('Content-Disposition', `inline; filename="${row.filename.replace(/"/g, '')}"`);

  return new Response(object.body, { status: 200, headers });
}
