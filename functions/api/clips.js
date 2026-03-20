// Hamza Express — Clips & Reels API
// Cloudflare Pages Function: /api/clips
// Endpoints: clip CRUD, tag query, reel management
// Auth: API key required (DASHBOARD_API_KEY)

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(context.request.url);
  const apiKey = context.request.headers.get('X-API-Key') || url.searchParams.get('key');

  if (apiKey !== context.env.DASHBOARD_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const db = context.env.DB;
  const action = url.searchParams.get('action');
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

  try {
    // ── Clip Actions ──

    if (action === 'list') {
      return handleList(db, url, json);
    }
    if (action === 'get') {
      return handleGet(db, url, json);
    }
    if (action === 'add') {
      return handleAdd(db, context, json);
    }
    if (action === 'update') {
      return handleUpdate(db, url, context, json);
    }
    if (action === 'delete') {
      return handleDelete(db, url, json);
    }
    if (action === 'tags') {
      return handleTags(db, json);
    }
    if (action === 'stats') {
      return handleStats(db, json);
    }

    // ── Reel Actions ──

    if (action === 'reels') {
      return handleReels(db, url, json);
    }
    if (action === 'reel-save') {
      return handleReelSave(db, context, json);
    }
    if (action === 'reel-delete') {
      return handleReelDelete(db, url, json);
    }
    if (action === 'reel-update-status') {
      return handleReelUpdateStatus(db, url, context, json);
    }

    return json({
      error: 'Unknown action',
      available: ['list', 'get', 'add', 'update', 'delete', 'tags', 'stats', 'reels', 'reel-save', 'reel-delete', 'reel-update-status']
    }, 400);

  } catch (error) {
    console.error('Clips API error:', error.message);
    return json({ error: error.message }, 500);
  }
}

// ── List clips with optional filters ──
async function handleList(db, url, json) {
  const tag = url.searchParams.get('tag');
  const source = url.searchParams.get('source');
  const minScore = parseInt(url.searchParams.get('min_score') || '0');
  const sort = url.searchParams.get('sort') || 'viral_score';
  const order = url.searchParams.get('order') || 'DESC';

  let query = 'SELECT * FROM clips WHERE 1=1';
  const params = [];

  if (tag) {
    query += ' AND tags LIKE ?';
    params.push(`%${tag}%`);
  }
  if (source) {
    query += ' AND source = ?';
    params.push(source);
  }
  if (minScore > 0) {
    query += ' AND viral_score >= ?';
    params.push(minScore);
  }

  const validSorts = ['viral_score', 'duration_s', 'added_at', 'id'];
  const validOrders = ['ASC', 'DESC'];
  const sortCol = validSorts.includes(sort) ? sort : 'viral_score';
  const sortOrder = validOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';
  query += ` ORDER BY ${sortCol} ${sortOrder}`;

  const { results } = await db.prepare(query).bind(...params).all();
  return json({ clips: results, count: results.length });
}

// ── Get single clip ──
async function handleGet(db, url, json) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);

  const clip = await db.prepare('SELECT * FROM clips WHERE id = ?').bind(id).first();
  if (!clip) return json({ error: 'Clip not found' }, 404);
  return json(clip);
}

// ── Add new clip ──
async function handleAdd(db, context, json) {
  const body = await context.request.json();
  const { id, source, filename, duration_s, resolution, tags, description, viral_score, thumbnail_url } = body;

  if (!id || !source || !filename || !tags) {
    return json({ error: 'id, source, filename, tags required' }, 400);
  }

  await db.prepare(
    'INSERT INTO clips (id, source, filename, duration_s, resolution, tags, description, viral_score, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, source, filename, duration_s || null, resolution || null, tags, description || null, viral_score || 5, thumbnail_url || null).run();

  return json({ ok: true, id });
}

// ── Update clip ──
async function handleUpdate(db, url, context, json) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);

  const body = await context.request.json();
  const fields = [];
  const params = [];

  for (const key of ['tags', 'description', 'viral_score', 'duration_s', 'resolution', 'thumbnail_url']) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(body[key]);
    }
  }

  if (fields.length === 0) return json({ error: 'No fields to update' }, 400);

  params.push(id);
  await db.prepare(`UPDATE clips SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
  return json({ ok: true, id });
}

// ── Delete clip ──
async function handleDelete(db, url, json) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);

  await db.prepare('DELETE FROM clips WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}

// ── List all unique tags with counts ──
async function handleTags(db, json) {
  const { results } = await db.prepare('SELECT tags FROM clips').all();
  const tagCounts = {};
  for (const row of results) {
    for (const tag of row.tags.split(',')) {
      const t = tag.trim().toUpperCase();
      if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  // Sort by count descending
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  return json({ tags: sorted });
}

// ── Stats summary ──
async function handleStats(db, json) {
  const total = await db.prepare('SELECT COUNT(*) as count FROM clips').first();
  const sources = await db.prepare('SELECT source, COUNT(*) as count FROM clips GROUP BY source').all();
  const avgScore = await db.prepare('SELECT AVG(viral_score) as avg FROM clips').first();
  const reelCount = await db.prepare('SELECT COUNT(*) as count FROM reels').first();

  return json({
    total_clips: total.count,
    sources: sources.results,
    avg_viral_score: Math.round((avgScore.avg || 0) * 10) / 10,
    total_reels: reelCount.count,
  });
}

// ── List reels ──
async function handleReels(db, url, json) {
  const status = url.searchParams.get('status');
  let query = 'SELECT * FROM reels';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC';

  const { results } = await db.prepare(query).bind(...params).all();
  return json({ reels: results, count: results.length });
}

// ── Save reel draft ──
async function handleReelSave(db, context, json) {
  const body = await context.request.json();
  const { id, name, concept, clip_sequence, duration_s } = body;

  if (!name || !clip_sequence) {
    return json({ error: 'name, clip_sequence required' }, 400);
  }

  const seqStr = typeof clip_sequence === 'string' ? clip_sequence : JSON.stringify(clip_sequence);

  if (id) {
    // Update existing
    await db.prepare(
      'UPDATE reels SET name = ?, concept = ?, clip_sequence = ?, duration_s = ? WHERE id = ?'
    ).bind(name, concept || null, seqStr, duration_s || null, id).run();
    return json({ ok: true, id });
  } else {
    // Insert new
    const result = await db.prepare(
      'INSERT INTO reels (name, concept, clip_sequence, duration_s) VALUES (?, ?, ?, ?)'
    ).bind(name, concept || null, seqStr, duration_s || null).run();
    return json({ ok: true, id: result.meta.last_row_id });
  }
}

// ── Delete reel ──
async function handleReelDelete(db, url, json) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);

  await db.prepare('DELETE FROM reels WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}

// ── Update reel status ──
async function handleReelUpdateStatus(db, url, context, json) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);

  const body = await context.request.json();
  const { status, export_path, ig_media_id } = body;

  if (!status) return json({ error: 'status required' }, 400);

  const validStatuses = ['draft', 'exported', 'published'];
  if (!validStatuses.includes(status)) {
    return json({ error: `status must be one of: ${validStatuses.join(', ')}` }, 400);
  }

  let query = 'UPDATE reels SET status = ?';
  const params = [status];

  if (export_path) { query += ', export_path = ?'; params.push(export_path); }
  if (ig_media_id) { query += ', ig_media_id = ?'; params.push(ig_media_id); }
  if (status === 'published') { query += ', published_at = datetime(\'now\')'; }

  query += ' WHERE id = ?';
  params.push(id);

  await db.prepare(query).bind(...params).run();
  return json({ ok: true, id, status });
}
