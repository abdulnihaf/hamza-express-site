// Redirect handler: hamzaexpress.in/go/{slug} → wa.me/918008002049?text={prefill}
// Reads prefill text from D1 source_links table — editable via admin dashboard
// QR codes point HERE, so changing the prefill text doesn't require new QR codes

const PHONE = '918008002049';

export async function onRequest(context) {
  const { params, env } = context;
  const slug = params.slug;

  if (!slug) {
    return new Response('Missing slug', { status: 400 });
  }

  try {
    const db = env.DB;
    const row = await db.prepare('SELECT prefill_text FROM source_links WHERE slug = ?').bind(slug).first();

    if (!row) {
      // Fallback: redirect to wa.me without prefill if slug not found
      return Response.redirect(`https://wa.me/${PHONE}`, 302);
    }

    // Increment click counter before redirecting
    await db.prepare('UPDATE source_links SET clicks = clicks + 1 WHERE slug = ?').bind(slug).run();

    const prefill = encodeURIComponent(row.prefill_text);
    return Response.redirect(`https://wa.me/${PHONE}?text=${prefill}`, 302);

  } catch (err) {
    // If DB fails, still redirect to WhatsApp
    return Response.redirect(`https://wa.me/${PHONE}`, 302);
  }
}
