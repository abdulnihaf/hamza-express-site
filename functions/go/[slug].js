// Redirect handler: hamzaexpress.in/go/{slug}
//
// Two flavours of redirect, selected by which column is populated on
// source_links:
//
//   redirect_url  →  302 to an external URL (Swiggy, Zomato, Maps, etc.)
//                    Used for aggregator listings and off-platform CTAs.
//
//   prefill_text  →  302 to wa.me/918008002049?text={prefill}
//                    Used for WhatsApp entry points (station QRs, ad CTAs).
//
// Clicks are always incremented so we can see which CTAs are working.
// QR codes and ads point HERE, so the destination can change without
// re-printing QRs or editing ad creatives.

const PHONE = '918008002049';

export async function onRequest(context) {
  const { params, env } = context;
  const slug = params.slug;

  if (!slug) {
    return new Response('Missing slug', { status: 400 });
  }

  try {
    const db = env.DB;
    const row = await db.prepare(
      'SELECT prefill_text, redirect_url FROM source_links WHERE slug = ?'
    ).bind(slug).first();

    if (!row) {
      // Unknown slug — send them to the HE WABA with no prefill
      return Response.redirect(`https://wa.me/${PHONE}`, 302);
    }

    // Track the tap (swallow errors — redirect must always succeed)
    db.prepare('UPDATE source_links SET clicks = clicks + 1 WHERE slug = ?')
      .bind(slug).run().catch(() => {});

    // External redirect takes precedence (used for Swiggy, Zomato, Maps links)
    if (row.redirect_url) {
      return Response.redirect(row.redirect_url, 302);
    }

    // Default: WhatsApp deep link with prefill text
    const prefill = encodeURIComponent(row.prefill_text || '');
    return Response.redirect(`https://wa.me/${PHONE}?text=${prefill}`, 302);

  } catch (err) {
    return Response.redirect(`https://wa.me/${PHONE}`, 302);
  }
}
