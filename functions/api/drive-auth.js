// ═══════════════════════════════════════════════════════════════════
// /api/drive-auth   ·   Wave 3.0 Phase 2b bootstrap
// ═══════════════════════════════════════════════════════════════════
//
// ONE-TIME setup flow to obtain a Google Drive refresh token for the
// /api/media-mirror cron. The refresh token lets our Worker upload to
// Nihaf's personal 2 TB Drive without storing a password.
//
// Prereq (do this ONCE in Google Cloud Console):
//   1. Open the GOOGLE_CLIENT_ID OAuth client (the Web-type "NCH Marketing
//      Web" client — the one that already has nawabichaihouse.com and
//      hamzaexpress.in callbacks). GOOGLE_ADS_* secrets point at a
//      separate Desktop client that can't accept web redirects.
//   2. Add `https://hamzaexpress.in/api/drive-auth` to Authorized
//      redirect URIs
//   3. Save
//
// Flow:
//   GET /api/drive-auth            → bounces to Google consent screen
//   GET /api/drive-auth?code=XXX   → exchanges code, shows refresh token
//
// After this flow, store the token:
//   wrangler pages secret put GOOGLE_DRIVE_REFRESH_TOKEN --project-name=hamza-express-site
//
// Only drive.file scope is requested (minimum privilege — we only see
// files we create, never touches the rest of your Drive).
//
// This endpoint itself requires the DASHBOARD_API_KEY on the initial
// GET so random visitors can't trigger the OAuth prompt. The Google
// callback (with `code`) doesn't need the key — it carries its own
// state via the `code`, and an attacker without the client_secret
// can't exchange it.

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';

function htmlResp(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${url.origin}/api/drive-auth`;

  if (!clientId || !clientSecret) {
    return htmlResp(
      '<pre>Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets on this project.</pre>',
      500,
    );
  }

  if (error) {
    return htmlResp(`<pre>Google OAuth error: ${error}</pre>`, 400);
  }

  // ─── Step A: initial visit — kick off consent ──────────────────────
  if (!code) {
    const providedKey = url.searchParams.get('key') || request.headers.get('X-API-Key');
    if (!providedKey || providedKey !== env.DASHBOARD_API_KEY) {
      return htmlResp(
        `<pre>Unauthorized. Call this with ?key=DASHBOARD_API_KEY on the first GET.

Usage:
  https://hamzaexpress.in/api/drive-auth?key=YOUR_DASHBOARD_API_KEY
</pre>`,
        401,
      );
    }
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPE);
    authUrl.searchParams.set('access_type', 'offline');
    // prompt=consent forces Google to re-issue a refresh_token even if the
    // user has previously authorized this client (otherwise only access_token
    // comes back on subsequent runs, and we'd never get a refresh_token).
    authUrl.searchParams.set('prompt', 'consent');
    return Response.redirect(authUrl.toString(), 302);
  }

  // ─── Step B: callback — exchange code for refresh token ────────────
  const tokenResp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const tokenJson = await tokenResp.json();
  if (!tokenResp.ok) {
    return htmlResp(
      `<pre>Token exchange failed (${tokenResp.status}):\n${JSON.stringify(tokenJson, null, 2)}</pre>`,
      tokenResp.status,
    );
  }

  const refreshToken = tokenJson.refresh_token;
  if (!refreshToken) {
    return htmlResp(
      `<pre>No refresh_token returned. This usually means Google has already
issued one for this client. Fix:

  1. Open https://myaccount.google.com/permissions
  2. Find "HN Hotels Private Limited" (or the OAuth app for this client)
  3. Remove access
  4. Retry /api/drive-auth

Token response:
${JSON.stringify(tokenJson, null, 2)}
</pre>`,
      400,
    );
  }

  // ─── Step C: success — show the token for copy-paste ───────────────
  return htmlResp(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Drive Auth Success</title>
<style>
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#0a0f1a;color:#f1f5f9;padding:40px;max-width:820px;margin:0 auto;line-height:1.5}
  h1{color:#10b981;font-size:22px;margin:0 0 8px}
  h2{color:#f97316;font-size:14px;text-transform:uppercase;letter-spacing:.5px;margin-top:28px}
  code,pre{background:#1a2234;padding:12px 14px;border-radius:6px;display:block;overflow-x:auto;font-family:'JetBrains Mono',Menlo,monospace;font-size:12px;word-break:break-all;white-space:pre-wrap;border:1px solid #2a3548}
  .step{margin:14px 0;padding:14px 16px;background:#111a2b;border-left:3px solid #f97316;border-radius:4px}
  .token{background:#042f2e;border:1px solid #10b981;color:#a7f3d0}
  .muted{color:#64748b;font-size:11px}
  button{background:#f97316;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:11px;margin-left:8px}
</style></head><body>
<h1>✅ Google Drive OAuth connected</h1>
<p class="muted">Scope granted: <code style="display:inline;padding:2px 6px">drive.file</code> (minimum privilege — only files this app creates)</p>

<h2>Your refresh token</h2>
<code id="tok" class="token">${refreshToken}</code>
<button onclick="navigator.clipboard.writeText(document.getElementById('tok').textContent);this.textContent='Copied!'">Copy</button>
<p class="muted">⚠️ Shown ONCE. If you lose it, revoke the app at <a href="https://myaccount.google.com/permissions" style="color:#06b6d4">myaccount.google.com/permissions</a> and re-run this flow.</p>

<h2>Finish setup — 3 commands</h2>

<div class="step">
<strong>1. Store the refresh token as a Cloudflare Pages secret:</strong>
<pre>cd ~/Documents/Tech/hamza-express-site
npx wrangler pages secret put GOOGLE_DRIVE_REFRESH_TOKEN --project-name=hamza-express-site
# paste the token above when prompted</pre>
</div>

<div class="step">
<strong>2. Create a folder in Drive called <code style="display:inline;padding:2px 6px">HE-WhatsApp-Media</code>.</strong><br>
Open that folder. The URL looks like:
<pre>https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz</pre>
Copy the ID after <code style="display:inline;padding:2px 6px">/folders/</code>.
</div>

<div class="step">
<strong>3. Store the folder ID:</strong>
<pre>npx wrangler pages secret put GOOGLE_DRIVE_ROOT_FOLDER_ID --project-name=hamza-express-site
# paste the folder ID when prompted</pre>
</div>

<h2>Verify</h2>
<div class="step">
After Cloudflare Pages redeploys (~60 sec from the next git push), hit:
<pre>curl -X POST "https://hamzaexpress.in/api/media-mirror?key=YOUR_DASHBOARD_API_KEY"</pre>
Expected response: <code style="display:inline;padding:2px 6px">{ "success": true, "mirrored": N, ... }</code>
</div>

</body></html>`);
}
