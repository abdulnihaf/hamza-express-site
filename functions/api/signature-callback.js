// HN Hotels Group — Gmail Signature OAuth Callback
// Handles: /api/signature-callback?code=...
// Flow: user authorises gmail.settings.basic → we set their signature → redirect back

const SIGNATURE_HTML = (fullName) => `<table width="500" border="0" cellpadding="0" cellspacing="0" style="max-width:500px;border-collapse:collapse;background:transparent;">
  <tr><td colspan="3" style="padding:0;font-size:0;line-height:0;">
    <div style="height:3px;background:#713520;">&nbsp;</div>
    <div style="height:1px;background:#D2B48C;margin-top:3px;">&nbsp;</div>
  </td></tr>
  <tr>
    <td style="padding:14px 18px 14px 0;vertical-align:top;width:158px;">
      <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="text-align:center;padding-right:10px;">
            <img src="https://hamzaexpress.in/assets/brand/he-emblem.png" width="68" height="68" alt="Hamza Express" style="display:block;border-radius:50%;border:2px solid #D2B48C;">
            <div style="font-family:'Palatino Linotype',Georgia,serif;font-size:7px;font-weight:600;color:#713520;letter-spacing:0.8px;text-transform:uppercase;text-align:center;margin-top:5px;line-height:1.5;">Hamza<br>Express</div>
          </td>
          <td style="text-align:center;">
            <img src="https://hamzaexpress.in/assets/brand/nc-emblem.png" width="68" height="68" alt="Nawabi Chai House" style="display:block;border-radius:50%;border:2px solid #C17817;">
            <div style="font-family:'Palatino Linotype',Georgia,serif;font-size:7px;font-weight:600;color:#C17817;letter-spacing:0.8px;text-transform:uppercase;text-align:center;margin-top:5px;line-height:1.5;">Nawabi<br>Chai House</div>
          </td>
        </tr>
      </table>
    </td>
    <td style="width:1px;background:#D2B48C;padding:0;font-size:0;">&nbsp;</td>
    <td style="padding:14px 0 14px 20px;vertical-align:top;">
      <div style="font-family:'Palatino Linotype',Palatino,Georgia,serif;font-size:17px;font-weight:600;color:#713520;letter-spacing:0.4px;line-height:1.2;margin-bottom:3px;">${fullName}</div>
      <div style="font-family:'Palatino Linotype',Palatino,Georgia,serif;font-size:10px;font-weight:600;color:#333;letter-spacing:2px;text-transform:uppercase;line-height:1.3;margin-bottom:1px;">HN Hotels Group</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1;margin-bottom:10px;"><a href="https://hnhotels.in" style="color:#888;text-decoration:underline;">hnhotels.in</a></div>
      <div style="height:1px;background:#D2B48C;width:200px;margin-bottom:9px;">&nbsp;</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;line-height:1.8;white-space:nowrap;">
        <a href="https://hamzaexpress.in" style="color:#713520;text-decoration:underline;font-weight:700;">hamzaexpress.in</a>
        <span style="color:#D2B48C;margin:0 5px;">·</span>
        <a href="tel:+918008002049" style="color:#713520;text-decoration:none;font-weight:600;">+91&nbsp;8008002049</a>
      </div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;line-height:1.8;white-space:nowrap;">
        <a href="https://nawabichaihouse.com" style="color:#C17817;text-decoration:underline;font-weight:700;">nawabichaihouse.com</a>
        <span style="color:#D2B48C;margin:0 5px;">·</span>
        <a href="tel:+918008002049" style="color:#C17817;text-decoration:none;font-weight:600;">+91&nbsp;8008002049</a>
      </div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#aaa;line-height:1;margin-top:4px;white-space:nowrap;">Bangalore, India&nbsp;&nbsp;·&nbsp;&nbsp;Est.&nbsp;1918</div>
    </td>
  </tr>
  <tr><td colspan="3" style="padding:0;font-size:0;line-height:0;">
    <div style="height:1px;background:#D2B48C;">&nbsp;</div>
  </td></tr>
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

    // 3. Set signature (use the user's own email as the primary send-as address)
    const sigResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(email)}`,
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
