#!/usr/bin/env node
// Generate OAuth token with Google Ads + Search Console + Business Profile scopes
// Run: node scripts/generate-organic-token.js
// Then add the printed refresh token as: wrangler pages secret put GOOGLE_ORGANIC_REFRESH_TOKEN

const https = require('https');
const http = require('http');
const url = require('url');

// ── FILL THESE IN ──────────────────────────────────────────────────────────
// Same client as Google Ads (hn-hotels-marketing project)
const CLIENT_ID     = process.env.GOOGLE_ADS_CLIENT_ID     || 'PASTE_CLIENT_ID_HERE';
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || 'PASTE_CLIENT_SECRET_HERE';
// ───────────────────────────────────────────────────────────────────────────

const REDIRECT_URI = 'http://localhost:9191/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/adwords',                  // Google Ads (keep existing)
  'https://www.googleapis.com/auth/webmasters.readonly',      // Search Console
  'https://www.googleapis.com/auth/business.manage',          // Google Business Profile
].join(' ');

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;  // force consent screen to get refresh_token

console.log('\n🔐 GOOGLE ORGANIC OAUTH SETUP');
console.log('─'.repeat(50));
console.log('Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n─'.repeat(50));
console.log('Waiting for callback on http://localhost:9191...\n');

// Local callback server
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (!parsed.query.code) {
    res.end('No code received');
    return;
  }

  const code = parsed.query.code;
  res.end('<html><body><h2>✅ Auth complete! Check your terminal.</h2></body></html>');

  // Exchange code for tokens
  const tokenBody = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  }).toString();

  const tokenReq = https.request({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': tokenBody.length },
  }, tokenRes => {
    let body = '';
    tokenRes.on('data', d => body += d);
    tokenRes.on('end', () => {
      const data = JSON.parse(body);
      if (data.refresh_token) {
        console.log('✅ SUCCESS!\n');
        console.log('REFRESH TOKEN:', data.refresh_token);
        console.log('\nNow run:');
        console.log('  wrangler pages secret put GOOGLE_ORGANIC_REFRESH_TOKEN --project-name=hamza-express-site');
        console.log('  (paste the token above when prompted)\n');
      } else {
        console.log('❌ No refresh token:', JSON.stringify(data, null, 2));
      }
      server.close();
    });
  });
  tokenReq.write(tokenBody);
  tokenReq.end();
});

server.listen(9191);
