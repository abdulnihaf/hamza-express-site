// QR Links Admin API — Cloudflare Pages Function
// Manages redirect URLs for station QR codes
// Endpoints: ?action=verify-pin, ?action=list, POST action=update

const PINS = {
  '5882': { name: 'Admin' },
  '0305': { name: 'Nihaf' },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');

  try {
    switch (action) {
      case 'verify-pin': {
        const pin = url.searchParams.get('pin');
        const user = PINS[pin];
        if (!user) return json({ success: false, error: 'Invalid PIN' });
        return json({ success: true, user: user.name });
      }

      case 'list': {
        const { results } = await context.env.DB.prepare(
          'SELECT slug, prefill_text, counter_key, updated_at FROM qr_links ORDER BY slug'
        ).all();
        return json({ success: true, links: results });
      }

      case 'update': {
        if (context.request.method !== 'POST') return json({ success: false, error: 'POST required' });
        const body = await context.request.json();
        const { slug, prefill_text } = body;
        if (!slug || !prefill_text) return json({ success: false, error: 'slug and prefill_text required' });

        await context.env.DB.prepare(
          "UPDATE qr_links SET prefill_text = ?, updated_at = datetime('now') WHERE slug = ?"
        ).bind(prefill_text, slug).run();

        const row = await context.env.DB.prepare(
          'SELECT slug, prefill_text, counter_key, updated_at FROM qr_links WHERE slug = ?'
        ).bind(slug).first();

        return json({ success: true, link: row });
      }

      default:
        return json({ success: false, error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
