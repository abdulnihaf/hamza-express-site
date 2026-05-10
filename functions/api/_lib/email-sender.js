// _lib/email-sender.js — Gmail API send helper for HE Creator flow.
//
// Refreshes a short-lived access token from a long-lived refresh token, then
// POSTs an RFC 2822 message base64url-encoded to /gmail/v1/users/me/messages/send.
//
// Required env (set as Cloudflare Pages secrets):
//   GMAIL_CLIENT_ID         — Hamza Express Email Sender OAuth client (in nihaf@hnhotels.in GCP project)
//   GMAIL_CLIENT_SECRET     — same client's secret
//   GMAIL_REFRESH_TOKEN     — minted by /api/email-auth (one-time, gmail.send scope)
//   GMAIL_SENDER            — display address (e.g. "nihaf@hnhotels.in")
//
// Usage:
//   import { sendEmail } from './_lib/email-sender.js';
//   const r = await sendEmail(env, {
//     to:       'creator@example.com',
//     subject:  'An invitation from Hamza Hotel',
//     html:     '<html>…</html>',
//     reply_to: 'nihaf@hnhotels.in',          // optional, defaults to sender
//     from_name: 'Nihaf · Hamza Express',     // optional friendly name
//   });
//   // → { ok: true, message_id }  on success
//   // → { ok: false, status, error } on failure

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Cache the access token in module scope (Worker-instance memory) for the rest
// of its TTL. Gmail access tokens last 1h. We refresh ~5 min before expiry.
let cachedToken = null;
let cachedExpiresAt = 0;

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedExpiresAt > now + 300) return cachedToken;

  const clientId = env.GMAIL_CLIENT_ID;
  const clientSecret = env.GMAIL_CLIENT_SECRET;
  const refreshToken = env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN — run /api/email-auth first');
  }

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const j = await resp.json();
  if (!resp.ok || !j.access_token) {
    throw new Error(`Gmail token refresh failed (${resp.status}): ${JSON.stringify(j).slice(0, 300)}`);
  }
  cachedToken = j.access_token;
  cachedExpiresAt = now + (j.expires_in || 3600);
  return cachedToken;
}

// Base64-url encode a UTF-8 string, no padding.
function b64url(str) {
  // Use TextEncoder + btoa (Workers runtime supports both)
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Build a minimal RFC 2822 message — HTML body with UTF-8.
function buildRfc2822({ from, to, subject, html, reply_to }) {
  // Subject must be RFC 2047 encoded if it contains non-ASCII
  const encSubject = /[^\x00-\x7F]/.test(subject)
    ? `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`
    : subject;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    reply_to ? `Reply-To: ${reply_to}` : null,
    `Subject: ${encSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ].filter(Boolean).join('\r\n');

  return headers + '\r\n\r\n' + html;
}

export async function sendEmail(env, opts) {
  if (!opts || !opts.to || !opts.subject || !opts.html) {
    return { ok: false, error: 'to, subject and html are required' };
  }
  if (!env.GMAIL_SENDER) {
    return { ok: false, error: 'GMAIL_SENDER not configured' };
  }

  const fromName = opts.from_name || 'Nihaf · Hamza Express';
  const fromEmail = env.GMAIL_SENDER;
  const fromHeader = `"${fromName}" <${fromEmail}>`;

  let accessToken;
  try {
    accessToken = await getAccessToken(env);
  } catch (e) {
    return { ok: false, error: 'token_refresh_failed', detail: e.message };
  }

  const raw = buildRfc2822({
    from: fromHeader,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    reply_to: opts.reply_to || fromEmail,
  });
  const encoded = b64url(raw);

  const resp = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      error: data?.error?.message || 'send_failed',
      detail: data?.error || data,
    };
  }
  return { ok: true, message_id: data.id, thread_id: data.threadId };
}
