// QR Link Redirect — Cloudflare Pages Function
// Routes: /go/{slug} → 302 redirect to wa.me with pre-filled text from D1
// QR codes point here so pre-fill text can be changed without reprinting

const WA_PHONE = '918008002049';

export async function onRequest(context) {
  const slug = (context.params.path || [])[0];
  if (!slug) {
    return Response.redirect(`https://wa.me/${WA_PHONE}`, 302);
  }

  try {
    const row = await context.env.DB.prepare(
      'SELECT prefill_text FROM qr_links WHERE slug = ?'
    ).bind(slug).first();

    if (row) {
      const url = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(row.prefill_text)}`;
      return Response.redirect(url, 302);
    }
  } catch (e) {
    // D1 error — fall through to plain redirect
  }

  // Unknown slug — redirect to plain WhatsApp chat
  return Response.redirect(`https://wa.me/${WA_PHONE}`, 302);
}
