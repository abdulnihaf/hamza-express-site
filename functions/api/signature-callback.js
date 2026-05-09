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

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequest(context) {
  const { request, env } = context;
  const url    = new URL(request.url);
  const code   = url.searchParams.get('code');
  const error  = url.searchParams.get('error');
  const debug  = url.searchParams.get('state') === 'debug';
  const origin = url.origin;
  const redirect = `${origin}/api/signature-callback`;
  const setupUrl = `${origin}/ops/signature-setup/`;

  const fail = (msg) => debug
    ? json({ step: 'early', error: msg }, 400)
    : Response.redirect(`${setupUrl}?error=${encodeURIComponent(msg)}`, 302);

  if (error) return fail(error);
  if (!code) return fail('missing_code');

  const CLIENT_ID     = env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) return fail('server_not_configured');

  const diag = {}; // collects debug info at every step

  try {
    // Step 1 — Exchange code for tokens
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
    diag.step1_token = { status: tokenResp.status, has_access_token: !!tokenData.access_token, error: tokenData.error, error_description: tokenData.error_description };
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'Token exchange failed');

    const accessToken = tokenData.access_token;

    // Step 2 — User profile
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileResp.json();
    diag.step2_profile = { status: profileResp.status, email: profile.email, name: profile.name, error: profile.error };
    const fullName = profile.name || profile.email?.split('@')[0] || 'Team Member';
    const email    = profile.email;

    // Step 3 — sendAs list
    const sendAsListResp = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sendAsData = await sendAsListResp.json();
    const sendAsList = sendAsData.sendAs || [];
    diag.step3_sendas = { status: sendAsListResp.status, count: sendAsList.length, addresses: sendAsList.map(s => ({ email: s.sendAsEmail, isPrimary: s.isPrimary })), raw_error: sendAsData.error };

    const sendAsAddr = (
      sendAsList.find(s => s.isPrimary) ||
      sendAsList.find(s => s.sendAsEmail?.toLowerCase() === email?.toLowerCase()) ||
      sendAsList[0]
    )?.sendAsEmail;

    if (!sendAsAddr) {
      if (debug) return json({ diag, error: 'No sendAs address resolved' }, 400);
      throw new Error('No sendAs address resolved');
    }
    diag.step3_resolved = sendAsAddr;

    // Step 4 — Set signature
    const sigResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(sendAsAddr)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: SIGNATURE_HTML(fullName) }),
      }
    );
    const sigBody = await sigResp.json();
    diag.step4_patch = { status: sigResp.status, ok: sigResp.ok, error: sigBody.error };

    if (!sigResp.ok) throw new Error(sigBody.error?.message || `Gmail PATCH error ${sigResp.status}`);

    if (debug) return json({ success: true, fullName, sendAsAddr, diag });

    return Response.redirect(
      `${setupUrl}?status=ok&name=${encodeURIComponent(fullName)}`,
      302
    );

  } catch (err) {
    if (debug) return json({ error: err.message, diag }, 500);
    return Response.redirect(
      `${setupUrl}?error=${encodeURIComponent(err.message)}`,
      302
    );
  }
}
