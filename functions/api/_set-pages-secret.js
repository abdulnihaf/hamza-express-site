// /api/_set-pages-secret — auth-gated server-side bridge to set Cloudflare Pages
// production env vars / secrets via the Cloudflare API. Used during one-time OAuth
// setup flows (e.g. /api/email-auth) where the browser captures a credential and
// needs to ship it into the project secrets WITHOUT round-tripping through the
// owner's clipboard or terminal.
//
// Auth: header X-Dashboard-Key OR query/body `key` must equal env.DASHBOARD_API_KEY.
// Body: { name: 'GMAIL_REFRESH_TOKEN', value: '...', secret?: true }
//   secret=true → stored as type 'secret_text' (default true)
//   secret=false → stored as type 'plain_text'
//
// Required env on this Pages project (set via wrangler):
//   CLOUDFLARE_API_TOKEN — Pages:Edit scope on the account
//   DASHBOARD_API_KEY    — owner's existing dashboard auth key
//
// Hard-coded for the hamza-express-site project on the HN account so we don't need
// extra env plumbing for those identifiers.

const ACCOUNT_ID = '3d506f78b08b3d95c667b82ef6ee7ab8';
const PROJECT = 'hamza-express-site';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Dashboard-Key',
};
const json = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { 'Content-Type': 'application/json', ...CORS },
});

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const providedKey = request.headers.get('X-Dashboard-Key')
    || new URL(request.url).searchParams.get('key')
    || body.key;
  if (!providedKey || providedKey !== env.DASHBOARD_API_KEY) {
    return json({ error: 'unauthorized' }, 401);
  }

  const name = (body.name || '').toString().trim();
  const value = (body.value || '').toString();
  const isSecret = body.secret !== false; // default true

  if (!name || !/^[A-Z][A-Z0-9_]+$/.test(name)) {
    return json({ error: 'invalid env var name (uppercase letters/digits/underscore only)' }, 400);
  }
  if (!value || value.length > 8192) {
    return json({ error: 'value missing or too long (max 8192 chars)' }, 400);
  }
  if (!env.CLOUDFLARE_API_TOKEN) {
    return json({ error: 'CLOUDFLARE_API_TOKEN env var not set on this project' }, 500);
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`;
  const cfBody = {
    deployment_configs: {
      production: {
        env_vars: {
          [name]: { value, type: isSecret ? 'secret_text' : 'plain_text' },
        },
      },
    },
  };

  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + env.CLOUDFLARE_API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cfBody),
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) {
    return json({
      error: 'cf_api_failed',
      status: resp.status,
      cf_errors: data.errors,
      cf_messages: data.messages,
    }, 502);
  }
  return json({ ok: true, name, type: isSecret ? 'secret_text' : 'plain_text' });
}
