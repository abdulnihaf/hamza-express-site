// /api/email-auth — ONE-TIME setup flow to obtain a Gmail API refresh token
// for sending emails as nihaf@hnhotels.in via the Gmail API.
//
// Uses dedicated OAuth client "Hamza Express Email Sender" living in
// nihaf@hnhotels.in's Default Gemini Project (gen-lang-client-0856693577).
// Client credentials are stored as GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET on
// this Pages project. Sender is GMAIL_SENDER (= nihaf@hnhotels.in).
//
// Setup needed once:
//   1. Add this endpoint URL to the Authorized Redirect URIs of the Web
//      OAuth client in Google Cloud Console (already done at setup time)
//   2. Run this flow ONCE in a browser logged into nihaf@hnhotels.in
//   3. Paste the returned refresh token into wrangler:
//        wrangler pages secret put GMAIL_REFRESH_TOKEN --project-name=hamza-express-site
//
// After that the creator-application flow can send templated HTML emails to
// every applicant from nihaf@hnhotels.in — fully automated.
//
// Scope is gmail.send (minimum privilege — can only SEND, can't read inbox).

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
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
  const clientId = env.GMAIL_CLIENT_ID;
  const clientSecret = env.GMAIL_CLIENT_SECRET;
  const redirectUri = `${url.origin}/api/email-auth`;

  if (!clientId || !clientSecret) {
    return htmlResp(
      '<pre>Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET secrets on this project. Set them via wrangler pages secret put.</pre>',
      500,
    );
  }
  if (error) return htmlResp(`<pre>Google OAuth error: ${error}</pre>`, 400);

  // ─── Step A: initial visit — kick off consent ──────────────────────
  if (!code) {
    const providedKey = url.searchParams.get('key') || request.headers.get('X-API-Key');
    if (!providedKey || providedKey !== env.DASHBOARD_API_KEY) {
      return htmlResp(
        `<pre>Unauthorized. Call this with ?key=DASHBOARD_API_KEY on the first GET.

Usage:
  https://hamzaexpress.in/api/email-auth?key=YOUR_DASHBOARD_API_KEY

⚠️ IMPORTANT — sign in as nihaf@hnhotels.in when Google prompts.
The refresh token will be issued for whichever Google account consents.
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
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('login_hint', 'nihaf@hnhotels.in');
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
      `<pre>No refresh_token returned. Google has already issued one for this client + user.

Fix:
  1. Open https://myaccount.google.com/permissions
  2. Find the OAuth app (HN Hotels Private Limited / NCH Marketing Web)
  3. Click "Remove access"
  4. Retry /api/email-auth

Token response:
${JSON.stringify(tokenJson, null, 2)}
</pre>`,
      400,
    );
  }

  return htmlResp(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Gmail Auth Success</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0a0f1a;color:#f1f5f9;padding:40px;max-width:820px;margin:0 auto;line-height:1.5}
  h1{color:#10b981;font-size:22px;margin:0 0 8px}
  h2{color:#f97316;font-size:14px;text-transform:uppercase;letter-spacing:.5px;margin-top:28px}
  code,pre{background:#1a2234;padding:12px 14px;border-radius:6px;display:block;overflow-x:auto;font-family:'JetBrains Mono',Menlo,monospace;font-size:12px;word-break:break-all;white-space:pre-wrap;border:1px solid #2a3548}
  .step{margin:14px 0;padding:14px 16px;background:#111a2b;border-left:3px solid #f97316;border-radius:4px}
  .token{background:#042f2e;border:1px solid #10b981;color:#a7f3d0}
  .muted{color:#64748b;font-size:11px}
  button{background:#f97316;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:11px;margin-left:8px}
</style></head><body>
<h1>✅ Gmail OAuth connected</h1>
<p class="muted">Scope granted: <code style="display:inline;padding:2px 6px">gmail.send</code> (minimum privilege — can SEND only, cannot read inbox)</p>

<h2>Your Gmail refresh token</h2>
<code id="tok" class="token">${refreshToken}</code>
<button onclick="navigator.clipboard.writeText(document.getElementById('tok').textContent);this.textContent='Copied!'">Copy</button>
<p class="muted">⚠️ Shown ONCE. If you lose it, revoke at myaccount.google.com/permissions and re-run.</p>

<h2>Finish setup — 2 secrets</h2>

<div class="step">
<strong>1. Store the refresh token:</strong>
<pre>cd ~/Documents/Tech/hamza-express-site
npx wrangler pages secret put GMAIL_REFRESH_TOKEN --project-name=hamza-express-site
# paste the token above when prompted</pre>
</div>

<div class="step">
<strong>2. Set the sender email:</strong>
<pre>echo "nihaf@hnhotels.in" | npx wrangler pages secret put GMAIL_SENDER --project-name=hamza-express-site</pre>
</div>

<p class="muted" style="margin-top:24px">Then trigger a redeploy (any push to main) and the creator-application flow will start sending HTML emails alongside the WABA messages.</p>
</body></html>`);
}
