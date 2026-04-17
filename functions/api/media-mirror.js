// ═══════════════════════════════════════════════════════════════════
// /api/media-mirror   ·   Wave 3.0 Phase 2b
// ═══════════════════════════════════════════════════════════════════
//
// R2 → Google Drive mirror. Finds wa_media_files rows where
// download_status='ok' AND drive_file_id IS NULL, streams the bytes
// from R2 to Drive, records the Drive file ID + web link.
//
// Auth: DASHBOARD_API_KEY via ?key= or X-API-Key header.
//
// Trigger options (pick one, any works — none cost money):
//   a) External cron-job.org nightly POST — simplest
//   b) GitHub Actions scheduled workflow — lives in repo
//   c) Manual curl when you want to force a sync
//
// Worker CPU budget is 30s on the paid plan. We batch BATCH_SIZE files
// per invocation so we never blow the budget even when a customer
// sends a 20 MB video. Multiple invocations are safe — the query
// filter (drive_file_id IS NULL) makes it idempotent.
//
// Drive layout: {GOOGLE_DRIVE_ROOT_FOLDER_ID}/YYYY-MM-DD/filename
// Daily subfolders keep the root tidy and make manual audits easier.

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

const BATCH_SIZE      = 20;    // rows per invocation
const MAX_MB_PER_RUN  = 150;   // circuit-breaker if videos are huge
const DRIVE_UPLOAD    = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink';
const DRIVE_API       = 'https://www.googleapis.com/drive/v3/files';
const TOKEN_URL       = 'https://oauth2.googleapis.com/token';

function j(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Drive OAuth helper ──────────────────────────────────────────────
// Exchanges the long-lived refresh_token for a short-lived access_token.
// Cached per-invocation (a single cron run only hits the token endpoint
// once, not 20 times).
async function getAccessToken(env) {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.GOOGLE_ADS_CLIENT_ID,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`token_refresh: ${JSON.stringify(json).slice(0, 400)}`);
  return json.access_token;
}

// ─── Find-or-create a daily subfolder under the root ─────────────────
// Cached for this invocation only (we usually only touch 1-2 folders
// per run since downloaded_at dates cluster).
async function getDailyFolderId(token, rootFolderId, yyyyMmDd, folderCache) {
  if (folderCache.has(yyyyMmDd)) return folderCache.get(yyyyMmDd);

  // Escape single quotes in the date for safety (shouldn't ever have them)
  const safeName = yyyyMmDd.replace(/'/g, "\\'");
  const q = `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`;
  const searchUrl = `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&pageSize=1`;
  const searchResp = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const searchJson = await searchResp.json();
  if (!searchResp.ok) throw new Error(`folder_search: ${JSON.stringify(searchJson).slice(0, 400)}`);
  if (searchJson.files && searchJson.files.length > 0) {
    folderCache.set(yyyyMmDd, searchJson.files[0].id);
    return searchJson.files[0].id;
  }

  // Create new folder
  const createResp = await fetch(DRIVE_API + '?fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      name:     yyyyMmDd,
      mimeType: 'application/vnd.google-apps.folder',
      parents:  [rootFolderId],
    }),
  });
  const createJson = await createResp.json();
  if (!createResp.ok) throw new Error(`folder_create: ${JSON.stringify(createJson).slice(0, 400)}`);
  folderCache.set(yyyyMmDd, createJson.id);
  return createJson.id;
}

// ─── Multipart upload to Drive ───────────────────────────────────────
// Single request carrying both the metadata JSON and the file bytes.
// Good enough for our <= 20 MB files; resumable upload would be overkill.
async function uploadToDrive(token, folderId, filename, mimeType, bytes) {
  const boundary = '-----HEDrive' + Math.random().toString(36).slice(2);
  const encoder = new TextEncoder();
  const metadata = {
    name:     filename,
    parents:  [folderId],
    mimeType: mimeType || 'application/octet-stream',
  };
  const preamble = encoder.encode(
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
  );
  const closer = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(preamble.length + bytes.byteLength + closer.length);
  body.set(preamble, 0);
  body.set(new Uint8Array(bytes), preamble.length);
  body.set(closer, preamble.length + bytes.byteLength);

  const resp = await fetch(DRIVE_UPLOAD, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`drive_upload ${resp.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json; // { id, webViewLink, webContentLink }
}

// ─── Main handler ────────────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  // Auth — DASHBOARD_API_KEY required. Same key used by /api/media etc.
  const url = new URL(request.url);
  const providedKey = url.searchParams.get('key') || request.headers.get('X-API-Key');
  if (!providedKey || providedKey !== env.DASHBOARD_API_KEY) {
    return j({ error: 'Unauthorized' }, 401);
  }

  // Preflight: all required secrets present
  if (!env.GOOGLE_ADS_CLIENT_ID || !env.GOOGLE_ADS_CLIENT_SECRET) {
    return j({ error: 'missing_oauth_client' }, 500);
  }
  if (!env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    return j({ error: 'missing_drive_refresh_token', hint: 'Run /api/drive-auth first' }, 500);
  }
  if (!env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    return j({ error: 'missing_drive_root_folder_id' }, 500);
  }
  if (!env.MEDIA_BUCKET) {
    return j({ error: 'missing_r2_binding' }, 500);
  }

  // Batch: take oldest-first so we mirror things before their 30d R2
  // lifecycle kicks in (downloaded_at is when the bytes landed in R2).
  const batchSize = Math.min(
    parseInt(url.searchParams.get('batch') || String(BATCH_SIZE), 10),
    100,
  );
  const rows = await env.DB.prepare(
    `SELECT media_id, wa_message_id, wa_id, msg_type, mime_type,
            filename, size_bytes, r2_key, downloaded_at
       FROM wa_media_files
      WHERE download_status = 'ok'
        AND r2_key IS NOT NULL
        AND drive_file_id IS NULL
      ORDER BY downloaded_at ASC
      LIMIT ?`,
  ).bind(batchSize).all();

  const items = rows.results || [];
  if (items.length === 0) {
    return j({ success: true, mirrored: 0, failed: 0, message: 'nothing to mirror' });
  }

  // Token + folder cache (per invocation only)
  let accessToken;
  try {
    accessToken = await getAccessToken(env);
  } catch (e) {
    return j({ error: 'token_refresh_failed', detail: e.message }, 502);
  }

  const rootFolderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const folderCache = new Map();
  const results = [];
  let mirrored = 0, failed = 0, bytesThisRun = 0;

  for (const row of items) {
    // Circuit breaker — stop if we've already moved a lot this run so
    // we don't blow the 30s CPU budget on a surprise video batch.
    if (bytesThisRun > MAX_MB_PER_RUN * 1024 * 1024) {
      results.push({ media_id: row.media_id, status: 'deferred_next_run' });
      continue;
    }

    try {
      // Fetch bytes from R2
      const obj = await env.MEDIA_BUCKET.get(row.r2_key);
      if (!obj) {
        // R2 lifecycle already GC'd — mark so we don't keep retrying.
        // Drive mirror can't happen for this one now; it's lost.
        await env.DB.prepare(
          `UPDATE wa_media_files SET drive_error = 'r2_object_missing' WHERE media_id = ?`,
        ).bind(row.media_id).run().catch(() => {});
        results.push({ media_id: row.media_id, status: 'r2_missing' });
        failed++;
        continue;
      }

      // Daily folder derived from when bytes landed in R2 (UTC date)
      const date = (row.downloaded_at || new Date().toISOString()).slice(0, 10);
      const folderId = await getDailyFolderId(accessToken, rootFolderId, date, folderCache);

      // Filename: original if present (documents), else derive from R2 key
      const r2KeyParts = row.r2_key.split('/');
      const derivedFilename = r2KeyParts[r2KeyParts.length - 1]; // "<media_id><ext>"
      const filename = row.filename || derivedFilename;

      const arrayBuf = await obj.arrayBuffer();
      bytesThisRun += arrayBuf.byteLength;

      const drive = await uploadToDrive(
        accessToken, folderId, filename, row.mime_type, arrayBuf,
      );

      await env.DB.prepare(
        `UPDATE wa_media_files
            SET drive_file_id = ?, drive_web_link = ?, drive_folder_path = ?,
                drive_uploaded_at = ?, drive_error = NULL
          WHERE media_id = ?`,
      ).bind(
        drive.id,
        drive.webViewLink || null,
        `HE-WhatsApp-Media/${date}`,
        new Date().toISOString(),
        row.media_id,
      ).run();

      results.push({ media_id: row.media_id, drive_id: drive.id, status: 'ok' });
      mirrored++;
    } catch (e) {
      await env.DB.prepare(
        `UPDATE wa_media_files SET drive_error = ? WHERE media_id = ?`,
      ).bind((e.message || String(e)).slice(0, 1000), row.media_id).run().catch(() => {});
      results.push({ media_id: row.media_id, error: e.message, status: 'error' });
      failed++;
    }
  }

  return j({
    success:  true,
    mirrored,
    failed,
    total:    items.length,
    bytes:    bytesThisRun,
    results,
  });
}
