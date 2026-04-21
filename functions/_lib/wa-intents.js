// WhatsApp Intent Classification Module
// Phase 1 of the message architecture rollout (see /ops/message-architecture/).
// This module is ADDITIVE — nothing in functions/api/whatsapp.js calls it yet.
// It is safe to deploy in this state: the module is loaded only when imported.
//
// Next phases will:
//   Phase 2: log-only integration into _handleIdleInner (writes intent to wa_messages)
//   Phase 3: send4CtaFallback + Talk-to-Faheem escape
//   Phase 4: handleDeliveryDeflect + handleCodDeflect (uses this module)
//   Phase 5: dishLookup (uses DISH_ALIASES below)
//   Phase 6: handleCancel with Razorpay refund
//   Phase 7: handleDirections (URL menu redirect, static map)
//   Phase 8: swap master router to routeInboundMessage()

// ── Intent taxonomy ────────────────────────────────────────────────────────
// Ordered. First match wins. Derived from classifying 336 real inbound
// messages (see /ops/message-architecture/#intents).
export const INTENT_PATTERNS = [
  // Station QR prefills (highest priority — inside outlet)
  ['station_qr_bm',        /\bbm\s+counter|bane?\s*marie|bain\s*marie\b/i],
  ['station_qr_juice',     /\bjuice\s+counter|fresh\s+juice\b/i],
  ['station_qr_shawarma',  /\bshawarma\s+counter\b/i],
  ['station_qr_grill',     /\bgrill\s+counter\b/i],
  ['station_qr_sheek',     /\bsheek\s*kab+ab|sheek\s+counter\b/i],

  // Meta CTWA ad prefill (47.9% of all inbound text)
  ['meta_ad_combo',        /^combo[s]?$|which\s+combo|kab+ab.*ghee\s*rice|ghee\s*rice.*kab+ab/i],

  // Source-link prefills (Google GBP / organic)
  ['order_intent_source',  /i'?d?\s*like\s*to\s*order\s+and\s+collect|collect\s+at\s+the\s+outlet/i],
  ['booking_intent_source',/i'?d?\s*like\s*to\s*book\s+a\s+table/i],

  // Human-handoff signals (must match BEFORE complaint/cancel)
  ['talk_to_human',        /\b(talk\s+to|speak\s+to|contact|reach|connect\s+me).{0,10}(staff|person|human|someone|owner|manager|faheem)|\b(call\s+me|can\s+i\s+call|give\s+me\s+a\s+call|phone\s+number|contact\s+number)\b|\b(real\s+person|live\s+agent|actual\s+human)\b/i],

  // Core intents
  ['menu_request',         /\b(menu|meny|meunu|menu\s+card|menu\s+plz|menu\s+please|send\s+menu|full\s+menu|show\s+menu|can\s+i\s+get.*menu|give\s+me.*menu|i\s+want.*menu)\b/i],
  ['delivery_ask',         /\b(delivery|deliver|home\s+deliver|deliver\s+to|parcel|door\s*step|doorstep|send\s+home|home\s+deliver)\b/i],
  ['cod_ask',              /\b(cod|cash\s+on\s+delivery|pay\s+cash|cash\s+payment|pay\s+after)\b/i],
  ['location_direction',   /\b(location|where|address|pin|map|direction|how\s+to\s+reach|landmark|where\s+is|shop\s+number|find\s+you|which\s+road)\b/i],
  ['timing_ask',           /\b(timing|open|close[ds]?|closing|what\s+time|till|open\s+till|kitne\s+baje|when\s+open|operating|hours)\b/i],
  ['booking_intent',       /\b(book|reserv|table\s+for\s+\d|family\s+table|party\s+of\s+\d|group\s+of\s+\d|seat\s+for)\b/i],
  ['order_intent',         /\b(order|want\s+to\s+order|can\s+i\s+order|place\s+order|want\s+to\s+eat|looking\s+to\s+order|chahiye|chaiye)\b/i],
  ['track_order',          /\b(status|where\s+is\s+my|order\s+update|tracking|ready\s+yet|when\s+will.*ready|eta|how\s+long)\b/i],
  ['cancel_refund',        /^cancel\b|\brefund\b|\bmoney\s+back|wrong\s+order|not\s+want|dont\s+want|do\s+not\s+want\b/i],
  ['complaint',            /\b(bad|worst|not\s+good|cold|stale|smelly|missing|short|less|not\s+received|not\s+delivered|waste|complaint|issue|problem|terrible|awful|horrible)\b/i],
  ['payment_confirm',      /\b(paid|payment\s+done|money\s+sent|transferred|upi\s+sent|gpay\s+done|phonepe\s+done)\b/i],
  ['swiggy_zomato',        /\b(swiggy|zomato|aggregator)\b/i],

  // Specific-dish queries (broad — must match AFTER core intents)
  ['specific_dish',        /\b(biryani|biriyani|biriani|mandhi|mandi|kab+ab|kebab|ghee\s*rice|bheja|brain|shawarma|tandoor|chicken|mutton|fish|prawn|paneer|naan|roti|juice|tea|chai|coffee|fry|tikka|pulao|rice|kulcha|dal|shak|sheek|butter\s*chicken|dum\s*ka|kheema)\b/i],

  // Conversational
  ['greeting',             /^(hi|hii+|hey+|hello+|yo+|salam|assalam|as-?salam|namaste|good\s+(morning|afternoon|evening)|bro|sir|madam|anna|annna)[\s\.,!?]*$/i],
  ['thanks',               /^(thanks?|thank\s+you|ty|thanku|shukriya|shukran)[\s\.,!?]*$/i],
  ['yes_no',               /^(yes|yeah|yup|yep|sure|ok|okay|k|kk|done|correct|right|no|nope|nah)[\s\.,!?]*$/i],
  ['gibberish',            /^[^a-z0-9]{1,4}$/i],

  // Spam / out-of-scope
  ['b2b_pitch',            /\b(billing\s+software|your\s+restaurant|health\s+report\s+card|profile\s+improvement|ads\s+management|seo\s+service|google\s+my\s+business\s+service|promote\s+your\s+business)\b/i],
  ['hiring_candidate',     /\b(workindia|job\s+vacancy|looking\s+for\s+(job|work)|any\s+vacanc|hiring|apply\s+for\s+job)\b/i],
];

// ── Dish aliases ───────────────────────────────────────────────────────────
// Maps user-typed keywords to actual menu products.
// null value = explicitly not on menu (honest deflect + closest match).
export const DISH_ALIASES = {
  // Available
  'paneer':        { status: 'available', primary: 'Paneer Masala', price: 210, retailer_id: null, alt: ['Paneer Butter Masala'] },
  'biryani':       { status: 'available', primary: 'Chicken Biryani', price: 249, retailer_id: 'HE-0001' },
  'ghee rice':     { status: 'available', primary: 'Ghee Rice', price: 149, retailer_id: 'HE-0002' },
  'kabab':         { status: 'available', primary: 'Chicken Kabab', price: 99, retailer_id: 'HE-0003' },
  'kebab':         { status: 'available', primary: 'Chicken Kabab', price: 99, retailer_id: 'HE-0003' },
  'brain':         { status: 'available', primary: 'Brain Dry Fry', price: 199, retailer_id: 'HE-0004' },
  'bheja':         { status: 'available', primary: 'Brain Dry Fry', price: 199, retailer_id: 'HE-0004' },
  'shawarma':      { status: 'available', primary: 'Chicken Shawarma', price: 129, retailer_id: 'HE-S001' },
  'roti':          { status: 'available', primary: 'Tandoor Roti', price: 15, retailer_id: null },
  'naan':          { status: 'available', primary: 'Butter Naan', price: 35, retailer_id: null },
  'kulcha':        { status: 'available', primary: 'Butter Kulcha', price: 45, retailer_id: null },
  'butter chicken':{ status: 'available', primary: 'Butter Chicken', price: 249, retailer_id: null },
  'dal':           { status: 'available', primary: 'Dal Fry', price: 139, retailer_id: null },
  'juice':         { status: 'available', primary: 'Fresh Juice', price: 80, retailer_id: 'HE-J001' },

  // Not on menu — honest deflect + closest match
  'mandhi':        { status: 'unavailable', reason: "Mandi isn't on our menu.", closest: 'Our closest match is Ghee Rice + Chicken Kabab (combo from ₹299).' },
  'mandi':         { status: 'unavailable', reason: "Mandi isn't on our menu.", closest: 'Our closest match is Ghee Rice + Chicken Kabab (combo from ₹299).' },
  'tea':           { status: 'unavailable', reason: "We don't serve tea — we're the biryani-side of the Hamza family.", closest: 'For chai, visit our sister outlet Nawabi Chai House.' },
  'chai':          { status: 'unavailable', reason: "We don't serve chai — we're the biryani-side of the Hamza family.", closest: 'For chai, visit our sister outlet Nawabi Chai House.' },
  'coffee':        { status: 'unavailable', reason: "No coffee here.", closest: 'Try our fresh juice instead — mango, watermelon, pomegranate.' },
};

// ── Classifier ─────────────────────────────────────────────────────────────
export function classifyIntent(text) {
  const t = (text || '').toLowerCase().trim();
  if (!t) return 'empty';
  if (t.length === 0) return 'empty';
  for (const [name, pattern] of INTENT_PATTERNS) {
    if (pattern.test(t)) return name;
  }
  // Heuristic: short (1-2 words) and alphabetic = likely name reply
  if (t.length <= 30 && /^[a-z][a-z\s]+$/i.test(t) && t.split(/\s+/).length <= 3) {
    return 'name_reply';
  }
  return 'unclassified';
}

// ── Dish lookup ────────────────────────────────────────────────────────────
export function dishLookup(text) {
  const t = (text || '').toLowerCase().trim();
  // Try each dish alias key
  for (const [key, info] of Object.entries(DISH_ALIASES)) {
    if (t.includes(key)) {
      return { matched: key, ...info };
    }
  }
  return null;
}

// ── Tier calculator ────────────────────────────────────────────────────────
// Unified with existing getCustomerTier() in whatsapp.js but adds more signals.
// NEW (0 orders, 0 sessions) / LEARNING (1-2 sessions, 0 orders) / FAMILIAR (3-9 or 1 order) / REGULAR (10+ or 3 orders)
export function computeFamiliarity({ totalOrders = 0, totalSessions = 0, totalBookings = 0, counterSource = null } = {}) {
  if (counterSource) return 'station_scanner';
  if (totalOrders >= 3 || totalSessions >= 10 || totalBookings >= 2) return 'regular';
  if (totalOrders >= 1 || totalSessions >= 3 || totalBookings >= 1) return 'familiar';
  if (totalSessions >= 1) return 'learning';
  return 'new';
}

// ── Talk-to-human escalation detector ──────────────────────────────────────
// Returns { shouldEscalate: bool, reason: string } based on signals.
export function shouldEscalateToHuman({ intent, recentIntents = [], hasActivePaidOrder = false, partySize = null }) {
  if (intent === 'talk_to_human')   return { shouldEscalate: true, reason: 'user_requested' };
  if (intent === 'complaint')       return { shouldEscalate: true, reason: 'complaint' };
  if (intent === 'cancel_refund' && hasActivePaidOrder) return { shouldEscalate: true, reason: 'cancel_paid_order' };
  if (partySize && partySize > 8)   return { shouldEscalate: true, reason: 'large_party_booking' };
  // 3 unclassified in a row
  const last3 = recentIntents.slice(-3);
  if (last3.length === 3 && last3.every(i => i === 'unclassified' || i === 'gibberish')) {
    return { shouldEscalate: true, reason: 'three_unclassified' };
  }
  return { shouldEscalate: false, reason: null };
}
