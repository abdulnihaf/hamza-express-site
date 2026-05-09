// Nurture Engine — 72-hour CTWA follow-up automation
// GET /api/nurture?action=run — triggered by cron every 30 min (or manually)
// GET /api/nurture?action=templates — list all templates
// POST /api/nurture?action=update — update a template
// GET /api/nurture?action=queue — show pending nurture queue

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const WA_API_VERSION = 'v21.0';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const db = context.env.DB;
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'templates';

  try {
    // List templates (for dashboard editing)
    if (action === 'templates') {
      const templates = await db.prepare('SELECT * FROM nurture_templates ORDER BY stage').all();
      return new Response(JSON.stringify({ success: true, templates: templates.results || [] }), { headers: CORS });
    }

    // Update a template
    if (action === 'update' && context.request.method === 'POST') {
      const body = await context.request.json();
      const { id, message_text, button_1_text, button_1_id, button_2_text, button_2_id, active } = body;
      if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: CORS });

      await db.prepare(`UPDATE nurture_templates SET
        message_text = COALESCE(?, message_text),
        button_1_text = ?, button_1_id = ?,
        button_2_text = ?, button_2_id = ?,
        active = COALESCE(?, active),
        updated_at = datetime('now')
        WHERE id = ?`
      ).bind(message_text, button_1_text || null, button_1_id || null, button_2_text || null, button_2_id || null, active, id).run();

      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // Show pending queue (who needs nurture next)
    if (action === 'queue') {
      const now = Date.now();
      const queue = await db.prepare(`
        SELECT s.wa_id, u.name, s.ad_headline, s.ctwa_first_contact, s.nurture_stage,
          ROUND((julianday('now') - julianday(s.ctwa_first_contact)) * 24, 1) as hours_since_contact
        FROM wa_sessions s
        JOIN wa_users u ON s.wa_id = u.wa_id
        WHERE s.ctwa_clid IS NOT NULL
          AND s.nurture_stage < 3
          AND s.ctwa_first_contact IS NOT NULL
          AND s.wa_id NOT IN (SELECT wa_id FROM wa_orders WHERE payment_status = 'paid')
        ORDER BY s.ctwa_first_contact ASC
        LIMIT 50
      `).all();

      return new Response(JSON.stringify({ success: true, queue: queue.results || [] }), { headers: CORS });
    }

    // RUN nurture — send pending messages
    if (action === 'run') {
      const phoneId = context.env.WA_PHONE_ID;
      const token = context.env.WA_ACCESS_TOKEN;

      if (!phoneId || !token) {
        return new Response(JSON.stringify({ error: 'Missing WA credentials' }), { status: 500, headers: CORS });
      }

      // Get active templates
      const templates = await db.prepare('SELECT * FROM nurture_templates WHERE active = 1 ORDER BY stage').all();
      const templateMap = {};
      for (const t of (templates.results || [])) {
        templateMap[t.stage] = t;
      }

      // Find customers needing nurture
      const candidates = await db.prepare(`
        SELECT s.wa_id, s.ctwa_first_contact, s.nurture_stage, s.ad_headline,
          ROUND((julianday('now') - julianday(s.ctwa_first_contact)) * 24, 1) as hours_since
        FROM wa_sessions s
        WHERE s.ctwa_clid IS NOT NULL
          AND s.nurture_stage < 3
          AND s.ctwa_first_contact IS NOT NULL
          AND s.wa_id NOT IN (SELECT wa_id FROM wa_orders WHERE payment_status = 'paid')
          AND s.wa_id NOT IN (SELECT wa_id FROM wa_bookings WHERE status = 'confirmed')
      `).all();

      let sent = 0;
      let skipped = 0;

      for (const c of (candidates.results || [])) {
        const nextStage = c.nurture_stage + 1;
        const template = templateMap[nextStage];

        if (!template) { skipped++; continue; }

        // Check if enough hours have passed for this stage
        if (c.hours_since < template.trigger_hours) { skipped++; continue; }

        // Personalize message with ad headline / combo name
        let msgText = template.message_text;
        if (c.ad_headline) {
          msgText = msgText.replace('{combo}', c.ad_headline).replace('{ad}', c.ad_headline);
        }

        // Build message payload
        let payload;
        if (template.button_1_text && template.button_2_text) {
          // Interactive button message
          payload = {
            messaging_product: 'whatsapp', to: c.wa_id, type: 'interactive',
            interactive: {
              type: 'button',
              body: { text: msgText },
              action: {
                buttons: [
                  { type: 'reply', reply: { id: template.button_1_id, title: template.button_1_text } },
                  { type: 'reply', reply: { id: template.button_2_id, title: template.button_2_text } },
                ],
              },
            },
          };
        } else if (template.button_1_text) {
          payload = {
            messaging_product: 'whatsapp', to: c.wa_id, type: 'interactive',
            interactive: {
              type: 'button',
              body: { text: msgText },
              action: { buttons: [{ type: 'reply', reply: { id: template.button_1_id, title: template.button_1_text } }] },
            },
          };
        } else {
          // Plain text
          payload = { messaging_product: 'whatsapp', to: c.wa_id, type: 'text', text: { body: msgText } };
        }

        // Send
        try {
          const res = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${phoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            // Update nurture stage
            await db.prepare('UPDATE wa_sessions SET nurture_stage = ? WHERE wa_id = ?')
              .bind(nextStage, c.wa_id).run();

            // Log the message
            await db.prepare('INSERT INTO wa_messages (wa_id, direction, msg_type, content, created_at) VALUES (?, ?, ?, ?, ?)')
              .bind(c.wa_id, 'out', `nurture_${nextStage}`, msgText.substring(0, 500), new Date().toISOString()).run();

            sent++;
          } else {
            const err = await res.text();
            console.log(`Nurture send failed for ${c.wa_id}:`, err);
            skipped++;
          }
        } catch (e) {
          console.log(`Nurture error for ${c.wa_id}:`, e.message);
          skipped++;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        sent,
        skipped,
        total: (candidates.results || []).length,
        timestamp: new Date().toISOString(),
      }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
  }
}
