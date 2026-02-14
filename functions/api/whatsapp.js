// Hamza Express — WhatsApp Ordering System v1.0
// Cloudflare Pages Function: /api/whatsapp
// Handles: webhook verification, message processing, state machine, payment callbacks, dashboard API
// Architecture: WhatsApp Cloud API → Razorpay UPI → Odoo POS → KDS
// All orders are takeaway/counter pickup — NO delivery

// ── Product catalog: retailer_id → Odoo product + price (excl. GST) + category ──
// Price = base price (Half for chicken, Qtr for mutton), GST-exclusive
// parentCatId = parent KDS routing category (22=Indian,23=Biryani,24=Chinese,25=Tandoor,26=FC,27=Juices,28=BM,29=Shawarma,30=Grill)
const CATALOG_ID = '1639757440737691';

const PRODUCTS = {
  // ── Tandoori Dishes (cat 64 → parent 25) ──
  'HE-1134': { name: 'Grill Chicken',              price: 190, odooId: 1134, catId: 25 },
  'HE-1135': { name: 'Tandoori Chicken',            price: 190, odooId: 1135, catId: 25 },
  'HE-1136': { name: 'Barbique Chicken (Boona)',     price: 200, odooId: 1136, catId: 25 },
  'HE-1137': { name: 'Chicken Tikka',               price: 230, odooId: 1137, catId: 25 },
  'HE-1138': { name: 'Kalmi Kabab',                 price: 100, odooId: 1138, catId: 25 },
  'HE-1139': { name: 'Chicken Chops',               price: 200, odooId: 1139, catId: 25 },
  'HE-1140': { name: 'American Chops',              price: 240, odooId: 1140, catId: 25 },
  'HE-1141': { name: 'Haryali Tikka',               price: 230, odooId: 1141, catId: 25 },
  'HE-1142': { name: 'Malai Tikka',                 price: 250, odooId: 1142, catId: 25 },
  'HE-1143': { name: 'Andra Tikka',                 price: 230, odooId: 1143, catId: 25 },
  'HE-1144': { name: 'Pepper Barbique',             price: 200, odooId: 1144, catId: 25 },
  'HE-1145': { name: 'Pahadi Kabab',                price: 210, odooId: 1145, catId: 25 },

  // ── Chicken Gravy (cat 56 → parent 22) ──
  'HE-1146': { name: 'Mughlai Chicken',             price: 200, odooId: 1146, catId: 22 },
  'HE-1147': { name: 'Chicken Dopiyaza',            price: 200, odooId: 1147, catId: 22 },
  'HE-1148': { name: 'Hyderabadi Chicken',          price: 190, odooId: 1148, catId: 22 },
  'HE-1149': { name: 'Butter Chicken',              price: 190, odooId: 1149, catId: 22 },
  'HE-1150': { name: 'Punjabi Chicken',             price: 200, odooId: 1150, catId: 22 },
  'HE-1151': { name: 'Chicken Kali Mirch',          price: 200, odooId: 1151, catId: 22 },
  'HE-1152': { name: 'Chicken Burtha',              price: 220, odooId: 1152, catId: 22 },
  'HE-1153': { name: 'Chicken Masala',              price: 190, odooId: 1153, catId: 22 },
  'HE-1154': { name: 'Methi Chicken',               price: 190, odooId: 1154, catId: 22 },
  'HE-1155': { name: 'Kadai Chicken',               price: 190, odooId: 1155, catId: 22 },
  'HE-1156': { name: 'Chicken Chatpat',             price: 200, odooId: 1156, catId: 22 },
  'HE-1157': { name: 'Chicken Sagwala',             price: 210, odooId: 1157, catId: 22 },
  'HE-1158': { name: 'Tandoori Chicken Masala',     price: 260, odooId: 1158, catId: 22 },
  'HE-1159': { name: 'Theethar Pepper Roast',       price: 280, odooId: 1159, catId: 22 },
  'HE-1160': { name: 'Chicken Hamza Special',       price: 210, odooId: 1160, catId: 22 },
  'HE-1161': { name: 'Chicken Tikka Masala',        price: 280, odooId: 1161, catId: 22 },
  'HE-1162': { name: 'Kolapuri Chicken',            price: 200, odooId: 1162, catId: 22 },

  // ── Chinese Chicken (cat 60 → parent 24) ──
  'HE-1163': { name: 'Chicken Kabab',               price: 170, odooId: 1163, catId: 24 },
  'HE-1164': { name: 'Chilly Chicken',              price: 190, odooId: 1164, catId: 24 },
  'HE-1165': { name: 'Chicken Manchurian',          price: 190, odooId: 1165, catId: 24 },
  'HE-1166': { name: 'Chicken 65',                  price: 200, odooId: 1166, catId: 24 },
  'HE-1167': { name: 'Chicken Singapore',           price: 210, odooId: 1167, catId: 24 },
  'HE-1168': { name: 'Lemon Chicken',               price: 210, odooId: 1168, catId: 24 },
  'HE-1169': { name: 'Chicken Pepper Dry',          price: 190, odooId: 1169, catId: 24 },
  'HE-1170': { name: 'Garlic Chicken',              price: 190, odooId: 1170, catId: 24 },
  'HE-1171': { name: 'Chicken Jalfrize',            price: 220, odooId: 1171, catId: 24 },
  'HE-1172': { name: 'Lollipop',                    price: 170, odooId: 1172, catId: 24 },
  'HE-1173': { name: 'Theethar Pepper Dry',         price: 260, odooId: 1173, catId: 24 },
  'HE-1174': { name: 'Hongkong Chicken',            price: 210, odooId: 1174, catId: 24 },
  'HE-1175': { name: 'Chicken Hot & Sour Wings',    price: 170, odooId: 1175, catId: 24 },
  'HE-1176': { name: 'Honey Chicken',               price: 230, odooId: 1176, catId: 24 },

  // ── Mutton Gravy (cat 57 → parent 22) ──
  'HE-1177': { name: 'Mutton Rogan Josh',           price: 200, odooId: 1177, catId: 22 },
  'HE-1178': { name: 'Methi Mutton',                price: 200, odooId: 1178, catId: 22 },
  'HE-1179': { name: 'Mutton Achari',               price: 220, odooId: 1179, catId: 22 },
  'HE-1180': { name: 'Kadai Mutton',                price: 210, odooId: 1180, catId: 22 },
  'HE-1181': { name: 'Mutton Chatpat',              price: 220, odooId: 1181, catId: 22 },
  'HE-1182': { name: 'Mutton Punjabi',              price: 220, odooId: 1182, catId: 22 },
  'HE-1183': { name: 'Mutton Sagwala',              price: 220, odooId: 1183, catId: 22 },
  'HE-1184': { name: 'Mutton Hyderabadi',           price: 210, odooId: 1184, catId: 22 },
  'HE-1185': { name: 'Mutton Masala',               price: 200, odooId: 1185, catId: 22 },
  'HE-1186': { name: 'Mutton Kolapuri',             price: 220, odooId: 1186, catId: 22 },
  'HE-1187': { name: 'Mutton Pepper Roast',         price: 210, odooId: 1187, catId: 22 },
  'HE-1188': { name: 'Mutton Kassa',                price: 220, odooId: 1188, catId: 22 },
  'HE-1189': { name: 'Mutton Tadka',                price: 200, odooId: 1189, catId: 22 },
  'HE-1190': { name: 'Mutton Hamza Special',        price: 230, odooId: 1190, catId: 22 },

  // ── Mutton Dry (cat 62 → parent 24) ──
  'HE-1191': { name: 'Mutton Pepper Dry',           price: 200, odooId: 1191, catId: 24 },
  'HE-1192': { name: 'Mutton Brain Dry',            price: 150, odooId: 1192, catId: 24 },
  'HE-1193': { name: 'Mutton Jalfrize',             price: 230, odooId: 1193, catId: 24 },
  'HE-1194': { name: 'Mutton Gurda Dry',            price: 200, odooId: 1194, catId: 24 },
  'HE-1195': { name: 'Mutton Sheek Kabab',          price: 130, odooId: 1195, catId: 24 },

  // ── Breakfast Special (cat 59 → parent 22) ──
  'HE-1196': { name: 'Mutton Paya',                 price: 130, odooId: 1196, catId: 22 },
  'HE-1197': { name: 'Mutton Khima',                price: 120, odooId: 1197, catId: 22 },
  'HE-1198': { name: 'Mutton Brain',                price: 150, odooId: 1198, catId: 22 },
  'HE-1199': { name: 'Mutton Chops',                price: 130, odooId: 1199, catId: 22 },

  // ── Biryani (cat 67 → parent 23) ──
  'HE-1200': { name: 'Mutton Biryani',              price: 220, odooId: 1200, catId: 23 },
  'HE-1201': { name: 'Chicken Biryani',             price: 220, odooId: 1201, catId: 23 },
  'HE-1202': { name: 'Theethar Biryani',            price: 280, odooId: 1202, catId: 23 },
  'HE-1203': { name: 'Biryani Rice',                price: 160, odooId: 1203, catId: 23 },
  'HE-1204': { name: 'Egg Biryani',                 price: 180, odooId: 1204, catId: 23 },

  // ── Rice Items (cat 68 → parent 23) ──
  'HE-1205': { name: 'Ghee Rice',                   price: 80,  odooId: 1205, catId: 23 },
  'HE-1206': { name: 'Jeera Rice',                  price: 60,  odooId: 1206, catId: 23 },
  'HE-1207': { name: 'Plain Rice',                  price: 45,  odooId: 1207, catId: 23 },

  // ── Rolls (cat 66 → parent 25) ──
  'HE-1208': { name: 'Chicken Roll',                price: 80,  odooId: 1208, catId: 25 },
  'HE-1209': { name: 'Egg Roll',                    price: 80,  odooId: 1209, catId: 25 },
  'HE-1210': { name: 'Veg Roll',                    price: 70,  odooId: 1210, catId: 25 },
  'HE-1211': { name: 'Mutton Sheek Roll',           price: 140, odooId: 1211, catId: 25 },

  // ── Roti & Parathas (cat 65 → parent 25) ──
  'HE-1212': { name: 'Kerala Paratha',              price: 25,  odooId: 1212, catId: 25 },
  'HE-1213': { name: 'Ceylon Paratha',              price: 27,  odooId: 1213, catId: 25 },
  'HE-1214': { name: 'Coin Paratha',               price: 25,  odooId: 1214, catId: 25 },
  'HE-1215': { name: 'Irani Paratha',              price: 37,  odooId: 1215, catId: 25 },
  'HE-1216': { name: 'Wheat Paratha',              price: 30,  odooId: 1216, catId: 25 },
  'HE-1217': { name: 'Chapathi',                   price: 18,  odooId: 1217, catId: 25 },
  'HE-1218': { name: 'Roomali Roti',               price: 15,  odooId: 1218, catId: 25 },
  'HE-1219': { name: 'Naan',                       price: 40,  odooId: 1219, catId: 25 },
  'HE-1220': { name: 'Butter Naan',                price: 45,  odooId: 1220, catId: 25 },
  'HE-1221': { name: 'Kulcha',                     price: 45,  odooId: 1221, catId: 25 },
  'HE-1222': { name: 'Garlic Naan',                price: 45,  odooId: 1222, catId: 25 },
  'HE-1223': { name: 'Tandoori Paratha',           price: 40,  odooId: 1223, catId: 25 },
  'HE-1224': { name: 'Pathla Roti',                price: 30,  odooId: 1224, catId: 25 },

  // ── Indian Veg (cat 58 → parent 22) ──
  'HE-1225': { name: 'Dal Fry',                    price: 100, odooId: 1225, catId: 22 },
  'HE-1226': { name: 'Paneer Butter Masala',       price: 160, odooId: 1226, catId: 22 },
  'HE-1227': { name: 'Kadai Paneer',               price: 160, odooId: 1227, catId: 22 },
  'HE-1228': { name: 'Palak Paneer',               price: 170, odooId: 1228, catId: 22 },
  'HE-1229': { name: 'Paneer Mutter Masala',       price: 170, odooId: 1229, catId: 22 },
  'HE-1230': { name: 'Aloo Gobi',                  price: 160, odooId: 1230, catId: 22 },
  'HE-1231': { name: 'Mixed Veg Curry',            price: 170, odooId: 1231, catId: 22 },
  'HE-1232': { name: 'Gobi Masala',                price: 170, odooId: 1232, catId: 22 },
  'HE-1233': { name: 'Dal Tadka',                  price: 110, odooId: 1233, catId: 22 },
  'HE-1234': { name: 'Mushroom Masala',            price: 190, odooId: 1234, catId: 22 },

  // ── Fried Rice & Noodles (cat 61 → parent 24) ──
  'HE-1235': { name: 'Chicken Fried Rice',         price: 150, odooId: 1235, catId: 24 },
  'HE-1236': { name: 'Chicken Noodles',            price: 150, odooId: 1236, catId: 24 },
  'HE-1237': { name: 'Mutton Fried Rice',          price: 170, odooId: 1237, catId: 24 },
  'HE-1238': { name: 'Mutton Noodles',             price: 170, odooId: 1238, catId: 24 },
  'HE-1239': { name: 'Egg Fried Rice',             price: 120, odooId: 1239, catId: 24 },
  'HE-1240': { name: 'Egg Noodles',                price: 120, odooId: 1240, catId: 24 },
  'HE-1241': { name: 'Prawns Fried Rice',          price: 200, odooId: 1241, catId: 24 },
  'HE-1242': { name: 'Prawns Noodles',             price: 200, odooId: 1242, catId: 24 },
  'HE-1243': { name: 'Mix Fried Rice',             price: 160, odooId: 1243, catId: 24 },
  'HE-1244': { name: 'Mix Noodles',                price: 160, odooId: 1244, catId: 24 },
  'HE-1245': { name: 'Chicken Schezwan Fried Rice',price: 170, odooId: 1245, catId: 24 },
  'HE-1246': { name: 'Chicken Schezwan Noodles',   price: 170, odooId: 1246, catId: 24 },
  'HE-1247': { name: 'Veg Fried Rice',             price: 120, odooId: 1247, catId: 24 },
  'HE-1248': { name: 'Veg Noodles',                price: 120, odooId: 1248, catId: 24 },

  // ── Salad & Raitha (cat 69 → parent 28) ──
  'HE-1249': { name: 'Green Salad',                price: 60,  odooId: 1249, catId: 28 },
  'HE-1250': { name: 'Cucumber Salad',             price: 60,  odooId: 1250, catId: 28 },
  'HE-1251': { name: 'Pineapple Raitha',           price: 50,  odooId: 1251, catId: 28 },
  'HE-1252': { name: 'Mix Raitha',                 price: 50,  odooId: 1252, catId: 28 },

  // ── Fish & Seafood (cat 63 → parent 24) ──
  'HE-1253': { name: 'Fried Fish',                 price: 200, odooId: 1253, catId: 24 },
  'HE-1254': { name: 'Fish Masala',                price: 200, odooId: 1254, catId: 24 },
  'HE-1255': { name: 'Chilly Fish',                price: 200, odooId: 1255, catId: 24 },
  'HE-1256': { name: 'Fish Manchurian',            price: 200, odooId: 1256, catId: 24 },
  'HE-1257': { name: 'Kadai Prawns',               price: 250, odooId: 1257, catId: 24 },
  'HE-1258': { name: 'Prawns Chilly Manchurian',   price: 250, odooId: 1258, catId: 24 },
  'HE-1259': { name: 'Prawns Pepper Fry',          price: 250, odooId: 1259, catId: 24 },
};

// ── Category → collection point mapping ──
const KITCHEN_CATS = new Set([22, 24, 25, 26]); // Indian, Chinese, Tandoor, FC → Kitchen Pass
const COUNTER_CATS = {
  23: 'Bane Marie Counter',
  27: 'Juice Counter',
  28: 'Bane Marie Counter',
  29: 'Shawarma Counter',
  30: 'Grill Counter',
};

// ── Product set IDs for multi-product messages ──
const PRODUCT_SETS = {
  indian:   { id: '745179045076813',  name: 'Indian Curries' },
  biryani:  { id: '1223000523357258', name: 'Biryani' },
  chinese:  { id: '4496376613930350', name: 'Chinese' },
  tandoor:  { id: '2771330763214717', name: 'Tandoor & Breads' },
  fc:       { id: '1559176248638822', name: 'Fried Chicken' },
  juices:   { id: '1687197135776243', name: 'Juices & Desserts' },
  bm:       { id: '911630838467540',  name: 'Bane Marie' },
  shawarma: { id: '1390365316106529', name: 'Shawarma' },
  grill:    { id: '1674777217014393', name: 'Grill' },
};

// ── Odoo configuration ──
const ODOO_URL = 'https://ops.hamzahotel.com/jsonrpc';
const ODOO_DB = 'main';
const ODOO_UID = 2;
const POS_CONFIG_ID = 10;     // HE - WABA
const PRICELIST_ID = 1;       // Default pricelist
const PAYMENT_METHOD_UPI = 17; // WABA General UPI
const GST_TAX_ID = 31;        // 5% GST S

// ── WhatsApp configuration ──
// WA_PHONE_ID loaded from env secret (set via wrangler/CF dashboard)
const WA_API_VERSION = 'v21.0';
const PAYMENT_CONFIGURATION = 'Hamza_Express_Payments'; // Razorpay config in WhatsApp Manager

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// ── Station QR keyword → filtered menu mapping ──
const STATION_KEYWORDS = {
  'bm':       { sets: ['biryani', 'bm'],  collection: 'Bane Marie Counter',  label: 'Biryani & Bane Marie' },
  'biryani':  { sets: ['biryani', 'bm'],  collection: 'Bane Marie Counter',  label: 'Biryani & Bane Marie' },
  'juice':    { sets: ['juices'],          collection: 'Juice Counter',       label: 'Juices & Desserts' },
  'juices':   { sets: ['juices'],          collection: 'Juice Counter',       label: 'Juices & Desserts' },
  'shawarma': { sets: ['shawarma'],        collection: 'Shawarma Counter',    label: 'Shawarma' },
  'grill':    { sets: ['grill'],           collection: 'Grill Counter',       label: 'Grill' },
  'kp':       { sets: null,               collection: 'Kitchen Pass',        label: 'Full Menu' }, // null = full menu
};

// ── NCH forwarding (shared WABA webhook) ──
const NCH_PHONE_ID = '970365416152029';
const NCH_WEBHOOK_URL = 'https://nawabichaihouse.com/api/whatsapp';

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Content-Type': 'application/json',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');

  // Razorpay callback (GET redirect after customer pays via payment link)
  if (context.request.method === 'GET' && action === 'razorpay-callback') {
    return handleRazorpayCallback(context, url, corsHeaders);
  }

  // Razorpay webhook (POST from Razorpay servers — signature verified inside handler)
  if (context.request.method === 'POST' && action === 'razorpay-webhook') {
    return handleRazorpayWebhook(context, corsHeaders);
  }

  // KDS webhook (POST from Odoo — auto-notify WABA customers on KDS stage changes)
  if (context.request.method === 'POST' && action === 'kds-webhook') {
    return handleKdsWebhook(context, url, corsHeaders);
  }

  // Dashboard API (GET/POST with action param) — requires X-API-Key auth
  if (action) {
    const apiKey = context.request.headers.get('X-API-Key');
    const expectedKey = context.env.DASHBOARD_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    return handleDashboardAPI(context, action, url, corsHeaders);
  }

  // WhatsApp webhook verification (GET)
  if (context.request.method === 'GET') {
    return handleWebhookVerify(context, url);
  }

  // WhatsApp incoming messages (POST)
  if (context.request.method === 'POST') {
    try {
      const body = await context.request.json();
      const incomingPhoneId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

      // Forward NCH messages to NCH endpoint (shared WABA webhook)
      if (incomingPhoneId === NCH_PHONE_ID) {
        fetch(NCH_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(e => console.error('NCH forward error:', e.message));
        return new Response('OK', { status: 200 });
      }

      await processWebhook(context, body);
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Webhook error:', error.message);
      return new Response('OK', { status: 200 }); // Always 200 to prevent retries
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK VERIFICATION
// ═══════════════════════════════════════════════════════════════════

function handleWebhookVerify(context, url) {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === context.env.WA_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK PROCESSING
// ═══════════════════════════════════════════════════════════════════

async function processWebhook(context, body) {
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  if (!value) return;

  const phoneId = context.env.WA_PHONE_ID;
  const token = context.env.WA_ACCESS_TOKEN;
  const db = context.env.DB;

  // Route only messages for HE phone number
  if (value.metadata?.phone_number_id && value.metadata.phone_number_id !== phoneId) {
    return; // Not for us — skip (shared webhook with NCH)
  }

  // Handle payment status webhooks (native WhatsApp payments via Razorpay)
  if (value?.statuses?.length) {
    for (const status of value.statuses) {
      if (status.type === 'payment') {
        await handlePaymentStatus(context, status, phoneId, token, db);
      }
    }
  }

  // Handle customer messages
  if (!value?.messages?.length) return;

  const message = value.messages[0];
  const waId = message.from;

  // Mark as read
  await sendWhatsApp(phoneId, token, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: message.id,
  });

  // Load or create session
  let session = await db.prepare('SELECT * FROM wa_sessions WHERE wa_id = ?').bind(waId).first();
  if (!session) {
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO wa_sessions (wa_id, state, cart, cart_total, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(waId, 'idle', '[]', 0, now).run();
    session = { wa_id: waId, state: 'idle', cart: '[]', cart_total: 0, updated_at: now };
  }

  // Check session expiry
  const lastUpdate = new Date(session.updated_at).getTime();
  if (Date.now() - lastUpdate > SESSION_TIMEOUT_MS && session.state !== 'idle') {
    const hadCart = session.cart && session.cart !== '[]';
    session.state = 'idle';
    session.cart = '[]';
    session.cart_total = 0;
    await updateSession(db, waId, 'idle', '[]', 0);
    if (hadCart) {
      await sendWhatsApp(phoneId, token, buildText(waId,
        'Your previous session expired. No worries — let\'s start fresh!\n\nSend *"menu"* to see our full menu.'));
    }
  }

  // Load or create user
  let user = await db.prepare('SELECT * FROM wa_users WHERE wa_id = ?').bind(waId).first();
  if (!user) {
    const now = new Date().toISOString();
    const name = value.contacts?.[0]?.profile?.name || '';
    await db.prepare('INSERT INTO wa_users (wa_id, name, phone, created_at, last_active_at) VALUES (?, ?, ?, ?, ?)')
      .bind(waId, name, waId, now, now).run();
    user = { wa_id: waId, name, phone: waId, total_orders: 0, total_spent: 0, last_order_id: null };
  } else {
    await db.prepare('UPDATE wa_users SET last_active_at = ? WHERE wa_id = ?')
      .bind(new Date().toISOString(), waId).run();
  }

  const msgType = getMessageType(message);
  await routeState(context, session, user, msgType, waId, phoneId, token, db);
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE TYPE EXTRACTION
// ═══════════════════════════════════════════════════════════════════

function getMessageType(message) {
  if (message.type === 'text') {
    return { type: 'text', text: message.text.body.trim().toLowerCase() };
  }
  if (message.type === 'interactive') {
    if (message.interactive.type === 'button_reply') {
      return { type: 'button_reply', id: message.interactive.button_reply.id, title: message.interactive.button_reply.title };
    }
    if (message.interactive.type === 'list_reply') {
      return { type: 'list_reply', id: message.interactive.list_reply.id, title: message.interactive.list_reply.title };
    }
    if (message.interactive.type === 'nfm_reply') {
      return { type: 'nfm_reply', data: message.interactive.nfm_reply };
    }
  }
  if (message.type === 'order') {
    return {
      type: 'order',
      items: (message.order?.product_items || []).map(item => ({
        retailer_id: item.product_retailer_id,
        qty: item.quantity,
        price: item.item_price ? Number(item.item_price) / 1000 : 0,
        currency: item.currency,
      })),
    };
  }
  if (message.type === 'button') {
    return { type: 'text', text: message.button.text.trim().toLowerCase() };
  }
  return { type: message.type || 'unknown' };
}

// ═══════════════════════════════════════════════════════════════════
// STATE MACHINE ROUTER
// ═══════════════════════════════════════════════════════════════════

async function routeState(context, session, user, msg, waId, phoneId, token, db) {
  // Order messages from native cart are handled immediately regardless of state
  if (msg.type === 'order') {
    return handleOrderMessage(context, session, user, msg, waId, phoneId, token, db);
  }

  // Global commands (work in any state)
  if (msg.type === 'text') {
    const text = msg.text;

    // Station QR keywords — show filtered menu for that station
    const station = STATION_KEYWORDS[text];
    if (station) {
      return handleShowStationMenu(context, user, station, waId, phoneId, token, db);
    }

    if (['menu', '/menu', 'order', '/order', 'hi', 'hello', 'start'].includes(text)) {
      return handleShowMenu(context, user, waId, phoneId, token, db);
    }
    if (['track', '/track', 'status'].includes(text)) {
      return handleTrackOrder(context, user, waId, phoneId, token, db);
    }
    if (['help', '/help'].includes(text)) {
      return handleHelp(waId, phoneId, token);
    }
    if (text === 'cancel' && session.state === 'awaiting_upi_payment') {
      return handleCancelOrder(context, session, user, waId, phoneId, token, db);
    }
  }

  // Ice breaker button taps
  if (msg.type === 'button_reply') {
    if (msg.id === 'order_food' || msg.id === 'view_menu') {
      return handleShowMenu(context, user, waId, phoneId, token, db);
    }
    if (msg.id === 'track_order') {
      return handleTrackOrder(context, user, waId, phoneId, token, db);
    }
    if (msg.id === 'talk_to_staff') {
      return handleHelp(waId, phoneId, token);
    }
  }

  // State-specific routing
  switch (session.state) {
    case 'idle':
      return handleIdle(context, session, user, msg, waId, phoneId, token, db);

    case 'awaiting_name':
      return handleNameEntry(context, session, user, msg, waId, phoneId, token, db);

    case 'awaiting_menu':
      return handleMenuState(context, session, user, msg, waId, phoneId, token, db);

    case 'awaiting_payment':
      return handlePaymentSelection(context, session, user, msg, waId, phoneId, token, db);

    case 'awaiting_upi_payment':
      return handleAwaitingUpiPayment(context, session, user, msg, waId, phoneId, token, db);

    default:
      return handleShowMenu(context, user, waId, phoneId, token, db);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STATE HANDLERS
// ═══════════════════════════════════════════════════════════════════

async function handleIdle(context, session, user, msg, waId, phoneId, token, db) {
  // If user has a name, go straight to menu
  if (user.name) {
    return handleShowMenu(context, user, waId, phoneId, token, db);
  }
  // Ask for name
  await sendWhatsApp(phoneId, token, buildText(waId,
    'Welcome to *Hamza Express*! Biryani & More Since 1918.\n\nWhat\'s your name?'));
  await updateSession(db, waId, 'awaiting_name', '[]', 0);
}

async function handleNameEntry(context, session, user, msg, waId, phoneId, token, db) {
  if (msg.type !== 'text' || msg.text.length < 2) {
    await sendWhatsApp(phoneId, token, buildText(waId, 'Please enter your name (at least 2 characters):'));
    return;
  }

  // Capitalize first letter of each word
  const name = msg.text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  await db.prepare('UPDATE wa_users SET name = ? WHERE wa_id = ?').bind(name, waId).run();
  user.name = name;

  await sendWhatsApp(phoneId, token, buildText(waId,
    `Great, *${name}*! Let's get you some amazing food.`));
  return handleShowMenu(context, user, waId, phoneId, token, db);
}

async function handleShowMenu(context, user, waId, phoneId, token, db) {
  // Send multi-product message with all 9 categories
  const sections = Object.values(PRODUCT_SETS).map(set => ({
    title: set.name,
    product_items: getProductsForSet(set.id).map(p => ({
      product_retailer_id: p.retailerId,
    })),
  }));

  const mpm = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: { type: 'text', text: 'Hamza Express Menu' },
      body: { text: user.name ? `Hi ${user.name}! Browse our menu, add items to cart, and tap Send when ready.` : 'Browse our menu, add items to cart, and tap Send when ready.' },
      footer: { text: 'All prices inclusive of GST' },
      action: {
        catalog_id: CATALOG_ID,
        sections,
      },
    },
  };

  await sendWhatsApp(phoneId, token, mpm);
  await updateSession(db, waId, 'awaiting_menu', '[]', 0);
}

async function handleShowStationMenu(context, user, station, waId, phoneId, token, db) {
  // If station has null sets, show full menu
  if (!station.sets) {
    return handleShowMenu(context, user, waId, phoneId, token, db);
  }

  // Build filtered sections for this station only
  const sections = station.sets.map(setKey => {
    const set = PRODUCT_SETS[setKey];
    if (!set) return null;
    return {
      title: set.name,
      product_items: getProductsForSet(set.id).map(p => ({
        product_retailer_id: p.retailerId,
      })),
    };
  }).filter(Boolean);

  if (sections.length === 0) {
    return handleShowMenu(context, user, waId, phoneId, token, db);
  }

  // For single-section stations, WhatsApp MPM needs at least 1 section
  const mpm = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: { type: 'text', text: `${station.label} Menu` },
      body: { text: user.name
        ? `Hi ${user.name}! Here's our ${station.label} menu. Add items to cart and tap Send.`
        : `Here's our ${station.label} menu. Add items to cart and tap Send.` },
      footer: { text: `Collect from: ${station.collection}` },
      action: {
        catalog_id: CATALOG_ID,
        sections,
      },
    },
  };

  await sendWhatsApp(phoneId, token, mpm);
  await updateSession(db, waId, 'awaiting_menu', '[]', 0);
}

function getProductsForSet(setId) {
  // Map product set IDs to retailer IDs
  // Grouped by WhatsApp catalog product sets (sections in MPM)
  const setMap = {
    [PRODUCT_SETS.indian.id]: [
      // Chicken Gravy
      'HE-1146','HE-1147','HE-1148','HE-1149','HE-1150','HE-1151','HE-1152','HE-1153',
      'HE-1154','HE-1155','HE-1156','HE-1157','HE-1158','HE-1159','HE-1160','HE-1161','HE-1162',
      // Mutton Gravy
      'HE-1177','HE-1178','HE-1179','HE-1180','HE-1181','HE-1182','HE-1183','HE-1184',
      'HE-1185','HE-1186','HE-1187','HE-1188','HE-1189','HE-1190',
      // Breakfast Special
      'HE-1196','HE-1197','HE-1198','HE-1199',
      // Indian Veg
      'HE-1225','HE-1226','HE-1227','HE-1228','HE-1229','HE-1230','HE-1231','HE-1232','HE-1233','HE-1234',
    ],
    [PRODUCT_SETS.biryani.id]: [
      // Biryani
      'HE-1200','HE-1201','HE-1202','HE-1203','HE-1204',
      // Rice Items
      'HE-1205','HE-1206','HE-1207',
    ],
    [PRODUCT_SETS.chinese.id]: [
      // Chinese Chicken
      'HE-1163','HE-1164','HE-1165','HE-1166','HE-1167','HE-1168','HE-1169','HE-1170',
      'HE-1171','HE-1172','HE-1173','HE-1174','HE-1175','HE-1176',
      // Mutton Dry
      'HE-1191','HE-1192','HE-1193','HE-1194','HE-1195',
      // Fish & Seafood
      'HE-1253','HE-1254','HE-1255','HE-1256','HE-1257','HE-1258','HE-1259',
      // Fried Rice & Noodles
      'HE-1235','HE-1236','HE-1237','HE-1238','HE-1239','HE-1240',
      'HE-1241','HE-1242','HE-1243','HE-1244','HE-1245','HE-1246','HE-1247','HE-1248',
    ],
    [PRODUCT_SETS.tandoor.id]: [
      // Tandoori Dishes
      'HE-1134','HE-1135','HE-1136','HE-1137','HE-1138','HE-1139','HE-1140','HE-1141',
      'HE-1142','HE-1143','HE-1144','HE-1145',
      // Roti & Parathas
      'HE-1212','HE-1213','HE-1214','HE-1215','HE-1216','HE-1217','HE-1218',
      'HE-1219','HE-1220','HE-1221','HE-1222','HE-1223','HE-1224',
      // Rolls
      'HE-1208','HE-1209','HE-1210','HE-1211',
    ],
    [PRODUCT_SETS.fc.id]: [], // FC category not populated yet — will add when menu expands
    [PRODUCT_SETS.juices.id]: [], // Juices not on current menu card — will add when available
    [PRODUCT_SETS.bm.id]: [
      // Salad & Raitha (under Bane Marie parent)
      'HE-1249','HE-1250','HE-1251','HE-1252',
    ],
    [PRODUCT_SETS.shawarma.id]: [], // Shawarma not on current menu card
    [PRODUCT_SETS.grill.id]: [], // Grill not on current menu card
  };
  return (setMap[setId] || []).map(rid => ({ retailerId: rid }));
}

async function handleMenuState(context, session, user, msg, waId, phoneId, token, db) {
  // Waiting for order submission from native cart
  // Any text that's not a command shows helpful message
  await sendWhatsApp(phoneId, token, buildText(waId,
    'Tap on the menu above to browse items, add them to your cart, then tap *Send* to place your order.\n\nOr send *"menu"* to see the menu again.'));
}

// ═══════════════════════════════════════════════════════════════════
// ORDER HANDLING (from WhatsApp native cart)
// ═══════════════════════════════════════════════════════════════════

async function handleOrderMessage(context, session, user, msg, waId, phoneId, token, db) {
  const orderItems = msg.items;
  if (!orderItems || orderItems.length === 0) {
    await sendWhatsApp(phoneId, token, buildText(waId,
      'We couldn\'t read your order. Please try again from the menu.'));
    return handleShowMenu(context, user, waId, phoneId, token, db);
  }

  // If user doesn't have a name, ask first and save cart
  if (!user.name) {
    const cart = buildCartFromItems(orderItems);
    await updateSession(db, waId, 'awaiting_name', JSON.stringify(cart.items), cart.total);
    await sendWhatsApp(phoneId, token, buildText(waId,
      'Before we confirm your order, what\'s your name?'));
    return;
  }

  const cart = buildCartFromItems(orderItems);
  if (cart.items.length === 0) {
    await sendWhatsApp(phoneId, token, buildText(waId,
      'Sorry, we couldn\'t process those items. Please try ordering again.'));
    return;
  }

  // Determine collection point
  const collectionPoint = determineCollectionPoint(cart.items);

  // Save cart and move to payment
  await updateSession(db, waId, 'awaiting_payment', JSON.stringify(cart.items), cart.total);

  // Build order summary
  const itemLines = cart.items.map(c => `${c.qty}x ${c.name} — Rs.${c.price * c.qty}`).join('\n');
  const gstAmount = Math.round(cart.total * 5 / 105 * 100) / 100; // Extract GST from inclusive price

  const body = `*Your Order:*\n${itemLines}\n\n` +
    `*Total: Rs.${cart.total}* (incl. GST)\n` +
    `*Collect from:* ${collectionPoint}\n\n` +
    `Tap *Pay Now* to pay via UPI and confirm your order.`;

  const buttons = [
    { type: 'reply', reply: { id: 'pay_upi', title: 'Pay Now (UPI)' } },
    { type: 'reply', reply: { id: 'pay_cancel', title: 'Cancel' } },
  ];

  await sendWhatsApp(phoneId, token, buildReplyButtons(waId, body, buttons));
}

function buildCartFromItems(orderItems) {
  const items = [];
  let total = 0;
  for (const item of orderItems) {
    const product = PRODUCTS[item.retailer_id];
    if (!product) continue;
    const qty = item.qty;
    // Use our canonical price (not catalog price from message)
    const priceInclGst = Math.round(product.price * 1.05 * 100) / 100;
    items.push({
      code: item.retailer_id,
      name: product.name,
      price: priceInclGst,
      priceExclGst: product.price,
      qty,
      odooId: product.odooId,
      catId: product.catId,
    });
    total += priceInclGst * qty;
  }
  total = Math.round(total * 100) / 100;
  return { items, total };
}

function determineCollectionPoint(cartItems) {
  const categories = new Set(cartItems.map(item => item.catId));
  const hasKitchenItems = [...categories].some(c => KITCHEN_CATS.has(c));
  const counterCats = [...categories].filter(c => !KITCHEN_CATS.has(c));

  // If ANY kitchen items → collect at Kitchen Pass (they consolidate everything)
  if (hasKitchenItems) return 'Kitchen Pass';

  // If ALL items from single counter → that counter
  if (counterCats.length === 1) {
    return COUNTER_CATS[counterCats[0]] || 'Kitchen Pass';
  }

  // Multiple counter categories → Kitchen Pass (consolidation point)
  if (counterCats.length > 1) return 'Kitchen Pass';

  return 'Kitchen Pass';
}

// ═══════════════════════════════════════════════════════════════════
// PAYMENT FLOW
// ═══════════════════════════════════════════════════════════════════

async function handlePaymentSelection(context, session, user, msg, waId, phoneId, token, db) {
  // Cancel
  if ((msg.type === 'button_reply' && msg.id === 'pay_cancel') ||
      (msg.type === 'text' && msg.text === 'cancel')) {
    await updateSession(db, waId, 'idle', '[]', 0);
    await sendWhatsApp(phoneId, token, buildText(waId,
      'Order cancelled. Send *"menu"* whenever you\'re ready to order again.'));
    return;
  }

  // Pay UPI
  if (msg.type === 'button_reply' && msg.id === 'pay_upi') {
    return initiateUpiPayment(context, session, user, waId, phoneId, token, db);
  }

  // Unrecognized — re-show payment options
  const cart = JSON.parse(session.cart || '[]');
  if (cart.length === 0) {
    return handleShowMenu(context, user, waId, phoneId, token, db);
  }

  const buttons = [
    { type: 'reply', reply: { id: 'pay_upi', title: 'Pay Now (UPI)' } },
    { type: 'reply', reply: { id: 'pay_cancel', title: 'Cancel' } },
  ];
  await sendWhatsApp(phoneId, token, buildReplyButtons(waId,
    'Please tap *Pay Now* to pay via UPI, or *Cancel* to start over.', buttons));
}

async function initiateUpiPayment(context, session, user, waId, phoneId, token, db) {
  const cart = JSON.parse(session.cart || '[]');
  if (cart.length === 0) {
    return handleShowMenu(context, user, waId, phoneId, token, db);
  }

  // Pre-check: ensure POS session is open BEFORE accepting payment
  const apiKey = context.env.ODOO_API_KEY;
  if (apiKey) {
    const sessionRes = await odooRPC(apiKey, 'pos.session', 'search_read',
      [[['config_id', '=', POS_CONFIG_ID], ['state', '=', 'opened']]],
      { fields: ['id'], limit: 1 });
    if (!sessionRes || sessionRes.length === 0) {
      await sendWhatsApp(phoneId, token, buildText(waId,
        'Sorry, Hamza Express WhatsApp ordering is currently unavailable. ' +
        'Please visit us in person or try again later.\n\nSend *"menu"* to try again.'));
      await updateSession(db, waId, 'idle', '[]', 0);
      return;
    }
  }

  const total = cart.reduce((sum, c) => sum + (c.price * c.qty), 0);
  const collectionPoint = determineCollectionPoint(cart);
  const now = new Date().toISOString();

  // Generate order code: HE-DDMM-NNNN
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const dd = String(istNow.getUTCDate()).padStart(2, '0');
  const mm = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  const datePrefix = `${dd}${mm}`;
  const countResult = await db.prepare("SELECT COUNT(*) as cnt FROM wa_orders WHERE order_code LIKE ?")
    .bind(`HE-${datePrefix}-%`).first();
  const todayCount = (countResult?.cnt || 0) + 1;
  const orderCode = `HE-${datePrefix}-${String(todayCount).padStart(4, '0')}`;

  // Create order in DB with payment_pending status
  const result = await db.prepare(
    `INSERT INTO wa_orders (order_code, wa_id, items, subtotal, total, payment_method, payment_status,
     collection_point, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    orderCode, waId, JSON.stringify(cart), total, total, 'upi', 'pending',
    collectionPoint, 'payment_pending', now, now
  ).run();
  const orderId = result.meta?.last_row_id;

  // Try native WhatsApp payment (order_details with Razorpay gateway)
  const orderDetailsMsg = buildOrderDetailsPayment(waId, orderCode, cart, total);
  const payResponse = await sendWhatsApp(phoneId, token, orderDetailsMsg);

  if (!payResponse || !payResponse.ok) {
    console.error('order_details failed, falling back to Razorpay payment link');

    // Fallback: create Razorpay Payment Link
    const paymentLink = await createRazorpayPaymentLink(context, {
      amount: total,
      orderCode,
      orderId,
      customerName: user.name || 'Customer',
      customerPhone: waId.startsWith('91') ? '+' + waId : waId,
    });

    if (paymentLink) {
      await db.prepare('UPDATE wa_orders SET razorpay_link_id = ?, razorpay_link_url = ? WHERE id = ?')
        .bind(paymentLink.id, paymentLink.short_url, orderId).run();

      const itemLines = cart.map(c => `${c.qty}x ${c.name} — Rs.${c.price * c.qty}`).join('\n');
      const payMsg = `*Order ${orderCode}*\n\n${itemLines}\n\n` +
        `*Pay Rs.${total} via UPI*\n\n` +
        `Tap to pay: ${paymentLink.short_url}\n\n` +
        `_Link expires in 20 minutes_\n` +
        `_Reply "cancel" to cancel the order_`;
      await sendWhatsApp(phoneId, token, buildText(waId, payMsg));
    } else {
      // Both payment methods failed — inform customer
      await db.prepare('UPDATE wa_orders SET status = ?, updated_at = ? WHERE id = ?')
        .bind('failed', new Date().toISOString(), orderId).run();
      await sendWhatsApp(phoneId, token, buildText(waId,
        'Sorry, we couldn\'t set up payment right now. Please try again in a few minutes or visit our counter directly.\n\nSend *"menu"* to try again.'));
      await updateSession(db, waId, 'idle', '[]', 0);
      return;
    }
  }

  await updateSession(db, waId, 'awaiting_upi_payment', '[]', 0);
}

async function handleAwaitingUpiPayment(context, session, user, msg, waId, phoneId, token, db) {
  // Cancel
  if (msg.type === 'text' && msg.text === 'cancel') {
    return handleCancelOrder(context, session, user, waId, phoneId, token, db);
  }

  // Any other message while waiting for payment
  await sendWhatsApp(phoneId, token, buildText(waId,
    'We\'re waiting for your payment. Please complete the UPI payment above.\n\n' +
    'Reply *"cancel"* to cancel the order.'));
}

async function handleCancelOrder(context, session, user, waId, phoneId, token, db) {
  // Find the most recent pending order for this user
  const order = await db.prepare(
    'SELECT * FROM wa_orders WHERE wa_id = ? AND payment_status = ? ORDER BY id DESC LIMIT 1'
  ).bind(waId, 'pending').first();

  if (order) {
    await db.prepare('UPDATE wa_orders SET status = ?, payment_status = ?, updated_at = ? WHERE id = ?')
      .bind('cancelled', 'cancelled', new Date().toISOString(), order.id).run();
  }

  await updateSession(db, waId, 'idle', '[]', 0);
  await sendWhatsApp(phoneId, token, buildText(waId,
    'Order cancelled. Send *"menu"* whenever you\'re ready to order again.'));
}

// ═══════════════════════════════════════════════════════════════════
// NATIVE WHATSAPP PAYMENT STATUS (from order_details card)
// ═══════════════════════════════════════════════════════════════════

async function handlePaymentStatus(context, status, phoneId, token, db) {
  const paymentStatus = status.status;   // "captured", "pending", "failed"
  const referenceId = status.payment?.reference_id; // Our order code
  const txnId = status.payment?.transaction?.id;
  const txnStatus = status.payment?.transaction?.status; // "success", "failed", "pending"
  const errorInfo = status.payment?.transaction?.error;

  console.log(`Payment webhook: status=${paymentStatus}, txn=${txnStatus}, ref=${referenceId}`);

  if (!referenceId) {
    console.error('Payment status webhook missing reference_id');
    return;
  }

  const order = await db.prepare('SELECT * FROM wa_orders WHERE order_code = ?').bind(referenceId).first();
  if (!order) {
    console.error('Payment webhook: order not found for:', referenceId);
    return;
  }

  // PAYMENT CAPTURED (Success)
  if (paymentStatus === 'captured' && txnStatus === 'success') {
    if (order.payment_status === 'paid') return; // Idempotent
    await confirmOrder(context, order, txnId, phoneId, token, db);
    return;
  }

  // PAYMENT FAILED
  if ((paymentStatus === 'pending' && txnStatus === 'failed') || paymentStatus === 'failed') {
    if (order.payment_status !== 'pending') return;
    const reason = errorInfo?.reason || 'unknown';
    const friendlyReason = getPaymentErrorMessage(reason);

    let failMsg = `Payment failed for order ${order.order_code}\n\n` +
      `Reason: ${friendlyReason}\n\n`;

    if (paymentStatus === 'pending') {
      failMsg += 'You can tap *"Review and Pay"* again to retry.\n\n';
    }
    failMsg += '_Reply "cancel" to cancel the order_';

    await sendWhatsApp(phoneId, token, buildText(order.wa_id, failMsg));
    return;
  }

  // PAYMENT PENDING — no action, wait for final status
}

// ═══════════════════════════════════════════════════════════════════
// RAZORPAY WEBHOOK (payment_link.paid)
// ═══════════════════════════════════════════════════════════════════

async function handleRazorpayWebhook(context, corsHeaders) {
  try {
    const db = context.env.DB;
    const phoneId = context.env.WA_PHONE_ID;
    const token = context.env.WA_ACCESS_TOKEN;

    // Verify Razorpay webhook signature (HMAC-SHA256)
    const rawBody = await context.request.text();
    const signature = context.request.headers.get('X-Razorpay-Signature');
    const webhookSecret = context.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
      const expectedSig = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (expectedSig !== signature) {
        console.error('Razorpay webhook signature mismatch');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: corsHeaders });
      }
    } else if (webhookSecret) {
      console.error('Razorpay webhook missing X-Razorpay-Signature header');
      return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 401, headers: corsHeaders });
    }

    const body = JSON.parse(rawBody);
    const event = body.event;
    console.log('Razorpay webhook:', event);

    if (event === 'payment_link.paid') {
      const paymentLink = body.payload?.payment_link?.entity;
      const payment = body.payload?.payment?.entity;
      if (!paymentLink) {
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      const razorpayLinkId = paymentLink.id;
      const razorpayPaymentId = payment?.id || null;
      const orderId = paymentLink.notes?.order_id;

      let order = await db.prepare('SELECT * FROM wa_orders WHERE razorpay_link_id = ?').bind(razorpayLinkId).first();
      if (!order && orderId) {
        order = await db.prepare('SELECT * FROM wa_orders WHERE id = ?').bind(parseInt(orderId)).first();
      }

      if (!order || order.payment_status === 'paid') {
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      await confirmOrder(context, order, razorpayPaymentId, phoneId, token, db);
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (error) {
    console.error('Razorpay webhook error:', error.message);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  }
}

// ═══════════════════════════════════════════════════════════════════
// RAZORPAY CALLBACK (GET redirect after payment link)
// ═══════════════════════════════════════════════════════════════════

async function handleRazorpayCallback(context, url, corsHeaders) {
  try {
    const db = context.env.DB;
    const phoneId = context.env.WA_PHONE_ID;
    const token = context.env.WA_ACCESS_TOKEN;

    const razorpayPaymentId = url.searchParams.get('razorpay_payment_id');
    const razorpayLinkId = url.searchParams.get('razorpay_payment_link_id');
    const razorpayStatus = url.searchParams.get('razorpay_payment_link_status');

    if (razorpayStatus !== 'paid' || !razorpayLinkId) {
      return new Response(thankYouPage('Payment status unclear. Please check WhatsApp for updates.'),
        { status: 200, headers: { 'Content-Type': 'text/html' } });
    }

    const order = await db.prepare('SELECT * FROM wa_orders WHERE razorpay_link_id = ?').bind(razorpayLinkId).first();
    if (!order) {
      return new Response(thankYouPage('Order not found. Please check WhatsApp.'),
        { status: 200, headers: { 'Content-Type': 'text/html' } });
    }

    if (order.payment_status !== 'paid') {
      // Server-side verification: confirm payment status with Razorpay API
      const keyId = context.env.RAZORPAY_KEY_ID;
      const keySecret = context.env.RAZORPAY_KEY_SECRET;
      let paymentVerified = false;
      if (keyId && keySecret && razorpayLinkId) {
        try {
          const linkRes = await fetch(`https://api.razorpay.com/v1/payment_links/${razorpayLinkId}`, {
            headers: { 'Authorization': 'Basic ' + btoa(`${keyId}:${keySecret}`) },
          });
          if (linkRes.ok) {
            const linkData = await linkRes.json();
            paymentVerified = linkData.status === 'paid';
          }
        } catch (e) {
          console.error('Razorpay verification error:', e.message);
        }
      }

      if (!paymentVerified) {
        // Don't confirm order if we can't verify — webhook will handle it
        return new Response(
          thankYouPage('Payment is being verified. You will receive a WhatsApp confirmation shortly.'),
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }

      await confirmOrder(context, order, razorpayPaymentId, phoneId, token, db);
    }

    return new Response(
      thankYouPage(`Payment received! Order ${order.order_code} confirmed. Check WhatsApp for updates.`),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('Razorpay callback error:', error.message);
    return new Response(thankYouPage('Something went wrong. Please check WhatsApp.'),
      { status: 200, headers: { 'Content-Type': 'text/html' } });
  }
}

function thankYouPage(message) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Hamza Express</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#FAF3E3;color:#4A2315}
.card{text-align:center;padding:2rem;max-width:400px;background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
h1{color:#713520;font-size:1.3rem}</style></head>
<body><div class="card"><h1>Hamza Express</h1><p>${message}</p><p>You can close this page.</p></div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════
// KDS → WHATSAPP AUTO-NOTIFICATION (Odoo webhook receiver)
// ═══════════════════════════════════════════════════════════════════

// Stage IDs that trigger "preparing" WhatsApp notification
const PREPARING_STAGES = new Set([
  44,   // KDS 15 Kitchen Pass → Ready (all station items done, KP collecting)
  62,   // KDS 16 Juice → Preparing
  64,   // KDS 17 Bane Marie → Preparing
  65,   // KDS 18 Shawarma → Preparing
  66,   // KDS 19 Grill → Preparing
]);

// Stage IDs that trigger "ready" WhatsApp notification
const READY_STAGES = new Set([
  76,   // KDS 21 Kitchen Pass TV → InProgress (packed, ready for pickup)
  47,   // KDS 16 Juice → Ready
  50,   // KDS 17 Bane Marie → Ready
  53,   // KDS 18 Shawarma → Ready
  56,   // KDS 19 Grill → Ready
]);

async function handleKdsWebhook(context, url, corsHeaders) {
  try {
    // Verify shared secret
    const secret = url.searchParams.get('secret');
    const expectedSecret = context.env.KDS_WEBHOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const body = await context.request.json();
    const { stage_id, todo, prep_line_id } = body;

    // Quick filter: only react to todo=True on stages we care about
    if (todo !== true) {
      return new Response(JSON.stringify({ ok: true, skipped: 'todo not true' }), { headers: corsHeaders });
    }

    const isPreparing = PREPARING_STAGES.has(stage_id);
    const isReady = READY_STAGES.has(stage_id);
    if (!isPreparing && !isReady) {
      return new Response(JSON.stringify({ ok: true, skipped: 'irrelevant stage' }), { headers: corsHeaders });
    }

    const notificationType = isReady ? 'ready' : 'preparing';

    // Resolve: prep_line_id → pos.prep.order → pos.order → config_id
    const apiKey = context.env.ODOO_API_KEY;
    if (!apiKey || !prep_line_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no api key or prep_line_id' }), { headers: corsHeaders });
    }

    // Step 1: Get prep_order_id from pos.prep.line
    const prepLine = await odooRPC(apiKey, 'pos.prep.line', 'search_read',
      [[['id', '=', prep_line_id]]], { fields: ['prep_order_id'], limit: 1 });
    if (!prepLine || !prepLine[0]?.prep_order_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'prep line not found' }), { headers: corsHeaders });
    }
    const prepOrderId = prepLine[0].prep_order_id[0];

    // Step 2: Get pos_order_id from pos.prep.order
    const prepOrder = await odooRPC(apiKey, 'pos.prep.order', 'search_read',
      [[['id', '=', prepOrderId]]], { fields: ['pos_order_id'], limit: 1 });
    if (!prepOrder || !prepOrder[0]?.pos_order_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'prep order not found' }), { headers: corsHeaders });
    }
    const posOrderId = prepOrder[0].pos_order_id[0];

    // Step 3: Get config_id from pos.order — filter to WABA only
    const posOrder = await odooRPC(apiKey, 'pos.order', 'search_read',
      [[['id', '=', posOrderId]]], { fields: ['config_id', 'tracking_number'], limit: 1 });
    if (!posOrder || !posOrder[0]) {
      return new Response(JSON.stringify({ ok: true, skipped: 'pos order not found' }), { headers: corsHeaders });
    }
    const configId = posOrder[0].config_id[0];
    if (configId !== POS_CONFIG_ID) {
      // Not a WABA order — ignore silently
      return new Response(JSON.stringify({ ok: true, skipped: 'not WABA order' }), { headers: corsHeaders });
    }

    const trackingNumber = posOrder[0].tracking_number || null;

    // Step 4: Find the wa_order by Odoo order ID
    const db = context.env.DB;
    const waOrder = await db.prepare('SELECT * FROM wa_orders WHERE odoo_order_id = ? AND payment_status = ?')
      .bind(posOrderId, 'paid').first();
    if (!waOrder) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no matching wa_order' }), { headers: corsHeaders });
    }

    // Step 5: Duplicate prevention — only send if status transition is valid
    const currentStatus = waOrder.status;
    if (notificationType === 'preparing' && currentStatus !== 'confirmed') {
      return new Response(JSON.stringify({ ok: true, skipped: 'already past confirmed' }), { headers: corsHeaders });
    }
    if (notificationType === 'ready' && currentStatus !== 'confirmed' && currentStatus !== 'preparing') {
      return new Response(JSON.stringify({ ok: true, skipped: 'already ready or beyond' }), { headers: corsHeaders });
    }

    // Step 6: Update status and send WhatsApp notification
    const now = new Date().toISOString();
    await db.prepare('UPDATE wa_orders SET status = ?, tracking_number = ?, updated_at = ? WHERE id = ?')
      .bind(notificationType, trackingNumber, now, waOrder.id).run();

    const phoneId = context.env.WA_PHONE_ID;
    const token = context.env.WA_ACCESS_TOKEN;

    if (notificationType === 'preparing') {
      await sendWhatsApp(phoneId, token, buildText(waOrder.wa_id,
        `Your order *${waOrder.order_code}* is now being prepared!\n\n` +
        `*Collect from:* ${waOrder.collection_point || 'Kitchen Pass'}\n` +
        `We'll notify you when it's ready.`));
    } else if (notificationType === 'ready') {
      await sendWhatsApp(phoneId, token, buildText(waOrder.wa_id,
        `Your order *${waOrder.order_code}* is *READY* for pickup!\n\n` +
        `*Collect from:* ${waOrder.collection_point || 'Kitchen Pass'}\n` +
        (trackingNumber ? `*Show token:* ${trackingNumber}\n\n` : '\n') +
        `Please collect it now. Thank you for ordering with Hamza Express!`));
    }

    console.log(`KDS→WA: ${notificationType} notification sent for ${waOrder.order_code} (Odoo #${posOrderId})`);
    return new Response(JSON.stringify({ ok: true, sent: notificationType, order: waOrder.order_code }), { headers: corsHeaders });

  } catch (error) {
    console.error('KDS webhook error:', error.message);
    return new Response(JSON.stringify({ ok: true, error: 'internal' }), { headers: corsHeaders });
  }
}

// ═══════════════════════════════════════════════════════════════════
// ORDER CONFIRMATION (shared by all payment paths)
// ═══════════════════════════════════════════════════════════════════

async function confirmOrder(context, order, razorpayPaymentId, phoneId, token, db) {
  const now = new Date().toISOString();

  // Update order status
  await db.prepare(
    'UPDATE wa_orders SET payment_status = ?, razorpay_payment_id = ?, status = ?, updated_at = ? WHERE id = ?'
  ).bind('paid', razorpayPaymentId || null, 'confirmed', now, order.id).run();

  // Update user stats
  await db.prepare(
    'UPDATE wa_users SET last_order_id = ?, total_orders = total_orders + 1, total_spent = total_spent + ? WHERE wa_id = ?'
  ).bind(order.id, order.total, order.wa_id).run();

  // Create Odoo POS order → triggers KDS routing
  const cart = JSON.parse(order.items);
  const odooResult = await createOdooOrder(context, order.order_code, cart, order.total, order.wa_id);

  if (odooResult) {
    await db.prepare('UPDATE wa_orders SET odoo_order_id = ?, odoo_order_name = ?, tracking_number = ? WHERE id = ?')
      .bind(odooResult.id, odooResult.name, odooResult.trackingNumber, order.id).run();
  }

  // Send confirmation to customer
  const itemLines = cart.map(c => `${c.qty}x ${c.name} — Rs.${c.price * c.qty}`).join('\n');
  const trackingNum = odooResult?.trackingNumber || order.order_code;

  let confirmMsg = `*Payment received! Order confirmed!*\n\n` +
    `*Order:* ${order.order_code}\n` +
    `*Token:* ${trackingNum}\n\n` +
    `${itemLines}\n\n` +
    `*Total: Rs.${order.total}* (UPI Paid)\n` +
    `*Collect from:* ${order.collection_point}\n\n` +
    `Your order is now being prepared. We'll notify you when it's ready!\n\n` +
    `_Show your token number at the counter_`;

  await sendWhatsApp(phoneId, token, buildText(order.wa_id, confirmMsg));
  await updateSession(db, order.wa_id, 'idle', '[]', 0);

  console.log(`Order confirmed: ${order.order_code}, Odoo: ${odooResult?.name || 'N/A'}`);
}

// ═══════════════════════════════════════════════════════════════════
// ORDER TRACKING
// ═══════════════════════════════════════════════════════════════════

async function handleTrackOrder(context, user, waId, phoneId, token, db) {
  const order = await db.prepare(
    'SELECT * FROM wa_orders WHERE wa_id = ? AND status NOT IN (?, ?) ORDER BY id DESC LIMIT 1'
  ).bind(waId, 'delivered', 'cancelled').first();

  if (!order) {
    await sendWhatsApp(phoneId, token, buildText(waId,
      'No active orders found. Send *"menu"* to place a new order.'));
    return;
  }

  const cart = JSON.parse(order.items);
  const itemLines = cart.map(c => `${c.qty}x ${c.name}`).join('\n');
  const statusEmoji = {
    payment_pending: 'Awaiting payment',
    confirmed: 'Order received',
    preparing: 'Being prepared',
    ready: 'Ready for pickup!',
  };

  const trackMsg = `*Order ${order.order_code}*\n` +
    (order.tracking_number ? `*Token:* ${order.tracking_number}\n\n` : '\n') +
    `${itemLines}\n\n` +
    `*Status:* ${statusEmoji[order.status] || order.status}\n` +
    `*Collect from:* ${order.collection_point || 'Kitchen Pass'}\n` +
    `*Total:* Rs.${order.total}`;

  await sendWhatsApp(phoneId, token, buildText(waId, trackMsg));
}

async function handleHelp(waId, phoneId, token) {
  await sendWhatsApp(phoneId, token, buildText(waId,
    '*Hamza Express*\n' +
    'Biryani & More Since 1918\n\n' +
    '*Commands:*\n' +
    'Send *"menu"* — Browse our full menu\n' +
    'Send *"track"* — Track your current order\n' +
    'Send *"cancel"* — Cancel a pending order\n\n' +
    '*Visit us:*\n' +
    '151-154, H.K.P. Road, Shivajinagar\n' +
    'Bangalore 560051\n\n' +
    '*Need help?* Call us at +91 80080 02045'));
}

// ═══════════════════════════════════════════════════════════════════
// ODOO POS ORDER CREATION
// ═══════════════════════════════════════════════════════════════════

async function createOdooOrder(context, orderCode, cart, total, waId) {
  const apiKey = context.env.ODOO_API_KEY;
  if (!apiKey) { console.error('ODOO_API_KEY not set'); return null; }

  try {
    // Find active POS session for WABA config
    const sessionRes = await odooRPC(apiKey, 'pos.session', 'search_read',
      [[['config_id', '=', POS_CONFIG_ID], ['state', '=', 'opened']]],
      { fields: ['id', 'name'], limit: 1 });

    if (!sessionRes || sessionRes.length === 0) {
      console.error('No active POS session for WABA (config 10)');
      return null;
    }
    const sessionId = sessionRes[0].id;

    // Build order lines (prices are GST-inclusive in cart, Odoo needs excl.)
    // Also build KDS preparation data (last_order_preparation_change) for each line
    const kdsLines = {};
    const lines = cart.map(item => {
      // Generate a UUID for this line (used by KDS prep system)
      const lineUuid = crypto.randomUUID();
      kdsLines[lineUuid] = {
        attribute_value_names: [],
        uuid: lineUuid,
        isCombo: false,
        product_id: item.odooId,
        name: item.name,
        basic_name: item.name,
        display_name: item.name,
        note: '[]',
        quantity: item.qty,
        customer_note: '',
      };
      return [0, 0, {
        product_id: item.odooId,
        qty: item.qty,
        price_unit: item.priceExclGst || Math.round(item.price / 1.05 * 100) / 100,
        price_subtotal: (item.priceExclGst || Math.round(item.price / 1.05 * 100) / 100) * item.qty,
        price_subtotal_incl: item.price * item.qty,
        discount: 0,
        tax_ids: [[6, 0, [GST_TAX_ID]]],
        full_product_name: item.name,
        uuid: lineUuid,
      }];
    });

    // Calculate tax amounts
    const totalExclGst = cart.reduce((sum, item) => {
      const priceExcl = item.priceExclGst || Math.round(item.price / 1.05 * 100) / 100;
      return sum + (priceExcl * item.qty);
    }, 0);
    const taxAmount = Math.round((total - totalExclGst) * 100) / 100;

    // Internal note for staff reference
    const customerPhone = waId.startsWith('91') ? '+' + waId : waId;
    const noteLines = [
      `WHATSAPP ORDER: ${orderCode}`,
      `Phone: ${customerPhone}`,
      `Payment: UPI (Pre-paid)`,
    ].join('\n');

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Build the KDS preparation change payload — this is what the POS frontend sends
    // to trigger _send_orders_to_preparation_display and create prep orders/lines/states
    const prepChangePayload = JSON.stringify({
      lines: kdsLines,
      metadata: { serverDate: now },
      general_customer_note: '',
      internal_note: noteLines,
      sittingMode: 0,
    });

    // Create the POS order with last_order_preparation_change to trigger KDS
    const orderId = await odooRPC(apiKey, 'pos.order', 'create', [{
      session_id: sessionId,
      config_id: POS_CONFIG_ID,
      pricelist_id: PRICELIST_ID,
      preset_id: 2, // Takeout
      amount_total: total,
      amount_paid: total,
      amount_tax: taxAmount,
      amount_return: 0,
      date_order: now,
      lines,
      internal_note: noteLines,
      state: 'draft',
      last_order_preparation_change: prepChangePayload,
    }]);

    if (!orderId) { console.error('Failed to create POS order'); return null; }

    // Create payment record
    await odooRPC(apiKey, 'pos.payment', 'create', [{
      pos_order_id: orderId,
      payment_method_id: PAYMENT_METHOD_UPI,
      amount: total,
      payment_date: now,
      session_id: sessionId,
    }]);

    // Mark as paid → finalizes order + KDS prep orders already created via last_order_preparation_change
    await odooRPC(apiKey, 'pos.order', 'action_pos_order_paid', [[orderId]]);

    // Get order name and tracking number
    const orderData = await odooRPC(apiKey, 'pos.order', 'search_read',
      [[['id', '=', orderId]]], { fields: ['name', 'tracking_number'] });

    const odooOrderName = orderData?.[0]?.name || `Order #${orderId}`;
    const trackingNumber = orderData?.[0]?.tracking_number || null;

    console.log(`Odoo POS order: ${odooOrderName} (ID: ${orderId}), tracking: ${trackingNumber}`);
    return { id: orderId, name: odooOrderName, trackingNumber };
  } catch (error) {
    console.error('Odoo order creation error:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ODOO RPC HELPER
// ═══════════════════════════════════════════════════════════════════

async function odooRPC(apiKey, model, method, args, kwargs) {
  const payload = {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: {
      service: 'object', method: 'execute_kw',
      args: [ODOO_DB, ODOO_UID, apiKey, model, method, args, kwargs || {}],
    },
  };
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.error) {
    console.error('Odoo RPC error:', JSON.stringify(data.error.data?.message || data.error.message));
    return null;
  }
  return data.result;
}

// ═══════════════════════════════════════════════════════════════════
// RAZORPAY PAYMENT LINK (fallback when native order_details fails)
// ═══════════════════════════════════════════════════════════════════

async function createRazorpayPaymentLink(context, { amount, orderCode, orderId, customerName, customerPhone }) {
  const keyId = context.env.RAZORPAY_KEY_ID;
  const keySecret = context.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) { console.error('Razorpay keys not set'); return null; }

  try {
    const callbackUrl = `${new URL(context.request.url).origin}/api/whatsapp?action=razorpay-callback`;
    const expireBy = Math.floor(Date.now() / 1000) + 20 * 60; // 20 min

    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${keyId}:${keySecret}`),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Paise
        currency: 'INR',
        description: `Hamza Express — Order ${orderCode}`,
        customer: { name: customerName, contact: customerPhone },
        callback_url: callbackUrl,
        callback_method: 'get',
        expire_by: expireBy,
        upi_link: true,
        notes: {
          order_code: orderCode,
          order_id: String(orderId),
          source: 'hamza_express_whatsapp',
        },
      }),
    });

    if (!res.ok) {
      console.error('Razorpay link error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return { id: data.id, short_url: data.short_url };
  } catch (error) {
    console.error('Razorpay link creation error:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// WHATSAPP ORDER_DETAILS PAYMENT (native Razorpay in-app)
// ═══════════════════════════════════════════════════════════════════

function buildOrderDetailsPayment(to, orderCode, cart, total) {
  const items = cart.map(c => ({
    retailer_id: c.code,
    name: c.name,
    amount: { value: Math.round(c.price * 100), offset: 100 },
    quantity: c.qty,
  }));

  const subtotal = cart.reduce((sum, c) => sum + (c.price * c.qty), 0);

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'order_details',
      body: { text: `Order ${orderCode}\n\nTap below to pay Rs.${total}` },
      footer: { text: 'Hamza Express • HKP Road, Shivajinagar' },
      action: {
        name: 'review_and_pay',
        parameters: {
          reference_id: orderCode,
          type: 'digital-goods',
          payment_configuration: PAYMENT_CONFIGURATION,
          payment_type: 'payment_gateway:razorpay',
          currency: 'INR',
          total_amount: { value: Math.round(total * 100), offset: 100 },
          order: {
            status: 'pending',
            catalog_id: CATALOG_ID,
            items,
            subtotal: { value: Math.round(subtotal * 100), offset: 100 },
          },
        },
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE BUILDERS
// ═══════════════════════════════════════════════════════════════════

function buildText(to, body) {
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body } };
}

function buildReplyButtons(to, body, buttons) {
  return {
    messaging_product: 'whatsapp', to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// WHATSAPP SEND HELPER
// ═══════════════════════════════════════════════════════════════════

async function sendWhatsApp(phoneId, token, payload) {
  const url = `https://graph.facebook.com/${WA_API_VERSION}/${phoneId}/messages`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error('WA API error:', response.status, err);
    }
    return response;
  } catch (e) {
    console.error('WA send error:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SESSION HELPER
// ═══════════════════════════════════════════════════════════════════

async function updateSession(db, waId, state, cart, cartTotal) {
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO wa_sessions (wa_id, state, cart, cart_total, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(wa_id) DO UPDATE SET state = ?, cart = ?, cart_total = ?, updated_at = ?'
  ).bind(waId, state, cart, cartTotal, now, state, cart, cartTotal, now).run();
}

// ═══════════════════════════════════════════════════════════════════
// PAYMENT ERROR MESSAGES
// ═══════════════════════════════════════════════════════════════════

function getPaymentErrorMessage(reason) {
  const messages = {
    'INSUFFICIENT_FUNDS': 'Insufficient balance in your account',
    'INCORRECT_PIN': 'Incorrect UPI PIN entered',
    'TRANSACTION_LIMIT_EXCEEDED': 'Transaction limit exceeded',
    'EXPIRED': 'Payment session expired',
    'USER_DECLINED': 'Payment was declined',
    'BANK_TIMEOUT': 'Bank server timeout — please try again',
    'UNKNOWN': 'Payment could not be processed',
  };
  return messages[reason] || messages['UNKNOWN'];
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD API (for admin/staff tools)
// ═══════════════════════════════════════════════════════════════════

async function handleDashboardAPI(context, action, url, corsHeaders) {
  const db = context.env.DB;

  if (action === 'orders') {
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    let query = 'SELECT * FROM wa_orders';
    const params = [];
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);
    const result = await db.prepare(query).bind(...params).all();
    return new Response(JSON.stringify({ orders: result.results }), { headers: corsHeaders });
  }

  if (action === 'stats') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    const stats = await db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END) as revenue,
        COUNT(DISTINCT wa_id) as unique_customers,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready
      FROM wa_orders WHERE created_at >= ?
    `).bind(todayStr).first();

    return new Response(JSON.stringify({ stats }), { headers: corsHeaders });
  }

  if (action === 'update-status' && context.request.method === 'POST') {
    const body = await context.request.json();
    const { order_id, status: newStatus } = body;
    if (!order_id || !newStatus) {
      return new Response(JSON.stringify({ error: 'Missing order_id or status' }), { status: 400, headers: corsHeaders });
    }

    const now = new Date().toISOString();
    await db.prepare('UPDATE wa_orders SET status = ?, updated_at = ? WHERE id = ?')
      .bind(newStatus, now, order_id).run();

    // Send WhatsApp notification for key status changes
    const order = await db.prepare('SELECT * FROM wa_orders WHERE id = ?').bind(order_id).first();
    if (order) {
      const phoneId = context.env.WA_PHONE_ID;
      const token = context.env.WA_ACCESS_TOKEN;

      if (newStatus === 'preparing') {
        await sendWhatsApp(phoneId, token, buildText(order.wa_id,
          `Your order *${order.order_code}* is now being prepared!\n\n` +
          `*Collect from:* ${order.collection_point || 'Kitchen Pass'}\n` +
          `We'll notify you when it's ready.`));
      } else if (newStatus === 'ready') {
        await sendWhatsApp(phoneId, token, buildText(order.wa_id,
          `Your order *${order.order_code}* is *READY*!\n\n` +
          `*Collect from:* ${order.collection_point || 'Kitchen Pass'}\n` +
          (order.tracking_number ? `*Show token:* ${order.tracking_number}\n\n` : '\n') +
          `Please collect it now. Thank you for ordering with Hamza Express!`));
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
}
