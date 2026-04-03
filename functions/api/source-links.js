// API for managing source links
// GET /api/source-links — list all links
// POST /api/source-links — update prefill text for a slug

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const db = env.DB;

  try {
    if (request.method === 'GET') {
      const { results } = await db.prepare('SELECT * FROM source_links ORDER BY category, slug').all();
      return new Response(JSON.stringify({ links: results }), { headers: CORS });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { slug, prefill_text } = body;

      if (!slug || !prefill_text) {
        return new Response(JSON.stringify({ error: 'slug and prefill_text required' }), { status: 400, headers: CORS });
      }

      await db.prepare('UPDATE source_links SET prefill_text = ?, updated_at = datetime(\'now\') WHERE slug = ?')
        .bind(prefill_text, slug).run();

      return new Response(JSON.stringify({ ok: true, slug, prefill_text }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
