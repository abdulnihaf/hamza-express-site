// Hamza Express — Marketing API
// Cloudflare Pages Function: /api/marketing
// Handles: organic post CRUD, Drive archiving, audience export, attribution
// Bindings: DB (D1), MARKETING_IMAGES (R2), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // ─── ORGANIC MARKETING (no auth) ───
    switch (action) {
      case 'get-week':
        return await getWeek(url, env);
      case 'save-week':
        return await saveWeek(request, env);
      case 'update-post-status':
        return await updatePostStatus(request, env);
      case 'upload-image':
        return await uploadImage(request, env);
      case 'get-image':
        return await getImage(url, env);
      case 'log-publish':
        return await logPublish(request, env);
      case 'get-publish-log':
        return await getPublishLog(url, env);
      case 'upload-to-drive':
        return await uploadToDrive(request, env);
      case 'drive-status':
        return await driveStatus(url, env);
      case 'google-auth':
        return await googleAuthRedirect(url, env);
      case 'google-callback':
        return await googleCallback(url, env);

      // ─── AUDIENCE/ATTRIBUTION (API key required) ───
      case 'audiences':
      case 'attribution':
      case 'segments_update': {
        const apiKey = request.headers.get('X-API-Key') || url.searchParams.get('key');
        if (apiKey !== env.DASHBOARD_API_KEY) {
          return json({ error: 'Unauthorized' }, 401);
        }
        if (action === 'audiences') return handleAudiences(env.DB, url);
        if (action === 'attribution') return handleAttribution(env.DB, url);
        return handleSegmentUpdate(env.DB);
      }

      default:
        return json({ success: false, error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}

// ═══════════════════════════════════════════════════
// WEEKLY POSTS
// ═══════════════════════════════════════════════════

async function getWeek(url, env) {
  const weekStart = url.searchParams.get('week');
  const brand = url.searchParams.get('brand') || 'he';
  if (!weekStart) return json({ success: false, error: 'Missing week param' }, 400);

  const posts = await env.DB.prepare(
    'SELECT * FROM marketing_posts WHERE brand = ? AND week_start = ? ORDER BY post_number'
  ).bind(brand, weekStart).all();

  return json({ success: true, posts: posts.results || [] });
}

async function saveWeek(request, env) {
  const body = await request.json();
  const { brand = 'he', weekStart, posts } = body;
  if (!weekStart || !posts || !Array.isArray(posts)) {
    return json({ success: false, error: 'Missing weekStart or posts array' }, 400);
  }

  const stmt = env.DB.prepare(`
    INSERT INTO marketing_posts (brand, week_start, post_number, post_date, time_slot, title, objective,
      prompt_ig, prompt_fb, prompt_google, caption_ig, caption_fb, caption_google,
      status_ig, status_fb, status_google, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(brand, week_start, post_number) DO UPDATE SET
      post_date=excluded.post_date, time_slot=excluded.time_slot, title=excluded.title,
      objective=excluded.objective, prompt_ig=excluded.prompt_ig, prompt_fb=excluded.prompt_fb,
      prompt_google=excluded.prompt_google, caption_ig=excluded.caption_ig, caption_fb=excluded.caption_fb,
      caption_google=excluded.caption_google, status_ig=excluded.status_ig, status_fb=excluded.status_fb,
      status_google=excluded.status_google, updated_at=datetime('now')
  `);

  const batch = posts.map(p => stmt.bind(
    brand, weekStart, p.post_number, p.post_date, p.time_slot, p.title, p.objective,
    p.prompt_ig || null, p.prompt_fb || null, p.prompt_google || null,
    p.caption_ig || null, p.caption_fb || null, p.caption_google || null,
    p.status_ig || 'pending', p.status_fb || 'pending', p.status_google || 'pending'
  ));

  await env.DB.batch(batch);
  return json({ success: true, saved: posts.length });
}

async function updatePostStatus(request, env) {
  const { brand = 'he', weekStart, postNumber, platform, status } = await request.json();
  if (!weekStart || !postNumber || !platform || !status) {
    return json({ success: false, error: 'Missing required fields' }, 400);
  }

  const col = `status_${platform}`;
  const validCols = ['status_ig', 'status_fb', 'status_google'];
  if (!validCols.includes(col)) return json({ success: false, error: 'Invalid platform' }, 400);

  await env.DB.prepare(
    `UPDATE marketing_posts SET ${col} = ?, updated_at = datetime('now') WHERE brand = ? AND week_start = ? AND post_number = ?`
  ).bind(status, brand, weekStart, postNumber).run();

  return json({ success: true });
}

// ═══════════════════════════════════════════════════
// IMAGE UPLOAD (R2)
// ═══════════════════════════════════════════════════

async function uploadImage(request, env) {
  if (!env.MARKETING_IMAGES) {
    return json({ success: false, error: 'R2 bucket MARKETING_IMAGES not bound' }, 500);
  }

  const formData = await request.formData();
  const file = formData.get('image');
  const brand = formData.get('brand') || 'he';
  const weekStart = formData.get('weekStart');
  const postNumber = formData.get('postNumber');
  const platform = formData.get('platform');

  if (!file || !weekStart || !postNumber || !platform) {
    return json({ success: false, error: 'Missing image, weekStart, postNumber, or platform' }, 400);
  }

  const ext = file.name?.split('.').pop() || 'jpg';
  const key = `${brand}/${weekStart}/post-${String(postNumber).padStart(2, '0')}-${platform}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  await env.MARKETING_IMAGES.put(key, arrayBuffer, {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });

  const colMap = { ig: 'image_key_ig', fb: 'image_key_fb', google: 'image_key_google' };
  const col = colMap[platform];
  if (col) {
    await env.DB.prepare(
      `UPDATE marketing_posts SET ${col} = ?, updated_at = datetime('now') WHERE brand = ? AND week_start = ? AND post_number = ?`
    ).bind(key, brand, weekStart, postNumber).run();
  }

  return json({ success: true, key, url: `/api/marketing?action=get-image&key=${encodeURIComponent(key)}` });
}

async function getImage(url, env) {
  if (!env.MARKETING_IMAGES) {
    return new Response('R2 not bound', { status: 500, headers: CORS });
  }

  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing key', { status: 400, headers: CORS });

  const obj = await env.MARKETING_IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404, headers: CORS });

  const headers = new Headers(CORS);
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400');

  return new Response(obj.body, { headers });
}

// ═══════════════════════════════════════════════════
// PUBLISH LOG
// ═══════════════════════════════════════════════════

async function logPublish(request, env) {
  const { postId, brand = 'he', platform, status, platformPostId, errorMessage, imageUrl, driveFileId } = await request.json();

  await env.DB.prepare(
    `INSERT INTO post_publish_log (post_id, brand, platform, status, platform_post_id, error_message, image_url, drive_file_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(postId || null, brand, platform, status, platformPostId || null, errorMessage || null, imageUrl || null, driveFileId || null).run();

  return json({ success: true });
}

async function getPublishLog(url, env) {
  const brand = url.searchParams.get('brand') || 'he';
  const limit = parseInt(url.searchParams.get('limit') || '50');

  const rows = await env.DB.prepare(
    'SELECT * FROM post_publish_log WHERE brand = ? ORDER BY published_at DESC LIMIT ?'
  ).bind(brand, limit).all();

  return json({ success: true, log: rows.results || [] });
}

// ═══════════════════════════════════════════════════
// GOOGLE AUTH (unified — GMB + Drive)
// ═══════════════════════════════════════════════════

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

async function googleAuthRedirect(url, env) {
  const brand = url.searchParams.get('brand') || 'he';
  const returnTo = url.searchParams.get('return') || `/ops/marketing/organic/?brand=${brand}`;
  if (!env.GOOGLE_CLIENT_ID) {
    return json({ success: false, error: 'GOOGLE_CLIENT_ID not configured' }, 400);
  }
  const redirectUri = `${url.origin}/api/marketing?action=google-callback`;
  const state = encodeURIComponent(JSON.stringify({ brand, returnTo }));
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(GOOGLE_SCOPES)}&access_type=offline&prompt=consent&state=${state}`;
  return Response.redirect(authUrl, 302);
}

async function googleCallback(url, env) {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  let brand = 'he', returnTo = '/ops/marketing/organic/';

  try {
    const state = JSON.parse(decodeURIComponent(url.searchParams.get('state') || '{}'));
    brand = state.brand || 'he';
    returnTo = state.returnTo || `/ops/marketing/organic/?brand=${brand}`;
  } catch {}

  if (error) {
    return new Response(`<html><body><h2>Authorization Failed</h2><p>${error}</p><a href="${returnTo}">Back</a></body></html>`, {
      headers: { 'Content-Type': 'text/html', ...CORS },
    });
  }

  if (!code) {
    return json({ success: false, error: 'Missing authorization code' }, 400);
  }

  const redirectUri = `${url.origin}/api/marketing?action=google-callback`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenResp.json();

  if (tokens.error) {
    return new Response(`<html><body><h2>Token Exchange Failed</h2><p>${tokens.error_description || tokens.error}</p><a href="${returnTo}">Back</a></body></html>`, {
      headers: { 'Content-Type': 'text/html', ...CORS },
    });
  }

  if (tokens.refresh_token) {
    try {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO gmb_tokens (brand, refresh_token, access_token, token_expires_at, updated_at) VALUES (?, ?, ?, datetime("now", "+3500 seconds"), datetime("now"))'
      ).bind(brand, tokens.refresh_token, tokens.access_token || null).run();
    } catch (e) {
      return new Response(`<html><body><h2>Database Error</h2><p>${e.message}</p></body></html>`, {
        headers: { 'Content-Type': 'text/html', ...CORS },
      });
    }
  }

  const sep = returnTo.includes('?') ? '&' : '?';
  return Response.redirect(`${url.origin}${returnTo}${sep}google=connected`, 302);
}

async function getGoogleAccessToken(brand, env) {
  const row = await env.DB.prepare('SELECT refresh_token FROM gmb_tokens WHERE brand = ?').bind(brand).first();
  if (!row) return null;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await tokenResp.json();
  return data.access_token || null;
}

// ═══════════════════════════════════════════════════
// GOOGLE DRIVE — Asset archiving
// ═══════════════════════════════════════════════════

async function driveStatus(url, env) {
  const brand = url.searchParams.get('brand') || 'he';
  try {
    const row = await env.DB.prepare('SELECT refresh_token FROM gmb_tokens WHERE brand = ?').bind(brand).first();
    return json({ success: true, connected: !!row });
  } catch {
    return json({ success: true, connected: false });
  }
}

async function uploadToDrive(request, env) {
  const { brand = 'he', weekStart, postNumber, platform, imageKey } = await request.json();
  if (!weekStart || !postNumber || !platform) {
    return json({ success: false, error: 'Missing weekStart, postNumber, or platform' }, 400);
  }

  const accessToken = await getGoogleAccessToken(brand, env);
  if (!accessToken) {
    return json({ success: false, needsAuth: true, error: 'Google Drive not connected' });
  }

  const r2Key = imageKey || `${brand}/${weekStart}/post-${String(postNumber).padStart(2, '0')}-${platform}.jpg`;
  const obj = env.MARKETING_IMAGES ? await env.MARKETING_IMAGES.get(r2Key) : null;
  if (!obj) {
    return json({ success: false, error: 'Image not found in R2: ' + r2Key }, 404);
  }

  const brandFolder = brand === 'nch' ? 'NCH Marketing' : 'HE Marketing';

  const rootFolderId = await findOrCreateFolder(accessToken, brandFolder, 'root', brand, env);
  const weekFolderName = `Week-${weekStart}`;
  const weekFolderId = await findOrCreateFolder(accessToken, weekFolderName, rootFolderId, brand, env);

  const fileName = `post-${String(postNumber).padStart(2, '0')}-${platform}.${r2Key.split('.').pop() || 'jpg'}`;
  const contentType = obj.httpMetadata?.contentType || 'image/jpeg';
  const imageBytes = await obj.arrayBuffer();

  const boundary = '---he-drive-boundary';
  const metadata = JSON.stringify({
    name: fileName,
    parents: [weekFolderId],
  });

  const base64 = arrayBufferToBase64(imageBytes);
  const multipartBody = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;

  const uploadResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  const fileData = await uploadResp.json();

  if (fileData.error) {
    return json({ success: false, error: fileData.error.message || 'Drive upload failed' });
  }

  await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  const driveUrl = fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`;

  return json({
    success: true,
    driveFileId: fileData.id,
    driveUrl,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileData.id}&sz=w200`,
  });
}

async function findOrCreateFolder(accessToken, folderName, parentId, brand, env) {
  const folderPath = parentId === 'root' ? folderName : `${parentId}/${folderName}`;

  try {
    const cached = await env.DB.prepare(
      'SELECT folder_id FROM drive_folders WHERE brand = ? AND folder_path = ?'
    ).bind(brand, folderPath).first();
    if (cached) return cached.folder_id;
  } catch {}

  const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const searchResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const searchData = await searchResp.json();

  let folderId;
  if (searchData.files?.length) {
    folderId = searchData.files[0].id;
  } else {
    const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    });
    const createData = await createResp.json();
    folderId = createData.id;
  }

  try {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO drive_folders (brand, folder_path, folder_id) VALUES (?, ?, ?)'
    ).bind(brand, folderPath, folderId).run();
  } catch {}

  return folderId;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ═══════════════════════════════════════════════════
// AUDIENCE EXPORT (API key protected)
// ═══════════════════════════════════════════════════

async function handleAudiences(db, url) {
  const segment = url.searchParams.get('segment') || 'all';
  const format = url.searchParams.get('format') || 'json';

  let query;
  switch (segment) {
    case 'all':
      query = 'SELECT wa_id as phone, name, total_orders, total_spent, first_source FROM wa_users ORDER BY total_orders DESC';
      break;
    case 'best_customers':
      query = `SELECT wa_id as phone, name, total_orders, total_spent, first_source FROM wa_users
               WHERE total_orders >= 3 AND total_spent > 400 ORDER BY total_spent DESC`;
      break;
    case 'lapsed':
      query = `SELECT wa_id as phone, name, total_orders, total_spent, first_source FROM wa_users
               WHERE total_orders = 1 AND last_active_at < datetime('now', '-14 days')
               ORDER BY last_active_at ASC`;
      break;
    case 'dormant_regulars':
      query = `SELECT wa_id as phone, name, total_orders, total_spent, first_source FROM wa_users
               WHERE total_orders >= 3 AND last_active_at < datetime('now', '-3 days')
               ORDER BY total_orders DESC`;
      break;
    case 'active_regulars':
      query = `SELECT wa_id as phone, name, total_orders, total_spent, first_source FROM wa_users
               WHERE total_orders >= 10 AND last_active_at > datetime('now', '-7 days')
               ORDER BY total_orders DESC`;
      break;
    case 'high_value_onetimers':
      query = `SELECT wa_id as phone, name, total_orders, total_spent, first_source FROM wa_users
               WHERE total_orders = 1 AND total_spent > 300 AND last_active_at < datetime('now', '-7 days')
               ORDER BY total_spent DESC`;
      break;
    default:
      return json({ error: 'Unknown segment', available: ['all', 'best_customers', 'lapsed', 'dormant_regulars', 'active_regulars', 'high_value_onetimers'] }, 400);
  }

  const { results } = await db.prepare(query).all();

  if (format === 'csv') {
    const header = 'phone,name,total_orders,total_spent,first_source';
    const rows = results.map(r =>
      `${r.phone},"${(r.name || '').replace(/"/g, '""')}",${r.total_orders},${r.total_spent},${r.first_source || ''}`
    );
    return new Response([header, ...rows].join('\n'), {
      headers: { ...CORS, 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="he-audience-${segment}-${new Date().toISOString().slice(0,10)}.csv"` },
    });
  }

  const metaFormat = url.searchParams.get('meta') === '1';
  if (metaFormat) {
    const phones = results.map(r => r.phone.replace(/\D/g, ''));
    return json({ segment, count: phones.length, phones, format_note: 'Upload to Meta Ads Manager > Audiences > Custom Audience > Customer list' });
  }

  return json({ segment, count: results.length, users: results });
}

// ═══════════════════════════════════════════════════
// ATTRIBUTION (API key protected)
// ═══════════════════════════════════════════════════

async function handleAttribution(db, url) {
  const days = parseInt(url.searchParams.get('days') || '30');

  const bySource = await db.prepare(`
    SELECT COALESCE(acquisition_source, 'organic') as source, COUNT(*) as order_count,
      SUM(total) as revenue, AVG(total) as avg_order_value, COUNT(DISTINCT wa_id) as unique_customers
    FROM wa_orders WHERE payment_status = 'paid' AND created_at > datetime('now', '-' || ? || ' days')
    GROUP BY COALESCE(acquisition_source, 'organic') ORDER BY revenue DESC
  `).bind(days).all();

  const usersBySource = await db.prepare(`
    SELECT COALESCE(first_source, 'organic') as source, COUNT(*) as user_count,
      AVG(total_orders) as avg_orders, AVG(total_spent) as avg_ltv
    FROM wa_users WHERE created_at > datetime('now', '-' || ? || ' days')
    GROUP BY COALESCE(first_source, 'organic') ORDER BY user_count DESC
  `).bind(days).all();

  const ctwaMetrics = await db.prepare(`
    SELECT COUNT(DISTINCT wa_id) as ctwa_conversations,
      COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as ctwa_orders,
      SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END) as ctwa_revenue
    FROM wa_orders WHERE ctwa_clid IS NOT NULL AND created_at > datetime('now', '-' || ? || ' days')
  `).bind(days).first();

  const dailyTrend = await db.prepare(`
    SELECT date(created_at) as day, COALESCE(acquisition_source, 'organic') as source,
      COUNT(*) as orders, SUM(total) as revenue
    FROM wa_orders WHERE payment_status = 'paid' AND created_at > datetime('now', '-7 days')
    GROUP BY date(created_at), COALESCE(acquisition_source, 'organic') ORDER BY day DESC, revenue DESC
  `).all();

  return json({
    period_days: days,
    orders_by_source: bySource.results,
    users_by_source: usersBySource.results,
    ctwa_metrics: {
      conversations: ctwaMetrics?.ctwa_conversations || 0,
      orders: ctwaMetrics?.ctwa_orders || 0,
      revenue: ctwaMetrics?.ctwa_revenue || 0,
      conversion_rate: ctwaMetrics?.ctwa_conversations
        ? ((ctwaMetrics.ctwa_orders / ctwaMetrics.ctwa_conversations) * 100).toFixed(1) + '%' : '0%',
    },
    daily_trend: dailyTrend.results,
  });
}

// ═══════════════════════════════════════════════════
// SEGMENT UPDATE (API key protected)
// ═══════════════════════════════════════════════════

async function handleSegmentUpdate(db) {
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE wa_users SET segment = CASE
      WHEN total_orders = 0 THEN 'new'
      WHEN total_orders <= 2 THEN 'learning'
      WHEN total_orders <= 9 AND last_active_at > datetime('now', '-7 days') THEN 'familiar'
      WHEN total_orders >= 10 AND last_active_at > datetime('now', '-7 days') THEN 'regular'
      WHEN total_orders >= 3 AND last_active_at < datetime('now', '-3 days') THEN 'dormant'
      ELSE 'inactive'
    END
  `).run();

  const counts = await db.prepare(
    'SELECT segment, COUNT(*) as count FROM wa_users GROUP BY segment ORDER BY count DESC'
  ).all();

  return json({ success: true, updated_at: now, segment_counts: counts.results });
}
