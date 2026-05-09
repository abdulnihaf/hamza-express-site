# WhatsApp Message Architecture — Build Plan

Phased rollout. Each phase is a single reversible commit. After every commit:
observe for 24h → verify no regressions → approve next phase. Companion UX
doc: <https://hamzaexpress.in/ops/message-architecture/>.

**Invariants during rollout:**
- Existing paying flows (CTWA → MPM → UPI, station QR, booking flow) must not break at any point.
- Each new handler is additive. Nothing replaces the existing router until Phase 8.
- All new code is gated on `session.variant === 'v2'` OR a feature flag until promoted.

---

## Phase 1 — New intent module (SHIPPED ✅)

**File:** `functions/_lib/wa-intents.js` (NEW, 145 lines, pure exports)
**Touches:** zero existing files
**Risk:** zero — nothing imports this yet
**Deployed:** commit [pending — this PR]

**What it contains:**
- `INTENT_PATTERNS` — 30+ regex patterns, ordered, derived from 336 real messages
- `DISH_ALIASES` — available + unavailable (mandi, tea, coffee) dish lookup table
- `classifyIntent(text)` — returns one of ~25 intent strings
- `dishLookup(text)` — returns matched dish with price OR `null`
- `computeFamiliarity(user)` — NEW / LEARNING / FAMILIAR / REGULAR / STATION
- `shouldEscalateToHuman(signals)` — returns `{ shouldEscalate, reason }`

**Verify:** module loads at edge without error. No behaviour change.

---

## Phase 2 — Log-only intent classification (next)

**File:** `functions/api/whatsapp.js`
**Touches:** +1 import at top, +1 DB write in `_handleIdleInner`
**Risk:** very low — adds a column write, no branching logic change
**Requires:** Phase 1 deployed

**Steps:**
1. Add `ALTER TABLE wa_messages ADD COLUMN intent TEXT;` migration (run via `wrangler d1 execute`).
2. In `whatsapp.js`, add at top:
   ```js
   import { classifyIntent } from '../_lib/wa-intents.js';
   ```
3. In `_handleIdleInner` (line 1333), add near the top:
   ```js
   const classifiedIntent = msg.type === 'text' ? classifyIntent(msg.text) : null;
   if (classifiedIntent) {
     try {
       await db.prepare('UPDATE wa_messages SET intent = ? WHERE wa_message_id = ?')
         .bind(classifiedIntent, msg.id).run();
     } catch (e) { /* non-critical */ }
   }
   ```
4. Deploy. Observe for 48h. Query: `SELECT intent, COUNT(*) FROM wa_messages WHERE created_at > ? GROUP BY intent`.

**Verify:**
- `intent` column populated for 95%+ of new inbound text
- `unclassified` bucket &lt; 10% (if higher, tune INTENT_PATTERNS before advancing)
- No regressions in paid orders / bookings / station QR

**Rollback:** remove the `UPDATE` line + import. No schema rollback needed (column is nullable).

---

## Phase 3 — `send4CtaFallback()` + Talk-to-Faheem

**File:** `functions/api/whatsapp.js`
**Touches:** +2 new helper functions, no wiring yet
**Risk:** low — functions exist but nothing calls them
**Requires:** Phase 2 observed green for 48h

**Add two helpers:**

```js
// The universal 4-CTA card — outlet-first ordering
async function send4CtaFallback(phoneId, token, waId, bodyText, opts = {}) {
  const rows = [
    { id: 'get_directions', title: '📍 Get Directions',  description: 'HKP Road, opp Russell Market' },
    { id: 'book_table',     title: '📅 Book a Table',    description: 'Reserve for dine-in' },
    { id: 'view_menu',      title: '📖 View Full Menu',  description: 'See photos + combos on site' },
    { id: 'order_takeaway', title: '🥡 Order for Pickup',description: 'Pay UPI, collect in 15 min' },
  ];
  if (opts.includeTalkToHuman) {
    rows.push({ id: 'talk_to_staff', title: '💬 Talk to a person', description: 'Faheem will reach out' });
  }
  const listMsg = {
    messaging_product: 'whatsapp', to: waId, type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: { button: 'See Options', sections: [{ title: 'How can we help?', rows }] },
    },
  };
  return sendWhatsApp(phoneId, token, listMsg);
}

// Pause bot + ping Faheem
async function escalateToFaheem(db, waId, reason, context = {}) {
  const pausedUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 19);
  await db.prepare(
    'UPDATE wa_sessions SET bot_paused = 1, paused_until = ?, paused_reason = ? WHERE wa_id = ?'
  ).bind(pausedUntil, reason, waId).run();
  await db.prepare(
    'INSERT INTO lead_audit (wa_id, field, before_val, after_val, actor) VALUES (?, ?, ?, ?, ?)'
  ).bind(waId, 'bot_paused', '0', '1', 'system:' + reason).run();
  // /ops/leads/ dashboard picks this up on next poll
}
```

**Migration:**
```sql
ALTER TABLE wa_sessions ADD COLUMN bot_paused INTEGER DEFAULT 0;
ALTER TABLE wa_sessions ADD COLUMN paused_until TEXT;
ALTER TABLE wa_sessions ADD COLUMN paused_reason TEXT;
```

**Update button handler:** in the list_reply / button_reply switch, add:
```js
case 'view_menu':      return sendMenuLink(phoneId, token, waId);      // Phase 7
case 'get_directions': return handleDirections(phoneId, token, waId);  // Phase 7
case 'talk_to_staff':  return escalateToFaheem(db, waId, 'user_requested');
```

**Verify:** fire 4-CTA card from a test account, click each — all route correctly.

**Rollback:** remove helper functions. Unreferenced, safe.

---

## Phase 4 — Delivery + COD deflect (12 users instantly served)

**File:** `functions/api/whatsapp.js`
**Touches:** replaces `FAQ_RESPONSES.delivery` path with proper handler
**Risk:** low — one branch swap, still caught by try/catch wrapper
**Requires:** Phase 3 deployed

**Change:** in `_handleIdleInner`, route `delivery_ask` + `cod_ask` intents:

```js
if (classifiedIntent === 'delivery_ask') return handleDeliveryDeflect(phoneId, token, waId);
if (classifiedIntent === 'cod_ask')      return handleCodDeflect(phoneId, token, waId);
```

**New handler:**
```js
async function handleDeliveryDeflect(phoneId, token, waId) {
  const text = "We're a pickup-first kitchen — no direct delivery from WhatsApp. But you can:\n\n"
             + "🛵 Order on *Swiggy* or *Zomato*\n"
             + "🥡 Pay UPI here, collect in 15 min\n"
             + "📍 Walk in — we're 5 min from Russell Market";
  await sendWhatsApp(phoneId, token, buildText(waId, text));
  // CTA URL cards for Swiggy + Zomato + pickup + directions
  const buttons = [
    { type: 'reply', reply: { id: 'order_takeaway', title: '🥡 Order Pickup' } },
    { type: 'reply', reply: { id: 'get_directions', title: '📍 Directions' } },
    { type: 'reply', reply: { id: 'talk_to_staff',  title: '💬 Faheem' } },
  ];
  await sendWhatsApp(phoneId, token, buildReplyButtons(waId, 'Pick a path:', buttons));
  // Send Swiggy + Zomato as separate CTA URL messages (WA doesn't allow URL + reply in same card)
  await sendCtaUrl(phoneId, token, waId, '🛵 Order on Swiggy', 'https://hamzaexpress.in/go/swiggy');
  await sendCtaUrl(phoneId, token, waId, '🛵 Order on Zomato', 'https://hamzaexpress.in/go/zomato');
}

async function handleCodDeflect(phoneId, token, waId) { /* same, different copy */ }
```

**Depends on:** source links `/go/swiggy`, `/go/zomato` (verify exist in `functions/go/*`).

**Verify:** user types "home delivery" → receives text + 3 buttons + 2 URL cards. 9 existing delivery-ask users' next message handled correctly.

**Rollback:** remove the two branches + handler functions.

---

## Phase 5 — Dish lookup (5+ users instantly served)

**File:** `functions/api/whatsapp.js`
**Touches:** +1 import from Phase 1, +1 handler, +1 branch
**Risk:** low
**Requires:** Phase 4 deployed

**Wire up `dishLookup`:**
```js
import { classifyIntent, dishLookup } from '../_lib/wa-intents.js';

if (classifiedIntent === 'specific_dish') {
  return handleDishQuery(phoneId, token, waId, msg.text, user, db);
}
```

**Handler:**
```js
async function handleDishQuery(phoneId, token, waId, text, user, db) {
  const match = dishLookup(text);
  if (!match) return send4CtaFallback(phoneId, token, waId, "Couldn't find that on our menu — here's what we do:");

  if (match.status === 'available') {
    const body = `Yes — ${match.primary} is ₹${match.price}. Full menu + photos:`;
    await sendWhatsApp(phoneId, token, buildText(waId, body));
    return send4CtaFallback(phoneId, token, waId, 'Next step:');
  }

  if (match.status === 'unavailable') {
    const body = `${match.reason}\n\n${match.closest}`;
    await sendWhatsApp(phoneId, token, buildText(waId, body));
    return send4CtaFallback(phoneId, token, waId, 'Here is what we have:');
  }
}
```

**Verify:** "paneer hai" → "Yes — Paneer Masala is ₹210…" + 4-CTA. "mandi hai" → "Mandi isn't on our menu. Our closest match is Ghee Rice + Chicken Kabab…" + 4-CTA.

---

## Phase 6 — Cancel + Razorpay refund (14 users served)

**File:** `functions/api/whatsapp.js`
**Touches:** expand `handleCancelOrder` (line 2609) + add Razorpay refund call
**Risk:** medium — touches money. Test on test.hamzahotel.com first.
**Requires:** Phase 5 deployed + test refund verified

**Flow:**
1. User types "cancel" → `classifyIntent` → `cancel_refund`
2. Lookup `wa_orders` latest row for this waId
3. Branch on status:
   - `draft` / `payment_pending`: auto-cancel (free, no Odoo mutation needed)
   - `paid` + Odoo status `paid` + NOT yet in KDS: Razorpay refund via API + Odoo cancel
   - `paid` + already in KDS: escalate to Faheem ("we've started cooking — Faheem will call")

**New helper:**
```js
async function razorpayRefund(context, paymentId, amountPaise, reason) {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = context.env;
  const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
  const r = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, notes: { reason } }),
  });
  return r.json();
}
```

**Verify on test env first:** create test order, pay ₹1, cancel via WhatsApp, confirm refund lands.

**Rollback:** revert `handleCancel` to old behaviour (error message + escalate).

---

## Phase 7 — Directions + Menu link (URL, not MPM)

**File:** `functions/api/whatsapp.js`
**Touches:** +2 new handlers, replace current location FAQ response
**Risk:** low
**Requires:** Phase 6 deployed

**handleDirections:**
```js
async function handleDirections(phoneId, token, waId) {
  // 1. Static map image
  const staticMap = 'https://maps.googleapis.com/maps/api/staticmap?center=12.9868,77.6044&zoom=17&size=600x400&markers=color:red%7C12.9868,77.6044&key=' + context.env.GOOGLE_MAPS_KEY;
  await sendWhatsApp(phoneId, token, {
    messaging_product: 'whatsapp', to: waId, type: 'image',
    image: { link: staticMap, caption: '📍 Hamza Express · HKP Road, opp Russell Market, Shivajinagar 560051' },
  });
  // 2. Text with hours
  await sendWhatsApp(phoneId, token, buildText(waId, 'Open 12 PM – 12:30 AM daily · 5 min walk from Shivajinagar bus stand'));
  // 3. CTA URL button → Google Maps
  await sendCtaUrl(phoneId, token, waId, '🗺 Open in Google Maps', 'https://hamzaexpress.in/go/maps');
  // 4. Follow-up CTA options
  return send4CtaFallback(phoneId, token, waId, 'Anything else?');
}

async function sendMenuLink(phoneId, token, waId) {
  await sendWhatsApp(phoneId, token, buildText(waId,
    "Here's our full menu with photos, combos, and prices — tap below 👇"
  ));
  await sendCtaUrl(phoneId, token, waId, '📖 View Full Menu', 'https://hamzaexpress.in/#menu');
  return send4CtaFallback(phoneId, token, waId, 'Ready to decide?');
}
```

**New helper `sendCtaUrl`:**
```js
async function sendCtaUrl(phoneId, token, waId, buttonText, url) {
  return sendWhatsApp(phoneId, token, {
    messaging_product: 'whatsapp', to: waId, type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: ' ' },  // required field
      action: { name: 'cta_url', parameters: { display_text: buttonText, url } },
    },
  });
}
```

**Env secret needed:** `GOOGLE_MAPS_KEY` (Static Maps API, free tier 100k req/mo).

**Update button handler:**
```js
case 'view_menu':      return sendMenuLink(phoneId, token, waId);
case 'get_directions': return handleDirections(phoneId, token, waId);
```

**Verify:** tap "View Menu" → text + URL button. Tap "Directions" → map image + text + map button + 4-CTA.

---

## Phase 8 — Master router swap

**File:** `functions/api/whatsapp.js`
**Touches:** replaces the `_handleIdleInner` body with `routeInboundMessage()`
**Risk:** medium — swaps the core logic. Test aggressively on test env first.
**Requires:** Phases 2-7 all green for 72h

**The swap:**
```js
async function _handleIdleInner(context, session, user, msg, waId, phoneId, token, db) {
  return routeInboundMessage({ context, session, user, msg, waId, phoneId, token, db });
}

async function routeInboundMessage({ context, session, user, msg, waId, phoneId, token, db }) {
  // 1. Meta-level checks (already in place — keep)
  if (await isHiringCandidate(waId, context.env)) return;
  if (isAdmin(waId)) return;
  if (session.bot_paused) return;  // Faheem has taken over

  // 2. Non-text handlers
  if (msg.type === 'nfm_reply')    return handleBookingFlowResponse(...);
  if (msg.type === 'order')        return handleOrderMessage(...);
  if (msg.type === 'image')        return send4CtaFallback(phoneId, token, waId,
    "We can't read images. Here's what I can help with:");
  if (msg.type === 'location')     return handleSharedLocation(msg, ...);
  if (msg.type === 'reaction')     return;  // silent
  if (msg.type === 'unsupported')  return send4CtaFallback(...);

  // 3. Text intent classifier
  const text = msg.type === 'text' ? msg.text : '';
  const intent = classifyIntent(text);

  // 4. Escalation check (before any response)
  const recent = await getRecentIntents(db, waId, 3);
  const esc = shouldEscalateToHuman({
    intent, recentIntents: recent,
    hasActivePaidOrder: !!session.last_paid_order_id,
  });
  if (esc.shouldEscalate) {
    await escalateToFaheem(db, waId, esc.reason);
    return send4CtaFallback(phoneId, token, waId,
      'Got it — Faheem will reach out. Meanwhile:', { includeTalkToHuman: false });
  }

  // 5. Intent-specific handlers
  switch (intent) {
    case 'meta_ad_combo':         return handleMetaAdCombos(...);
    case 'station_qr_bm':         return handleCounterMenu(..., 'bm_counter');
    case 'station_qr_juice':      return handleCounterMenu(..., 'juice_counter');
    case 'station_qr_shawarma':   return handleCounterMenu(..., 'shawarma_counter');
    case 'station_qr_grill':      return handleCounterMenu(..., 'grill_counter');
    case 'station_qr_sheek':      return handleCounterMenu(..., 'sheek_counter');
    case 'order_intent_source':
    case 'order_intent':          return handleShowMenu(...);
    case 'booking_intent_source':
    case 'booking_intent':        return handleBookingStart(...);
    case 'menu_request':          return sendMenuLink(phoneId, token, waId);
    case 'location_direction':    return handleDirections(phoneId, token, waId);
    case 'delivery_ask':          return handleDeliveryDeflect(phoneId, token, waId);
    case 'cod_ask':               return handleCodDeflect(phoneId, token, waId);
    case 'timing_ask':            return handleTimingReply(phoneId, token, waId);
    case 'specific_dish':         return handleDishQuery(phoneId, token, waId, text, user, db);
    case 'cancel_refund':         return handleCancel(context, waId, user, db);
    case 'track_order':           return handleTrackOrder(...);
    case 'swiggy_zomato':         return handleAggregatorLinks(phoneId, token, waId);
    case 'greeting':              return handleTierGreeting(phoneId, token, waId, user);
    case 'thanks':                return;  // silent (optional: react with ❤)
    case 'yes_no':                return handleYesNoInContext(session, ...);
    case 'b2b_pitch':             return;  // silent ignore + flag
    case 'hiring_candidate':      return;  // HIRING_DB filter already active
    case 'name_reply':
    case 'gibberish':
    case 'unclassified':
    default:                      return send4CtaFallback(phoneId, token, waId,
      "Not sure what you need — pick one:");
  }
}
```

**Parallel testing:** run new router behind `?variant=v2` for 48h with Nihaf + Faheem as test users before promoting.

**Rollback:** revert to prior `_handleIdleInner`. Git tag before swap.

---

## Phase 9 — Familiarity engine (optional, ship later)

Per-user memory layer driving tier-adaptive greetings, one-tap reorder for
REGULARs, skip-brand-context for FAMILIAR+. Ships as a separate module
`functions/lib/wa-familiarity.js`. Read `/ops/message-architecture/#familiarity`
for spec.

---

## Checklist — what Nihaf approves before each phase

- [ ] Phase 1 — just ship, zero risk ← **this PR**
- [ ] Phase 2 — migration + 48h observation
- [ ] Phase 3 — 4-CTA helper + escalate helper
- [ ] Phase 4 — delivery / COD deflect (LIVE on real customers)
- [ ] Phase 5 — dish lookup (LIVE)
- [ ] Phase 6 — cancel + refund (TEST env first, ₹1 test order)
- [ ] Phase 7 — directions + menu link (requires `GOOGLE_MAPS_KEY` secret)
- [ ] Phase 8 — master router swap (48h v2 test, then promote)
- [ ] Phase 9 — familiarity engine (optional)
