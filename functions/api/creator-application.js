// /api/creator-application — Hamza Express Creator Partner Portal API
import { sendEmail } from './_lib/email-sender.js';
import { buildReceivedEmail, buildDecisionEmail, buildTentativeEmail } from './_lib/email-templates.js';
//
// Powers hamzaexpress.in/creators/apply (the public Typeform-style flow) and
// hnhotels.in/ops/influencer-applications/ (owner approval surface).
//
// Reads/writes to influencer_applications + influencer_bio_pulse tables in
// the hn-hiring D1 (bound here as HIRING_DB).
//
// Side effects on submit/approve:
//   - submit  → notifyOwner (WABA text to OWNER_PHONE summarising the application)
//   - approve → notifyCreator (WABA text to creator's phone confirming the slot)
// Both use the existing HE WABA bearer + phone-id (WA_ACCESS_TOKEN, WA_PHONE_ID).
// Free-form text only works inside the recipient's 24h session window — for cold
// transactional sends a Meta-approved template is required. We swallow failures
// (don't block the application flow) but log them in influencer_applications.notes_owner.
//
// See docs/CREATOR-PORTAL-ARCHITECTURE.md for full design.

// ─────────────────────────────────────────────────────────────────────
// Tier matrix (inlined here so HE side has no cross-repo dependency).
// Mirrors functions/api/_lib/influencer-tier.js in the HN repo.
// ─────────────────────────────────────────────────────────────────────
const TIER_MATRIX = {
  T0: { label: '<1K · Newbie', min: 0, max: 999, covers: 0, cash_paise: 0, budget_paise: 0,
        add_ons: [], asks: [], auto_decline: true,
        decline_reason: 'We work with creators who have at least 1K active followers. Build your audience and apply again!' },
  T1: { label: '1K–5K · Nano', min: 1000, max: 4999, covers: 1, cash_paise: 0, budget_paise: 60000,
        add_ons: [], asks: ['1 reel · 3 stories · tag @hamzaexpress1918'], auto_approve: false },
  T2: { label: '5K–15K · Micro', min: 5000, max: 14999, covers: 2, cash_paise: 0, budget_paise: 120000,
        add_ons: ['Welcome chai'], asks: ['1 reel · 5 stories · tag @hamzaexpress1918 · use the geotag pin'], auto_approve: false },
  T3: { label: '15K–30K · Mid-Micro', min: 15000, max: 29999, covers: 3, cash_paise: 0, budget_paise: 180000,
        add_ons: ['Welcome chai', 'Dessert'], asks: ['1 reel · 5 stories · tag · 24-hour bio link'], auto_approve: false },
  T4: { label: '30K–60K · Upper-Micro', min: 30000, max: 59999, covers: 4, cash_paise: 0, budget_paise: 240000,
        add_ons: ['Welcome chai', 'Dessert flight', 'Chef interaction'],
        asks: ['1 reel · 1 permanent grid post · 5 stories · tag'], auto_approve: false },
  T5: { label: '60K–100K · Macro-Micro', min: 60000, max: 99999, covers: 4, cash_paise: 50000, budget_paise: 290000,
        add_ons: ['Mutton Brain Dry comp', 'Dessert flight', 'Chai', 'Chef interaction'],
        asks: ['1 reel · 1 permanent grid post · 7 stories · 7-day bio tag'], auto_approve: false },
  T6: { label: '100K–250K · Edge-Macro', min: 100000, max: 249999, covers: 4, cash_paise: 300000, budget_paise: 540000,
        add_ons: ['Chef tasting (8 dishes)', 'Family photo', 'Chef interaction'],
        asks: ['2 reels · 1 permanent grid post · collab post · IG live snippet'], auto_approve: false },
  T7: { label: '250K+ · Macro', min: 250000, max: 99999999, covers: 6, cash_paise: 800000, budget_paise: 1064000,
        add_ons: ['Full chef tasting menu', 'Brand brief', 'Behind-the-scenes access'],
        asks: ['2 reels · 1 permanent grid · collab · IG live · 14-day bio tag'], auto_approve: false },
};

function tierOf(followers) {
  const f = followers || 0;
  if (f < 1000)   return 'T0';
  if (f < 5000)   return 'T1';
  if (f < 15000)  return 'T2';
  if (f < 30000)  return 'T3';
  if (f < 60000)  return 'T4';
  if (f < 100000) return 'T5';
  if (f < 250000) return 'T6';
  return 'T7';
}

function approvalDecision({ tier, engagement_rate, is_private, last_post_at }) {
  const t = TIER_MATRIX[tier];
  if (!t) return { decision: 'decline', reason: 'Unknown tier' };
  if (t.auto_decline) return { decision: 'decline', reason: t.decline_reason };
  if (is_private) return { decision: 'decline', reason: 'Private profiles — please switch to public to apply.' };

  const er = parseFloat(engagement_rate || 0);
  if (er > 0 && er < 0.005) {
    return { decision: 'decline', reason: 'Active engagement is what we look for. Your engagement rate is below our threshold — try again as it grows.' };
  }
  if (last_post_at) {
    const ageDays = (Date.now() - new Date(last_post_at).getTime()) / 86400000;
    if (ageDays > 60) {
      return { decision: 'manual', reason: `Last post was ${Math.round(ageDays)} days ago. Sending to manual review.` };
    }
  }
  if (!t.auto_approve) return { decision: 'manual', reason: 'High-tier creators get personalised review.' };
  if (t.auto_approve_min_er && er > 0 && er < t.auto_approve_min_er) {
    return { decision: 'manual', reason: `T4+ requires ER >= ${(t.auto_approve_min_er*100).toFixed(1)}%. Sending to manual review.` };
  }
  return { decision: 'auto_approve', reason: 'Auto-approved' };
}

// ─────────────────────────────────────────────────────────────────────
// HTTP plumbing
// ─────────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Dashboard-Key',
};
const json = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { 'Content-Type': 'application/json', ...CORS },
});
const requireOwner = (env, request, body) => {
  const k = request.headers.get('X-Dashboard-Key') || new URL(request.url).searchParams.get('key') || (body && body.key);
  return k && k === (env.DASHBOARD_KEY || env.DASHBOARD_API_KEY);
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const db = env.HIRING_DB;
  if (!db) return json({ error: 'HIRING_DB binding missing' }, 500);

  try {
    if (request.method === 'POST') {
      const body = await safeJson(request);
      if (action === 'lookup')        return await actionLookup(env, db, body);
      if (action === 'submit')        return await actionSubmit(env, db, body);
      if (action === 'confirm')       return await actionConfirm(env, db, body);
      if (action === 'read-booking')  return await actionReadBooking(env, db, body);
      if (action === 'approve')       return await actionApprove(env, db, body, request);
      if (action === 'adjust')        return await actionAdjust(env, db, body, request);
      if (action === 'decline')       return await actionDecline(env, db, body, request);
    }
    if (request.method === 'GET') {
      if (action === 'status')        return await actionStatus(env, db, url);
      if (action === 'list-pending')  return await actionListPending(env, db, request);
      if (action === 'list-recent')   return await actionListRecent(env, db, url, request);
      if (action === 'tier-matrix')   return json({ success: true, tiers: TIER_MATRIX });
    }
    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message, stack: e.stack?.slice(0, 600) }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC: lookup — returns tier + offer for a given handle
// ─────────────────────────────────────────────────────────────────────
async function actionLookup(env, db, body) {
  const handle = (body.handle || '').toString().trim().replace(/^@/, '').toLowerCase();
  if (!handle || !/^[a-z0-9._]{1,30}$/.test(handle)) {
    return json({ error: 'invalid IG handle format' }, 400);
  }

  // 1. Check cache (influencer_bio_pulse — most likely hit, instant)
  const cached = await db.prepare(`
    SELECT username, full_name, biography, followers_count, is_business_account, is_verified, is_private,
           category_name, profile_pic_url, engagement_rate, last_post_at, food_topic_density
    FROM influencer_bio_pulse WHERE username = ? AND status = 'ok'
  `).bind(handle).first();
  if (cached && cached.followers_count) {
    return json({ success: true, source: 'cache', ...buildLookupResponse(cached) });
  }

  // 2. Try IG public endpoint (free, ~500ms)
  try {
    const r = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, {
      headers: {
        'x-ig-app-id': '936619743392459',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      },
      cf: { cacheTtl: 0 },
    });
    if (r.ok) {
      const j = await r.json();
      const u = j?.data?.user;
      if (u) {
        const profile = {
          username: handle,
          full_name: u.full_name,
          followers_count: u.edge_followed_by?.count,
          is_business_account: u.is_business_account ? 1 : 0,
          is_verified: u.is_verified ? 1 : 0,
          is_private: u.is_private ? 1 : 0,
          biography: u.biography,
          category_name: u.category_name,
          profile_pic_url: u.profile_pic_url_hd || u.profile_pic_url,
          engagement_rate: null,           // not available from public endpoint
          last_post_at: null,
          food_topic_density: null,
        };
        return json({ success: true, source: 'ig_public', ...buildLookupResponse(profile) });
      }
    }
  } catch (e) { /* fall through */ }

  // 3. Fallback: queue for Apify enrichment (manual review path)
  // Add to discovery_queue if not already there
  try {
    await db.prepare(`
      INSERT INTO influencer_discovery_queue (username, source, source_meta)
      VALUES (?, 'self_serve_application', '{}')
    `).bind(handle).run();
  } catch { /* already queued */ }

  return json({
    success: true,
    source: 'queued',
    found: false,
    message: 'We could not auto-verify your profile right now (it might be private or our cache missed it). Submit anyway and we will review within 24h.',
    fallback: true,
  });
}

function buildLookupResponse(profile) {
  const followers = profile.followers_count || 0;
  const tier = tierOf(followers);
  const tierMeta = TIER_MATRIX[tier];
  const decision = approvalDecision({
    tier,
    engagement_rate: profile.engagement_rate,
    is_private: profile.is_private,
    last_post_at: profile.last_post_at,
  });
  return {
    found: true,
    handle: profile.username,
    full_name: profile.full_name,
    followers_count: followers,
    is_verified: !!profile.is_verified,
    is_business_account: !!profile.is_business_account,
    is_private: !!profile.is_private,
    profile_pic_url: profile.profile_pic_url,
    engagement_rate: profile.engagement_rate,
    last_post_at: profile.last_post_at,
    food_topic_density: profile.food_topic_density,
    tier,
    tier_meta: tierMeta,
    offer: {
      covers: tierMeta.covers,
      cash_paise: tierMeta.cash_paise,
      cash_inr: Math.round((tierMeta.cash_paise || 0) / 100),
      budget_paise: tierMeta.budget_paise,
      budget_inr: Math.round((tierMeta.budget_paise || 0) / 100),
      add_ons: tierMeta.add_ons,
      asks: tierMeta.asks,
    },
    decision: decision.decision,             // 'auto_approve' | 'manual' | 'decline'
    decision_reason: decision.reason,
  };
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC: submit — insert application. EVERY tier goes to manual review.
//
// Body shape (new):
//   handle              required — IG username (no @)
//   follower_range      required — 'T1'..'T7' (creator self-selects from dropdown)
//   audience_json       optional — JSON array of audience tags (Foodies, Families, etc)
//   contact_phone       required — WhatsApp number
//   contact_email       required — email for confirmation
//   preferred_slot_id   required — slot from /api/influencer-bookings?action=slots
//   why_us_text         optional — personal note / special request
//   full_name           optional — creator's display name
// ─────────────────────────────────────────────────────────────────────
async function actionSubmit(env, db, body) {
  const handle = (body.handle || '').toString().trim().replace(/^@/, '').toLowerCase();
  if (!handle) return json({ error: 'handle required' }, 400);
  if (!/^[a-z0-9._]{2,30}$/.test(handle)) return json({ error: 'invalid handle format' }, 400);

  const phone = (body.contact_phone || '').toString().trim();
  if (!phone) return json({ error: 'WhatsApp number required' }, 400);
  if (phone.replace(/\D/g, '').length < 10) return json({ error: 'invalid phone' }, 400);

  const email = (body.contact_email || '').toString().trim();
  if (!email) return json({ error: 'email required' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'invalid email' }, 400);

  const slotId = parseInt(body.preferred_slot_id || '0');
  if (!slotId) return json({ error: 'preferred_slot_id required' }, 400);

  // Tier comes from the creator's own dropdown selection — no IG lookup.
  // Owner verifies the actual follower count during manual review before approving.
  const tier = String(body.follower_range || '').toUpperCase().trim();
  if (!/^T[1-7]$/.test(tier) || !TIER_MATRIX[tier]) {
    return json({ error: 'invalid follower_range — must be T1..T7' }, 400);
  }
  const tierMeta = TIER_MATRIX[tier];

  // Audience tags (multi-select) — stored as JSON, used later for Gemini scoring + owner context
  let audienceJson = null;
  if (Array.isArray(body.audience)) {
    audienceJson = JSON.stringify(body.audience.filter(t => typeof t === 'string').slice(0, 12));
  }

  // Look up slot — exists + not blocked
  const slot = await db.prepare(`SELECT * FROM influencer_slots WHERE id = ?`).bind(slotId).first();
  if (!slot) return json({ error: 'slot_id not found' }, 400);
  if (slot.is_blocked) return json({ error: 'slot_blocked' }, 409);

  // Optimistic lock — atomic UPDATE that fails if slot was just taken by another submitter.
  // booked_count++ only succeeds if booked_count < capacity.
  const bumpResult = await db.prepare(`
    UPDATE influencer_slots
    SET booked_count = booked_count + 1
    WHERE id = ? AND booked_count < capacity AND is_blocked = 0
  `).bind(slotId).run();

  if (!bumpResult.meta.changes || bumpResult.meta.changes === 0) {
    return json({ error: 'slot_full', detail: 'This slot was just taken by another applicant. Please pick another.' }, 409);
  }

  // EVERY application is manual review. Always pending. No auto-approve, no booking shell yet.
  // Owner reviews at /ops/influencer-applications and taps Approve to materialise the booking.
  const status = 'pending';
  const autoApproved = 0;

  // Insert application row
  const result = await db.prepare(`
    INSERT INTO influencer_applications (
      username, full_name, followers_count, engagement_rate, is_verified, is_business_account,
      category_name, profile_pic_url,
      youtube_handle, tiktok_handle, other_platforms_text,
      why_us_text, contact_phone, contact_email,
      computed_tier, offer_covers, offer_cash_paise, offer_addons_json, asks_json,
      preferred_slot_id, preferred_slot_date, preferred_window_code,
      status, auto_approved, decline_reason,
      outreach_token, booking_id, application_source, audience_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    handle, body.full_name || null, null, null,
    0, 0,
    null, null,
    body.youtube_handle || null, body.tiktok_handle || null, body.other_platforms_text || null,
    body.why_us_text || null, phone, email,
    tier, tierMeta.covers, tierMeta.cash_paise || 0,
    JSON.stringify(tierMeta.add_ons || []), JSON.stringify(tierMeta.asks || []),
    slotId, slot.slot_date, slot.window_code,
    status, autoApproved, null,
    null, null, body.application_source || 'self_serve', audienceJson
  ).run();

  // ── Side effects: notify owner + creator. Best-effort, never block the response.
  // Two messages on submit (every booking is manual-review now):
  //   1. Owner alert            — "🍽️ NEW CREATOR APPLICATION · review at /ops/..."
  //   2. Creator receipt (WABA) — "📝 We've received your application"
  //   2b. Creator receipt (email) — branded HTML
  // The slot-confirmation (#3) fires later when owner taps Approve at /ops/influencer-applications.
  const appRow = {
    id: result.meta.last_row_id,
    username: handle,
    full_name: body.full_name || null,
    followers_count: null,                  // we don't lookup any more
    follower_range: tier,
    computed_tier: tier,
    tier,
    status,
    contact_phone: phone,
    contact_email: email,
    audience: Array.isArray(body.audience) ? body.audience : [],
    preferred_slot_id: slotId,
  };
  await notifyOwner(env, db, appRow, 'Manual review required (every application).', slot);
  await notifyCreatorReceived(env, db, appRow, slot, tierMeta);
  await notifyCreatorEmail(env, db, appRow, slot, tierMeta, 'received');

  return json({
    success: true,
    application_id: result.meta.last_row_id,
    status: 'pending',
    confirmation_message: `Thank you. Your application is in our hands — we'll personally review and respond within 24 hours via WhatsApp + email.`,
  });
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC: status — check application status by handle
// ─────────────────────────────────────────────────────────────────────
async function actionStatus(env, db, url) {
  const handle = (url.searchParams.get('handle') || '').replace(/^@/, '').toLowerCase();
  if (!handle) return json({ error: 'handle required' }, 400);
  const apps = await db.prepare(`
    SELECT id, status, auto_approved, computed_tier, preferred_slot_date, preferred_window_code,
           submitted_at, reviewed_at, decline_reason
    FROM influencer_applications WHERE username = ? ORDER BY submitted_at DESC LIMIT 5
  `).bind(handle).all();
  return json({ success: true, applications: apps.results });
}

// ─────────────────────────────────────────────────────────────────────
// OWNER: list pending
// ─────────────────────────────────────────────────────────────────────
async function actionListPending(env, db, request) {
  if (!requireOwner(env, request, null)) return json({ error: 'unauthorized' }, 401);
  const r = await db.prepare(`
    SELECT * FROM influencer_applications
    WHERE status = 'pending'
    ORDER BY submitted_at DESC LIMIT 50
  `).all();
  return json({ success: true, applications: r.results });
}

async function actionListRecent(env, db, url, request) {
  if (!requireOwner(env, request, null)) return json({ error: 'unauthorized' }, 401);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const r = await db.prepare(`
    SELECT * FROM influencer_applications ORDER BY submitted_at DESC LIMIT ?
  `).bind(limit).all();

  // Aggregate stats this month
  const stats = await db.prepare(`
    SELECT status, COUNT(*) c FROM influencer_applications
    WHERE strftime('%Y-%m', submitted_at) = strftime('%Y-%m', 'now')
    GROUP BY status
  `).all();

  return json({ success: true, applications: r.results, stats: stats.results });
}

// ─────────────────────────────────────────────────────────────────────
// OWNER: approve / adjust / decline
// ─────────────────────────────────────────────────────────────────────
async function actionApprove(env, db, body, request) {
  if (!requireOwner(env, request, body)) return json({ error: 'unauthorized' }, 401);
  if (!body.id) return json({ error: 'id required' }, 400);

  const app = await db.prepare(`SELECT * FROM influencer_applications WHERE id = ?`).bind(body.id).first();
  if (!app) return json({ error: 'application not found' }, 404);
  if (app.status === 'approved' || app.status === 'auto_approved') {
    return json({ error: 'already approved' }, 400);
  }

  // Slot was already optimistically held at submit time (booked_count++) — don't re-bump here.
  // We just need to read it to compose the message.
  const slot = await db.prepare(`SELECT * FROM influencer_slots WHERE id = ?`).bind(app.preferred_slot_id).first();
  if (!slot) return json({ error: 'slot_not_found' }, 404);

  // Two-step confirm flow:
  //   Owner approve → booking row status = 'tentative' (slot held but not finalised)
  //   Creator clicks confirm link → /api/creator-application?action=confirm&token=X → status = 'confirmed'
  //   Application row status = 'approved' (owner-side decision is done)
  const tierMeta = TIER_MATRIX[app.computed_tier] || TIER_MATRIX.T1;
  const outreachToken = genToken();
  const bk = await db.prepare(`
    INSERT INTO influencer_bookings
      (creator_username, creator_name, creator_followers, creator_tier, cover_commitment, meal_budget_paise,
       slot_id, slot_date, window_code, status, outreach_token, contact_phone, contact_email, notes_creator,
       approved_by, approved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'tentative', ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    app.username, app.full_name, app.followers_count, app.computed_tier, tierMeta.covers,
    tierMeta.budget_paise + (tierMeta.cash_paise || 0),
    app.preferred_slot_id, app.preferred_slot_date, app.preferred_window_code,
    outreachToken, app.contact_phone, app.contact_email, app.why_us_text,
    body.actor || 'owner'
  ).run();

  await db.prepare(`
    UPDATE influencer_applications
    SET status='approved', booking_id=?, outreach_token=?, reviewed_by=?, reviewed_at=datetime('now'),
        notes_owner=?
    WHERE id=?
  `).bind(bk.meta.last_row_id, outreachToken, body.actor || 'owner', body.notes || null, body.id).run();

  // ── Side effects: TENTATIVE message — tells creator the outlet has approved
  // and asks them to confirm via the confirm link before the booking is final.
  const approvedAppRow = {
    id: body.id,
    username: app.username,
    full_name: app.full_name,
    contact_phone: app.contact_phone,
    contact_email: app.contact_email,
    computed_tier: app.computed_tier,
    status: 'tentative',
    outreach_token: outreachToken,
  };
  await notifyCreatorTentative(env, db, approvedAppRow, slot, tierMeta, outreachToken);
  await notifyCreatorEmail(env, db, approvedAppRow, slot, tierMeta, 'tentative');

  return json({
    success: true,
    application_id: body.id,
    booking_id: bk.meta.last_row_id,
    outreach_token: outreachToken,
    booking_status: 'tentative',
    confirm_url: `https://hamzaexpress.in/creators/confirm/?token=${outreachToken}`,
  });
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC: read-booking — token-authenticated read-only lookup for the
// confirm page. Returns booking + slot details + all 5 windows for the
// booked date with availability so creator can flex within the day.
// ─────────────────────────────────────────────────────────────────────
async function actionReadBooking(env, db, body) {
  const token = (body.token || '').toString().trim();
  if (!token) return json({ error: 'token required' }, 400);

  const booking = await db.prepare(`SELECT * FROM influencer_bookings WHERE outreach_token = ?`).bind(token).first();
  if (!booking) return json({ error: 'booking_not_found' }, 404);

  const slot = await db.prepare(`SELECT * FROM influencer_slots WHERE id = ?`).bind(booking.slot_id).first();

  // Fetch all 5 windows for the booked date (so the creator can pick another
  // time within the same day if they want flexibility).
  const dayWindows = await db.prepare(`
    SELECT id, slot_date, window_code, window_label, capacity, booked_count, is_blocked
    FROM influencer_slots
    WHERE slot_date = ?
    ORDER BY CASE window_code
      WHEN 'AFTERNOON' THEN 1 WHEN 'GOLDEN' THEN 2 WHEN 'PRIME' THEN 3
      WHEN 'LATE' THEN 4 WHEN 'MIDNIGHT' THEN 5 ELSE 99 END
  `).bind(booking.slot_date).all();

  return json({
    success: true,
    booking: {
      id: booking.id,
      status: booking.status,
      creator_username: booking.creator_username,
      creator_tier: booking.creator_tier,
      slot_id: booking.slot_id,
      slot_date: booking.slot_date,
      window_code: booking.window_code,
    },
    biz: {
      name: BIZ.name,
      address: BIZ.address,
      map_url: BIZ.map_url,
      waba_phone: BIZ.waba_phone,
    },
    day_windows: (dayWindows.results || []).map(w => ({
      id: w.id,
      window_code: w.window_code,
      window_label: w.window_label || (WINDOW_LABELS[w.window_code]?.label || ''),
      time: WINDOW_LABELS[w.window_code]?.time || '',
      is_open: !w.is_blocked && (w.booked_count < w.capacity),
      is_current: w.id === booking.slot_id,
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────
// PUBLIC: confirm — creator-side confirmation via outreach_token
// Flips booking from 'tentative' → 'confirmed'. Optionally accepts a
// new_slot_id to move within the same date.
// ─────────────────────────────────────────────────────────────────────
async function actionConfirm(env, db, body) {
  const token = (body.token || '').toString().trim();
  if (!token) return json({ error: 'token required' }, 400);

  const booking = await db.prepare(`SELECT * FROM influencer_bookings WHERE outreach_token = ?`).bind(token).first();
  if (!booking) return json({ error: 'booking not found' }, 404);
  if (booking.status === 'confirmed') {
    return json({ success: true, already_confirmed: true, message: 'Slot already confirmed.' });
  }
  if (booking.status !== 'tentative') {
    return json({ error: 'booking_not_tentative', detail: `Current status: ${booking.status}` }, 409);
  }

  // Optional: creator picked a different time window within the same date
  const newSlotId = body.slot_id ? parseInt(body.slot_id) : null;
  let activeSlot;

  if (newSlotId && newSlotId !== booking.slot_id) {
    // Verify new slot exists, is on the same date, and has capacity
    const newSlot = await db.prepare(`SELECT * FROM influencer_slots WHERE id = ?`).bind(newSlotId).first();
    if (!newSlot) return json({ error: 'new_slot_not_found' }, 404);
    if (newSlot.slot_date !== booking.slot_date) {
      return json({ error: 'cross_date_move_not_allowed', detail: 'Pick a different window on the SAME date, or WhatsApp us to reschedule for a different day.' }, 400);
    }
    // Atomic move: bump new slot first (might fail if full), then release old
    const bump = await db.prepare(`
      UPDATE influencer_slots SET booked_count = booked_count + 1
      WHERE id = ? AND booked_count < capacity AND is_blocked = 0
    `).bind(newSlotId).run();
    if (!bump.meta.changes) {
      return json({ error: 'new_slot_full', detail: 'That window was just taken. Reload and pick another.' }, 409);
    }
    // Release old slot
    await db.prepare(`UPDATE influencer_slots SET booked_count = MAX(0, booked_count - 1) WHERE id = ?`).bind(booking.slot_id).run();
    // Update booking row to point at the new slot
    await db.prepare(`
      UPDATE influencer_bookings SET slot_id = ?, window_code = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(newSlotId, newSlot.window_code, booking.id).run();
    // Also update the application row's preferred_slot_id for consistency
    await db.prepare(`
      UPDATE influencer_applications SET preferred_slot_id = ?, preferred_window_code = ?
      WHERE outreach_token = ?
    `).bind(newSlotId, newSlot.window_code, token).run();
    activeSlot = newSlot;
  } else {
    activeSlot = await db.prepare(`SELECT * FROM influencer_slots WHERE id = ?`).bind(booking.slot_id).first();
  }

  const app = await db.prepare(`SELECT * FROM influencer_applications WHERE outreach_token = ?`).bind(token).first();
  const tierMeta = TIER_MATRIX[booking.creator_tier] || TIER_MATRIX.T1;

  // Flip booking status to confirmed
  await db.prepare(`UPDATE influencer_bookings SET status='confirmed', updated_at=datetime('now') WHERE id=?`).bind(booking.id).run();

  // Fire final confirmation messages
  const finalAppRow = {
    id: app?.id,
    username: booking.creator_username,
    full_name: booking.creator_name,
    contact_phone: booking.contact_phone,
    contact_email: booking.contact_email,
    computed_tier: booking.creator_tier,
    status: 'confirmed',
    outreach_token: token,
  };
  await notifyCreator(env, db, finalAppRow, activeSlot, tierMeta);
  await notifyCreatorEmail(env, db, finalAppRow, activeSlot, tierMeta, 'decision');
  await sendWabaLocation(env, booking.contact_phone, BIZ.lat, BIZ.lng, BIZ.name, BIZ.address);

  return json({
    success: true,
    booking_id: booking.id,
    booking_status: 'confirmed',
    slot: {
      id: activeSlot?.id,
      date: activeSlot?.slot_date,
      window: activeSlot?.window_code,
      label: activeSlot?.window_label,
    },
    moved: newSlotId && newSlotId !== booking.slot_id,
  });
}

async function actionAdjust(env, db, body, request) {
  if (!requireOwner(env, request, body)) return json({ error: 'unauthorized' }, 401);
  if (!body.id || !body.adjusted_tier) return json({ error: 'id + adjusted_tier required' }, 400);
  await db.prepare(`
    UPDATE influencer_applications
    SET status='adjusted', adjusted_tier=?, adjusted_offer_json=?, reviewed_by=?, reviewed_at=datetime('now'),
        notes_owner=?
    WHERE id=?
  `).bind(body.adjusted_tier, JSON.stringify(body.adjusted_offer || {}), body.actor || 'owner',
          body.notes || null, body.id).run();
  return json({ success: true, message: 'Adjusted offer recorded. Send revised offer to creator manually for now.' });
}

async function actionDecline(env, db, body, request) {
  if (!requireOwner(env, request, body)) return json({ error: 'unauthorized' }, 401);
  if (!body.id) return json({ error: 'id required' }, 400);

  const app = await db.prepare(`SELECT * FROM influencer_applications WHERE id = ?`).bind(body.id).first();
  if (!app) return json({ error: 'application not found' }, 404);

  await db.prepare(`
    UPDATE influencer_applications
    SET status='declined', decline_reason=?, reviewed_by=?, reviewed_at=datetime('now'), notes_owner=?
    WHERE id=?
  `).bind(body.reason || 'Declined by owner', body.actor || 'owner', body.notes || null, body.id).run();

  // ── Side effect: tell the creator we're not hosting this round (email layer).
  // We deliberately don't fire WABA on decline — feels punitive to ping someone's
  // phone with a rejection. Email is plenty.
  const declinedAppRow = {
    id: body.id,
    username: app.username,
    full_name: app.full_name,
    contact_email: app.contact_email,
    computed_tier: app.computed_tier,
    status: 'declined',
    decline_reason: body.reason || null,
  };
  const slot = await db.prepare(`SELECT * FROM influencer_slots WHERE id = ?`).bind(app.preferred_slot_id).first();
  const tierMeta = TIER_MATRIX[app.computed_tier] || TIER_MATRIX.T1;
  await notifyCreatorEmail(env, db, declinedAppRow, slot, tierMeta, 'decision');

  return json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────
// WABA NOTIFICATIONS — transactional (free-form text via Meta Cloud API)
//
// Reliability note: Meta only allows free-form text within the recipient's
// 24h session. For cold sends we'd need approved message templates — not
// implemented here, will be added once Meta-approved templates land. For
// now: send free-form, record success/failure in application notes, never
// throw. The dashboard at /ops/influencer-applications shows the delivery
// state per row.
// ─────────────────────────────────────────────────────────────────────
async function sendWaba(env, to, text) {
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) {
    return { ok: false, error: 'WA_ACCESS_TOKEN or WA_PHONE_ID missing' };
  }
  const phone = String(to || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) return { ok: false, error: 'invalid phone' };

  const url = `https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: String(text).slice(0, 4096) },
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { ok: false, status: resp.status, meta: data?.error || data };
    }
    return { ok: true, message_id: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────
// BUSINESS LOCATION CONSTANTS — verified via Meta Graph API + Google Place ID
// ─────────────────────────────────────────────────────────────────────
const BIZ = {
  name: 'Hamza Express',
  address: '151 TO 154, HKP Road, Sulthangunta, Shivajinagar, Bangalore 560051',
  lat: 12.98475,
  lng: 77.60291,
  place_id: 'ChIJ-QQjtHEXrjsR-Z1RIEm2arg',
  // Canonical Google Maps URL — opens the verified Hamza Express location, deep-links to Maps app on mobile
  map_url: 'https://www.google.com/maps/place/?q=place_id:ChIJ-QQjtHEXrjsR-Z1RIEm2arg',
  waba_phone: '+91 80080 02049',
};

// Window code → human-readable label
const WINDOW_LABELS = {
  AFTERNOON: { time: '4 PM', label: 'Afternoon' },
  GOLDEN:    { time: '6 PM', label: 'Golden Hour' },
  PRIME:     { time: '8 PM', label: 'Prime' },
  LATE:      { time: '10 PM', label: 'Late' },
  MIDNIGHT:  { time: '12 AM (midnight)', label: 'Midnight' },
};

// Format a slot timing line: "Saturday, 10 May · Prime · 8 PM"
function fmtSlotTiming(slot) {
  if (!slot) return 'your selected slot';
  const win = WINDOW_LABELS[slot.window_code] || { time: slot.window_code, label: '' };
  let dateStr = slot.slot_date;
  try {
    const d = new Date(slot.slot_date + 'T00:00:00+05:30');
    dateStr = d.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
  } catch {}
  return `${dateStr} · ${win.label} · ${win.time}`;
}

// Send a WABA location-pin message (tappable map preview in WhatsApp).
// Free-form — works in 24h session. Best paired AFTER an approved-template send.
async function sendWabaLocation(env, to, lat, lng, name, address) {
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) return { ok: false, error: 'WABA not configured' };
  const phone = String(to || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) return { ok: false, error: 'invalid phone' };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'location',
        location: { latitude: lat, longitude: lng, name, address },
      }),
    });
    const d = await r.json();
    return r.ok ? { ok: true, message_id: d?.messages?.[0]?.id } : { ok: false, status: r.status, meta: d?.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Template send — works WITHOUT 24h session. The actual transactional path.
// Returns { ok, message_id } on success, { ok:false, status, meta } on failure.
async function sendTemplate(env, to, templateName, vars, lang = 'en', buttonVars = null) {
  if (!env.WA_ACCESS_TOKEN || !env.WA_PHONE_ID) {
    return { ok: false, error: 'WA_ACCESS_TOKEN or WA_PHONE_ID missing' };
  }
  const phone = String(to || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) return { ok: false, error: 'invalid phone' };

  const url = `https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`;
  const sanitiseParam = (v) => String(v == null ? '' : v)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{4,}/g, '   ')
    .slice(0, 1024);
  const components = [];
  if (vars && vars.length) {
    components.push({ type: 'body', parameters: vars.map(v => ({ type: 'text', text: sanitiseParam(v) })) });
  }
  // URL button parameters: pass [{index: '0', value: 'tokenSuffix'}, ...]
  // for templates that have URL buttons with a {{1}} placeholder in the URL.
  if (Array.isArray(buttonVars)) {
    buttonVars.forEach(bv => {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: String(bv.index),
        parameters: [{ type: 'text', text: sanitiseParam(bv.value) }],
      });
    });
  }
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: lang },
          components,
        },
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { ok: false, status: resp.status, meta: data?.error || data };
    }
    return { ok: true, message_id: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Smart sender: try template first (works outside 24h session). If template fails
// for any reason — typically because it's not yet approved — fall back to free-form
// text (which works only inside session). Both paths log to Meta + return {ok}.
//
// `templateName` + `vars` are passed to sendTemplate; `fallbackText` to sendWaba.
// During the period between code-deploy and template-approval, this lets the flow
// continue working in test mode (owner has session) without blowing up if a
// creator with no session submits.
// Smart sender with optional fallback-template chain.
//   templateName: string OR array of strings — tried in order until one delivers.
//   vars: body params for ALL templates in the chain (must share body shape)
//   buttonVars: array OR null — only applies to the FIRST template (typically the one with buttons)
//   fallbackText: free-form text used if all templates fail (delivers only inside 24h session)
async function sendWabaSmart(env, to, templateName, vars, fallbackText, buttonVars = null) {
  if (env.WABA_TEMPLATES_DISABLED === '1') {
    return await sendWaba(env, to, fallbackText);
  }
  const names = Array.isArray(templateName) ? templateName : [templateName];
  let lastTemplateError = null;
  for (let i = 0; i < names.length; i++) {
    const t = await sendTemplate(env, to, names[i], vars, 'en', i === 0 ? buttonVars : null);
    if (t.ok) return { ...t, via: 'template:' + names[i] };
    lastTemplateError = t.meta || t.error;
  }
  // All templates failed — try free-form (works only in 24h session).
  const f = await sendWaba(env, to, fallbackText);
  return {
    ok: f.ok,
    message_id: f.message_id || null,
    via: f.ok ? 'fallback_text' : 'failed',
    template_error: lastTemplateError,
    fallback_error: f.ok ? null : (f.meta || f.error),
  };
}

function notifyOwnerText(app, decisionReason, slot) {
  const tier = app.computed_tier || app.tier || 'T?';
  const tierLabel = TIER_MATRIX[tier]?.label || tier;
  const status = app.status === 'auto_approved'
    ? '✅ AUTO-CONFIRMED'
    : app.status === 'declined'
      ? '❌ AUTO-DECLINED'
      : '⏳ NEEDS REVIEW';
  const slotLine = slot
    ? `${slot.window_label || slot.window_code || ''} on ${slot.slot_date}`
    : `slot #${app.preferred_slot_id || '?'}`;
  const er = app.engagement_rate
    ? `ER ${(parseFloat(app.engagement_rate) * 100).toFixed(2)}%`
    : 'ER unknown';

  const lines = [
    `🍽️ NEW CREATOR APPLICATION`,
    ``,
    `@${app.username} · ${tierLabel}`,
    `${(app.followers_count || 0).toLocaleString('en-IN')} followers · ${er}`,
    `Wants: ${slotLine}`,
    ``,
    `Status: ${status}`,
  ];
  if (decisionReason && app.status !== 'auto_approved') {
    lines.push(`Why: ${decisionReason}`);
  }
  if (app.contact_phone) lines.push(`Contact: +${app.contact_phone}`);
  if (app.status !== 'auto_approved' && app.status !== 'declined') {
    lines.push(``, `Review:`);
    lines.push(`https://hnhotels.in/ops/influencer-applications/?app_id=${app.id || ''}`);
  }
  return lines.join('\n');
}

// "We received your application" — fires on EVERY submit, before any approval branching.
// Critical because the creator needs an immediate "we got it" so they save the +91 80080 02049
// contact and recognise subsequent messages. This is the application receipt; the slot
// confirmation message (notifyCreatorText) fires later when a booking is actually confirmed.
function notifyCreatorReceivedText(app, slot, tierMeta) {
  const status = app.status === 'auto_approved'
    ? `🎉 You're booked. Slot is reserved.`
    : app.status === 'declined'
      ? `We're not able to host this round. Reason: ${app.decline_reason || 'engagement threshold not met'}.`
      : `📝 We've received your application. We'll review and confirm within 24 hours.`;

  const slotLine = slot
    ? `${slot.window_label || slot.window_code} on ${slot.slot_date}`
    : 'your selected slot';

  const tierLabel = (tierMeta && tierMeta.label) || (TIER_MATRIX[app.computed_tier]?.label) || app.computed_tier;

  const lines = [
    `Hi @${app.username},`,
    ``,
    `Thanks for applying to Hamza Express — the 108-year-old Dakhni kitchen on H.K.P. Road, Shivajinagar.`,
    ``,
    status,
    ``,
    `Tier: ${tierLabel}`,
    `Slot requested: ${slotLine}`,
  ];
  if (app.status === 'auto_approved') {
    lines.push(``, `Full confirmation with the menu + asks lands in your next message.`);
  } else if (app.status !== 'declined') {
    lines.push(``, `If approved, we'll send the full confirmation here with the menu + what we'll be hosting you with.`);
  }
  lines.push(
    ``,
    `— Nihaf`,
    `Managing Director, HN Hotels Pvt Ltd`,
    `Hamza Express · est. 1918 · Shivajinagar`,
    `Save us: +91 80080 02049 (WhatsApp)`,
  );
  return lines.join('\n');
}

async function notifyCreatorReceived(env, db, app, slot, tierMeta) {
  if (!app.contact_phone) return { skipped: 'no contact_phone' };
  const text = notifyCreatorReceivedText(app, slot, tierMeta);

  // Template `creator_application_received` body order:
  //   {{1}} handle (without @)
  //   {{2}} status_line
  //   {{3}} tier_label
  //   {{4}} slot_string
  const status = app.status === 'auto_approved'
    ? `🎉 You're booked. Slot is reserved.`
    : app.status === 'declined'
      ? `We're not able to host this round. Reason: ${app.decline_reason || 'engagement threshold not met'}.`
      : `📝 We've received your application. We'll review and confirm within 24 hours.`;
  const slotStr = slot
    ? `${slot.window_label || slot.window_code} on ${slot.slot_date}`
    : 'your selected slot';
  const tierLabel = (tierMeta && tierMeta.label) || (TIER_MATRIX[app.computed_tier]?.label) || app.computed_tier || 'TBD';

  const r = await sendWabaSmart(env, app.contact_phone, 'creator_application_received_v2', [
    app.username, status, tierLabel, slotStr,
  ], text);
  try {
    await db.prepare(`
      UPDATE influencer_applications
      SET notes_owner = COALESCE(notes_owner, '') ||
          (CASE WHEN COALESCE(notes_owner,'') = '' THEN '' ELSE char(10) END) ||
          ?
      WHERE id = ?
    `).bind(
      `[${new Date().toISOString()}] receipt-waba: ${r.ok ? 'sent ' + (r.message_id||'') : 'FAILED ' + JSON.stringify(r).slice(0,200)}`,
      app.id
    ).run();
  } catch {}
  return r;
}

function notifyCreatorText(app, slot, tierMeta) {
  const m = tierMeta || TIER_MATRIX[app.computed_tier || app.tier || 'T1'] || TIER_MATRIX.T1;
  const slotLine = fmtSlotTiming(slot);
  const lines = [
    `✅ Your slot at Hamza Express is locked in.`,
    ``,
    `📅 ${slotLine}`,
    `📍 ${BIZ.address}`,
    ``,
    `🗺  Get directions: ${BIZ.map_url}`,
    ``,
    `Tier: ${m.label}`,
    ``,
    `What we're hosting you with:`,
    `· ${m.covers} ${m.covers === 1 ? 'cover' : 'covers'} (your party size)`,
  ];
  (m.add_ons || []).forEach(a => lines.push(`· ${a}`));
  if (m.cash_paise) lines.push(`· ₹${(m.cash_paise/100).toLocaleString('en-IN')} cash on top of the meal`);
  lines.push(``, `What we ask:`);
  (m.asks || []).forEach(a => lines.push(`· ${a}`));
  lines.push(
    ``,
    `Tag @hamzaexpress1918 · use the Shivajinagar geotag.`,
    ``,
    `Day-of: walk in, mention you're from the creator program. Park on HKP Road or take Russell Market lanes.`,
    ``,
    `Looking forward to hosting you,`,
    `— Nihaf`,
    `Managing Director, HN Hotels Pvt Ltd`,
    `Hamza Express · est. 1918 · Shivajinagar`,
    `Save us: ${BIZ.waba_phone} (WhatsApp)`,
  );
  return lines.join('\n');
}

async function notifyOwner(env, db, app, decisionReason, slot) {
  const ownerPhone = env.OWNER_PHONE || env.HE_OWNER_PHONE;
  if (!ownerPhone) {
    console.warn('OWNER_PHONE env not set — skipping owner WABA notification');
    return { skipped: 'OWNER_PHONE not configured' };
  }
  const text = notifyOwnerText(app, decisionReason, slot);

  // Template `creator_owner_alert` body order:
  //   {{1}} creator_profile (e.g. "@rajbiswas56 · T3 Mid-Micro · 30,341 followers · ER 1.20%")
  //   {{2}} slot_requested (e.g. "Prime · 8 PM on 2026-05-15")
  //   {{3}} status_long (e.g. "⏳ NEEDS REVIEW (manual approval required for this tier)")
  //   {{4}} review_url
  const tier = app.computed_tier || app.tier || 'T?';
  const tierLabel = (TIER_MATRIX[tier]?.label || tier).replace(/^T\d · /, '').replace('· ','');
  const er = app.engagement_rate
    ? `${(parseFloat(app.engagement_rate) * 100).toFixed(2)}%`
    : 'unknown';
  const followersFmt = (app.followers_count || 0).toLocaleString('en-IN');
  const profile = `@${app.username} · ${tier} ${tierLabel} · ${followersFmt} followers · ER ${er}`;
  const slotReq = slot
    ? `${slot.window_label || slot.window_code || ''} on ${slot.slot_date}`
    : `slot #${app.preferred_slot_id || '?'}`;
  const statusLong = app.status === 'auto_approved'
    ? '✅ AUTO-CONFIRMED. Booking is reserved.'
    : app.status === 'declined'
      ? `❌ AUTO-DECLINED. ${decisionReason || ''}`
      : `⏳ NEEDS REVIEW. ${decisionReason || 'Manual approval required for this tier.'}`;
  const reviewUrl = `https://hnhotels.in/ops/influencer-applications/?app_id=${app.id || ''}`;

  const r = await sendWabaSmart(env, ownerPhone, 'creator_owner_alert_v2', [
    profile, slotReq, statusLong, reviewUrl,
  ], text);
  // best-effort log into the application row
  try {
    await db.prepare(`
      UPDATE influencer_applications
      SET notes_owner = COALESCE(notes_owner, '') ||
          (CASE WHEN COALESCE(notes_owner,'') = '' THEN '' ELSE char(10) END) ||
          ?
      WHERE id = ?
    `).bind(
      `[${new Date().toISOString()}] owner-waba: ${r.ok ? 'sent ' + (r.message_id||'') : 'FAILED ' + JSON.stringify(r).slice(0,200)}`,
      app.id
    ).run();
  } catch {}
  return r;
}

// ─────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATIONS — Gmail API via /api/email-auth refresh token.
// Best-effort, never blocks the response. Logs success / failure into
// influencer_applications.notes_owner like the WABA helpers.
// ─────────────────────────────────────────────────────────────────────
function firstNameFor(app) {
  if (app.full_name) {
    const cleaned = String(app.full_name)
      .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/[|\-_·•★⭐👑📍🇮🇳]/g, ' ').trim();
    const parts = cleaned.split(/\s+/).filter(p => p.length > 0 && /^[a-zA-Z]/.test(p));
    if (parts[0]) return parts[0];
  }
  return app.username || 'there';
}

function emailViewVars(app, slot, tierMeta) {
  const m = tierMeta || TIER_MATRIX[app.computed_tier || app.tier || 'T1'] || TIER_MATRIX.T1;
  const slotStr = slot
    ? `${slot.window_label || slot.window_code} on ${slot.slot_date}`
    : 'your selected slot';
  const tierLabel = m.label || (app.computed_tier || 'TBD');

  const hosting = [`${m.covers} ${m.covers === 1 ? 'cover' : 'covers'} (your party size)`];
  (m.add_ons || []).forEach(a => hosting.push(a));
  const cashInr = m.cash_paise ? Math.round(m.cash_paise / 100) : 0;

  return {
    first_name: firstNameFor(app),
    handle: app.username,
    tier: tierLabel,
    slot: slotStr,
    hosting,
    asks: m.asks || [],
    cash_inr: cashInr,
  };
}

async function notifyCreatorEmail(env, db, app, slot, tierMeta, kind /* 'received' | 'decision' */) {
  if (!app.contact_email) return { skipped: 'no contact_email' };
  if (!env.GMAIL_REFRESH_TOKEN) return { skipped: 'GMAIL_REFRESH_TOKEN not configured — run /api/email-auth' };

  const vars = emailViewVars(app, slot, tierMeta);
  let payload;
  if (kind === 'tentative') {
    payload = buildTentativeEmail({
      ...vars,
      confirm_url: `https://hamzaexpress.in/creators/confirm/?token=${app.outreach_token || ''}`,
    });
  } else if (kind === 'decision') {
    payload = buildDecisionEmail({
      ...vars,
      status: app.status === 'approved' || app.status === 'auto_approved' || app.status === 'confirmed' ? 'approved' : 'declined',
      decline_reason: app.decline_reason || null,
    });
  } else {
    payload = buildReceivedEmail({
      ...vars,
      status: app.status,
    });
  }

  const r = await sendEmail(env, {
    to: app.contact_email,
    subject: payload.subject,
    html: payload.html,
    from_name: 'Abdul Nihaf',
  });

  try {
    await db.prepare(`
      UPDATE influencer_applications
      SET notes_owner = COALESCE(notes_owner, '') ||
          (CASE WHEN COALESCE(notes_owner,'') = '' THEN '' ELSE char(10) END) ||
          ?
      WHERE id = ?
    `).bind(
      `[${new Date().toISOString()}] ${kind}-email: ${r.ok ? 'sent ' + (r.message_id||'') : 'FAILED ' + JSON.stringify(r).slice(0,200)}`,
      app.id
    ).run();
  } catch {}
  return r;
}

// "Outlet approved · please confirm your slot" — fires when owner taps Approve.
// The booking is HELD as tentative until creator clicks the confirm link.
function notifyCreatorTentativeText(app, slot, tierMeta, token) {
  const m = tierMeta || TIER_MATRIX[app.computed_tier || 'T1'] || TIER_MATRIX.T1;
  const slotLine = fmtSlotTiming(slot);
  const confirmUrl = `https://hamzaexpress.in/creators/confirm/?token=${token}`;
  return [
    `🎉 The outlet has approved your invitation.`,
    ``,
    `Hi @${app.username},`,
    ``,
    `We've held your slot for:`,
    `📅 ${slotLine}`,
    `📍 ${BIZ.address}`,
    ``,
    `One last step — please confirm so we can finalise the booking on our side too:`,
    confirmUrl,
    ``,
    `Map: ${BIZ.map_url}`,
    ``,
    `If we don't hear from you in 24 hours, we'll release the slot back to the pool. No pressure — just want to make sure the kitchen is ready for you.`,
    ``,
    `— Nihaf`,
    `Managing Director, HN Hotels Pvt Ltd`,
    `Hamza Express · est. 1918 · Shivajinagar`,
    `Save us: ${BIZ.waba_phone} (WhatsApp)`,
  ].join('\n');
}

async function notifyCreatorTentative(env, db, app, slot, tierMeta, token) {
  if (!app.contact_phone) return { skipped: 'no contact_phone' };
  const text = notifyCreatorTentativeText(app, slot, tierMeta, token);

  // Template `creator_outlet_approved_v3` — UTILITY with 2 URL buttons:
  //   Body vars (3): handle / slotStr / address
  //   Button 0: "Confirm my slot" → URL has {{1}} suffix → token
  //   Button 1: "Get directions" → static URL (no var)
  // sendWabaSmart falls back to free-form text if v3 not yet APPROVED.
  const slotStr = fmtSlotTiming(slot);
  const r = await sendWabaSmart(env, app.contact_phone,
    ['creator_outlet_approved_v3', 'creator_outlet_approved_v2'],
    // v3 has 3 body vars; v2 has 4 (the 4th was the URL when no buttons existed).
    // Sending 4 vars is fine for v3 too — extras are ignored if the body only references {{1}}–{{3}}.
    [app.username, slotStr, BIZ.address, `https://hamzaexpress.in/creators/confirm/?token=${token}`],
    text,
    [{ index: 0, value: token }],
  );

  try {
    await db.prepare(`
      UPDATE influencer_applications
      SET notes_owner = COALESCE(notes_owner, '') ||
          (CASE WHEN COALESCE(notes_owner,'') = '' THEN '' ELSE char(10) END) || ?
      WHERE id = ?
    `).bind(
      `[${new Date().toISOString()}] tentative-waba: ${r.ok ? 'sent ' + (r.message_id||'') : 'FAILED ' + JSON.stringify(r).slice(0,200)}`,
      app.id
    ).run();
  } catch {}
  return r;
}

async function notifyCreator(env, db, app, slot, tierMeta) {
  if (!app.contact_phone) return { skipped: 'no contact_phone on application' };
  const text = notifyCreatorText(app, slot, tierMeta);

  // Template `creator_invitation_confirmed` body order:
  //   {{1}} tier_label
  //   {{2}} slot_string
  //   {{3}} hosting_with (multi-line bullets)
  //   {{4}} asks (multi-line bullets)
  const m = tierMeta || TIER_MATRIX[app.computed_tier || app.tier || 'T1'] || TIER_MATRIX.T1;
  const slotStr = slot
    ? `${slot.window_label || slot.window_code} on ${slot.slot_date}`
    : 'your selected slot';
  const tierLabel = m.label || (app.computed_tier || 'TBD');

  // Meta template parameters disallow newlines / tabs / >4 consecutive spaces.
  // Flatten the bullet list to a single-line comma-joined string for the
  // template path. The free-form fallback (`text`) keeps the multi-line bullets.
  const hostingItems = [`${m.covers} ${m.covers === 1 ? 'cover' : 'covers'}`];
  (m.add_ons || []).forEach(a => hostingItems.push(a));
  if (m.cash_paise) hostingItems.push(`₹${(m.cash_paise/100).toLocaleString('en-IN')} cash on top of the meal`);
  const hostingWith = hostingItems.join(' · ');

  const asks = (m.asks || []).join(' · ');

  // creator_invitation_confirmed_v3 — same body as v2 + a single URL button "Get directions"
  // (static URL, no variable, so no buttonVars needed). Falls back to v2 / free-form if v3
  // not yet approved.
  const r = await sendWabaSmart(env, app.contact_phone,
    ['creator_invitation_confirmed_v3', 'creator_invitation_confirmed_v2'],
    [tierLabel, slotStr, hostingWith, asks],
    text,
    null,
  );
  try {
    await db.prepare(`
      UPDATE influencer_applications
      SET notes_owner = COALESCE(notes_owner, '') ||
          (CASE WHEN COALESCE(notes_owner,'') = '' THEN '' ELSE char(10) END) ||
          ?
      WHERE id = ?
    `).bind(
      `[${new Date().toISOString()}] creator-waba: ${r.ok ? 'sent ' + (r.message_id||'') : 'FAILED ' + JSON.stringify(r).slice(0,200)}`,
      app.id
    ).run();
  } catch {}
  return r;
}

// ─────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────
function genToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]));
}

async function safeJson(req) {
  try { return await req.json(); } catch { return {}; }
}
