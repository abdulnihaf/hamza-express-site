// HN Hotels Group — Gmail Signature OAuth Callback
// Handles: /api/signature-callback?code=...
// Flow: user authorises gmail.settings.basic → we set their signature → redirect back

const SIGNATURE_HTML = (fullName) => `
<table cellpadding="0" cellspacing="0" border="0"
  style="font-family:Arial,Helvetica,sans-serif;color:#333333;max-width:500px;border-collapse:collapse">
  <tr>
    <td colspan="3" style="padding:0 0 14px 0;border-bottom:2px solid #713520;font-size:0;line-height:0">&nbsp;</td>
  </tr>
  <tr>
    <td style="padding:14px 18px 14px 0;vertical-align:middle;width:68px">
      <img src="https://hamzaexpress.in/assets/brand/he-emblem.png" width="64" height="64"
        alt="HN Hotels" style="display:block;border-radius:50%;border:2px solid #D2B48C">
    </td>
    <td style="width:2px;background-color:#D2B48C;padding:0">&nbsp;</td>
    <td style="padding:14px 0 14px 18px;vertical-align:middle">
      <div style="font-size:16px;font-weight:700;color:#713520;letter-spacing:0.4px;line-height:1.2;margin-bottom:4px">${fullName}</div>
      <div style="font-size:10px;font-weight:700;color:#888888;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">HN&nbsp;Hotels&nbsp;Group</div>
      <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px">
        <tr>
          <td style="background-color:#713520;border-radius:3px;padding:3px 9px">
            <span style="font-size:10px;font-weight:700;color:#FAF3E3;letter-spacing:0.8px;text-transform:uppercase;white-space:nowrap">Hamza Express</span>
          </td>
          <td style="width:6px">&nbsp;</td>
          <td style="background-color:#C17817;border-radius:3px;padding:3px 9px">
            <span style="font-size:10px;font-weight:700;color:#FFFBF0;letter-spacing:0.8px;text-transform:uppercase;white-space:nowrap">Nawabi Chai House</span>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" border="0" style="font-size:11px;color:#666666;line-height:1.7">
        <tr>
          <td style="padding-right:10px;white-space:nowrap">
            <a href="https://hamzaexpress.in" style="color:#713520;text-decoration:none;font-weight:600">hamzaexpress.in</a>
          </td>
          <td style="color:#D2B48C;padding-right:10px">|</td>
          <td style="white-space:nowrap;color:#888">Bangalore, India</td>
          <td style="color:#D2B48C;padding:0 10px">|</td>
          <td style="white-space:nowrap;color:#888">Est.&nbsp;1918</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

export async function onRequest(context) {
  const { request, env } = context;
  const url    = new URL(request.url);
  const code   = url.searchParams.get('code');
  const error  = url.searchParams.get('error');
  const origin = url.origin;
  const redirect = `${origin}/api/signature-callback`;
  const setupUrl = `${origin}/ops/signature-setup/`;

  if (error) {
    return Response.redirect(`${setupUrl}?error=${encodeURIComponent(error)}`, 302);
  }
  if (!code) {
    return Response.redirect(`${setupUrl}?error=missing_code`, 302);
  }

  const CLIENT_ID     = env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return Response.redirect(`${setupUrl}?error=server_not_configured`, 302);
  }

  try {
    // 1. Exchange code for tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  redirect,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'Token exchange failed');

    const accessToken = tokenData.access_token;

    // 2. Get user profile (name + email)
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileResp.json();
    const fullName = profile.name || profile.email?.split('@')[0] || 'Team Member';
    const email    = profile.email;

    // 3. Get primary sendAs address
    const sendAsResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(email)}/settings/sendAs`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sendAsData = await sendAsResp.json();
    const primary = (sendAsData.sendAs || []).find(s => s.isPrimary);
    if (!primary) throw new Error('No primary send-as address found');

    // 4. Set signature
    const sigResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(email)}/settings/sendAs/${encodeURIComponent(primary.sendAsEmail)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signature: SIGNATURE_HTML(fullName) }),
      }
    );
    if (!sigResp.ok) {
      const err = await sigResp.json();
      throw new Error(err.error?.message || `Gmail API error ${sigResp.status}`);
    }

    // 5. Redirect to success
    return Response.redirect(
      `${setupUrl}?status=ok&name=${encodeURIComponent(fullName)}`,
      302
    );

  } catch (err) {
    return Response.redirect(
      `${setupUrl}?error=${encodeURIComponent(err.message)}`,
      302
    );
  }
}
