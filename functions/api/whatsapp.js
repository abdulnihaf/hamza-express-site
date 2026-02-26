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
  // ── Indian — Chicken Starters (cat 77 → parent 22) ──
  'HE-1140': { name: 'American Chops',             price: 257, odooId: 1158, catId: 22 },
  'HE-1136': { name: 'Barbeque Chicken',           price: 210, odooId: 1154, catId: 22 },
  'HE-1169': { name: 'Chicken Pepper Dry',         price: 190, odooId: 1187, catId: 22 },
  'HE-1173': { name: 'Thethar Pepper Dry',         price: 286, odooId: 1191, catId: 22 },
  'HE-1159': { name: 'Thethar Pepper Roast',       price: 305, odooId: 1177, catId: 22 },

  // ── Indian — Mutton Starters (cat 78 → parent 22) ──
  'HE-1192': { name: 'Mutton Brain Dry',           price: 152, odooId: 1210, catId: 22 },
  'HE-1199': { name: 'Mutton Chops',               price: 219, odooId: 1217, catId: 22 },
  'HE-1194': { name: 'Mutton Gurda Dry',           price: 200, odooId: 1212, catId: 22 },
  'HE-1187': { name: 'Mutton Pepper Roast',        price: 210, odooId: 1205, catId: 22 },
  'HE-1191': { name: 'Mutton Pepper Dry',          price: 200, odooId: 1209, catId: 22 },
  'HE-1195': { name: 'Mutton Sheekh Kabab',        price: 143, odooId: 1213, catId: 22 },

  // ── Indian — Chicken Curry (cat 79 → parent 22) ──
  'HE-1149': { name: 'Butter Chicken',             price: 200, odooId: 1167, catId: 22 },
  'HE-1152': { name: 'Chicken Burtha',             price: 238, odooId: 1170, catId: 22 },
  'HE-1156': { name: 'Chicken Chatpata',           price: 238, odooId: 1174, catId: 22 },
  'HE-1147': { name: 'Chicken Dopiyaza',           price: 219, odooId: 1165, catId: 22 },
  'HE-1148': { name: 'Hyderabadi Chicken',         price: 200, odooId: 1166, catId: 22 },
  'HE-1151': { name: 'Chicken Kali Mirch',         price: 200, odooId: 1169, catId: 22 },
  'HE-1162': { name: 'Kolhapuri Chicken',          price: 200, odooId: 1180, catId: 22 },
  'HE-1157': { name: 'Chicken Sagwala',            price: 210, odooId: 1175, catId: 22 },
  'HE-1161': { name: 'Chicken Tikka Masala',       price: 286, odooId: 1179, catId: 22 },
  'HE-1160': { name: 'Chicken Hamza Special',      price: 210, odooId: 1178, catId: 22 },
  'HE-1155': { name: 'Kadai Chicken',              price: 210, odooId: 1173, catId: 22 },
  'HE-1154': { name: 'Methi Chicken',              price: 200, odooId: 1172, catId: 22 },
  'HE-1146': { name: 'Mughlai Chicken',            price: 219, odooId: 1164, catId: 22 },
  'HE-1150': { name: 'Punjabi Chicken',            price: 219, odooId: 1168, catId: 22 },
  'HE-1158': { name: 'Tandoori Chicken Masala',    price: 267, odooId: 1176, catId: 22 },

  // ── Indian — Mutton Curry (cat 80 → parent 22) ──
  'HE-1180': { name: 'Kadai Mutton',               price: 210, odooId: 1198, catId: 22 },
  'HE-1178': { name: 'Methi Mutton',               price: 200, odooId: 1196, catId: 22 },
  'HE-1179': { name: 'Mutton Achari',              price: 219, odooId: 1197, catId: 22 },
  'HE-1198': { name: 'Mutton Brain',               price: 152, odooId: 1216, catId: 22 },
  'HE-1181': { name: 'Mutton Chatpata',            price: 219, odooId: 1199, catId: 22 },
  'HE-1190': { name: 'Mutton Hamza Special',       price: 229, odooId: 1208, catId: 22 },
  'HE-1184': { name: 'Hyderabadi Mutton',          price: 210, odooId: 1202, catId: 22 },
  'HE-1188': { name: 'Mutton Kassa',               price: 219, odooId: 1206, catId: 22 },
  'HE-1197': { name: 'Mutton Khima',               price: 219, odooId: 1215, catId: 22 },
  'HE-1186': { name: 'Mutton Kolhapuri',           price: 219, odooId: 1204, catId: 22 },
  'HE-1386': { name: 'Mutton Kolhapuri Gravy',     price: 219, odooId: 1404, catId: 22 },
  'HE-1185': { name: 'Mutton Masala',              price: 200, odooId: 1203, catId: 22 },
  'HE-1182': { name: 'Mutton Punjabi',             price: 219, odooId: 1200, catId: 22 },
  'HE-1177': { name: 'Mutton Rogan Josh',          price: 200, odooId: 1195, catId: 22 },
  'HE-1183': { name: 'Mutton Sagwala',             price: 219, odooId: 1201, catId: 22 },
  'HE-1189': { name: 'Mutton Tadka',               price: 219, odooId: 1207, catId: 22 },

  // ── Indian — Vegetarian (cat 81 → parent 22) ──
  'HE-1230': { name: 'Aloo Gobi',                  price: 171, odooId: 1248, catId: 22 },
  'HE-1225': { name: 'Dal Fry',                    price: 105, odooId: 1243, catId: 22 },
  'HE-1233': { name: 'Dal Tadka',                  price: 114, odooId: 1251, catId: 22 },
  'HE-1232': { name: 'Gobi Masala',                price: 152, odooId: 1250, catId: 22 },
  'HE-1227': { name: 'Kadai Paneer',               price: 171, odooId: 1245, catId: 22 },
  'HE-1387': { name: 'Malai Kofta',                price: 229, odooId: 1405, catId: 22 },
  'HE-1231': { name: 'Mixed Veg Curry',            price: 190, odooId: 1249, catId: 22 },
  'HE-1234': { name: 'Mushroom Masala',            price: 171, odooId: 1252, catId: 22 },
  'HE-1228': { name: 'Palak Paneer',               price: 190, odooId: 1246, catId: 22 },
  'HE-1226': { name: 'Paneer Butter Masala',       price: 171, odooId: 1244, catId: 22 },
  'HE-1229': { name: 'Paneer Mutter Masala',       price: 190, odooId: 1247, catId: 22 },
  'HE-1388': { name: 'Veg Kofta',                  price: 210, odooId: 1406, catId: 22 },

  // ── Indian — Biryani & Rice (cat 82 → parent 22) ──
  'HE-1203': { name: 'Biryani Rice',               price: 114, odooId: 1221, catId: 22 },
  'HE-1389': { name: 'Chicken Boneless Biryani',   price: 267, odooId: 1407, catId: 22 },
  'HE-1204': { name: 'Egg Biryani',                price: 152, odooId: 1222, catId: 22 },
  'HE-1207': { name: 'Plain Rice',                 price: 48,  odooId: 1225, catId: 22 },
  'HE-1202': { name: 'Thethar Biryani',            price: 257, odooId: 1220, catId: 22 },

  // ── Chinese — Fried Rice (cat 83 → parent 24) ──
  'HE-1235': { name: 'Chicken Fried Rice',         price: 181, odooId: 1253, catId: 24 },
  'HE-1243': { name: 'Mix Fried Rice',             price: 229, odooId: 1261, catId: 24 },
  'HE-1237': { name: 'Mutton Fried Rice',          price: 219, odooId: 1255, catId: 24 },
  'HE-1241': { name: 'Prawns Fried Rice',          price: 219, odooId: 1259, catId: 24 },
  'HE-1245': { name: 'Shezwan Fried Rice',         price: 190, odooId: 1263, catId: 24 },
  'HE-1247': { name: 'Veg Fried Rice',             price: 143, odooId: 1265, catId: 24 },

  // ── Chinese — Noodles (cat 84 → parent 24) ──
  'HE-1236': { name: 'Chicken Noodles',            price: 181, odooId: 1254, catId: 24 },
  'HE-1244': { name: 'Mix Noodles',                price: 229, odooId: 1262, catId: 24 },
  'HE-1238': { name: 'Mutton Noodles',             price: 219, odooId: 1256, catId: 24 },
  'HE-1242': { name: 'Prawns Noodles',             price: 219, odooId: 1260, catId: 24 },
  'HE-1246': { name: 'Shezwan Noodles',            price: 190, odooId: 1264, catId: 24 },
  'HE-1248': { name: 'Veg Noodles',                price: 143, odooId: 1266, catId: 24 },

  // ── Chinese — Chinese Gravy (cat 85 → parent 24) ──
  'HE-1170': { name: 'Garlic Chicken',             price: 190, odooId: 1188, catId: 24 },
  'HE-1174': { name: 'Hongkong Chicken',           price: 210, odooId: 1192, catId: 24 },
  'HE-1390': { name: 'Shezwan Chicken',            price: 219, odooId: 1408, catId: 24 },
  'HE-1391': { name: 'Shezwan Mutton',             price: 219, odooId: 1409, catId: 24 },
  'HE-1167': { name: 'Singapore Chicken',          price: 210, odooId: 1185, catId: 24 },

  // ── Chinese — Chinese Starters (cat 86 → parent 24) ──
  'HE-1166': { name: 'Chicken 65',                 price: 210, odooId: 1184, catId: 24 },
  'HE-1168': { name: 'Lemon Chicken',              price: 219, odooId: 1186, catId: 24 },
  'HE-1172': { name: 'Lollipop',                   price: 190, odooId: 1190, catId: 24 },

  // ── Chinese — Rolls (cat 87 → parent 24) ──
  'HE-1208': { name: 'Chicken Roll',               price: 86,  odooId: 1226, catId: 24 },
  'HE-1209': { name: 'Egg Roll',                   price: 86,  odooId: 1227, catId: 24 },
  'HE-1211': { name: 'Mutton Sheekh Roll',         price: 152, odooId: 1229, catId: 24 },
  'HE-1392': { name: 'Paneer Roll',                price: 86,  odooId: 1410, catId: 24 },
  'HE-1210': { name: 'Veg Roll',                   price: 76,  odooId: 1228, catId: 24 },

  // ── Chinese — Seafood (cat 88 → parent 24) ──
  'HE-1258': { name: 'Prawns Chilly Manchurian',   price: 257, odooId: 1276, catId: 24 },

  // ── Tandoor — Tandoori Starters (cat 89 → parent 25) ──
  'HE-1143': { name: 'Andhra Tikka',               price: 238, odooId: 1161, catId: 25 },
  'HE-1163': { name: 'Chicken Kabab',              price: 171, odooId: 1181, catId: 25 },
  'HE-1395': { name: 'Garlic Kabab',               price: 229, odooId: 1413, catId: 25 },
  'HE-1141': { name: 'Haryali Tikka',              price: 229, odooId: 1159, catId: 25 },
  'HE-1393': { name: 'Irani Chicken',              price: 219, odooId: 1411, catId: 25 },
  'HE-1138': { name: 'Kalmi Kabab',                price: 257, odooId: 1156, catId: 25 },
  'HE-1142': { name: 'Malai Tikka',                price: 238, odooId: 1160, catId: 25 },
  'HE-1145': { name: 'Pathak Kabab',               price: 219, odooId: 1163, catId: 25 },
  'HE-1394': { name: 'Reshmi Kabab',               price: 229, odooId: 1412, catId: 25 },
  'HE-1135': { name: 'Tandoori Chicken',           price: 190, odooId: 1153, catId: 25 },

  // ── Tandoor — Indian Breads (cat 90 → parent 25) ──
  'HE-1220': { name: 'Butter Naan',                price: 43,  odooId: 1238, catId: 25 },
  'HE-1213': { name: 'Ceylon Paratha',              price: 33,  odooId: 1231, catId: 25 },
  'HE-1217': { name: 'Chapathi',                   price: 19,  odooId: 1235, catId: 25 },
  'HE-1222': { name: 'Garlic Naan',                price: 48,  odooId: 1240, catId: 25 },
  'HE-1212': { name: 'Kerala Paratha',             price: 29,  odooId: 1230, catId: 25 },
  'HE-1221': { name: 'Kulcha',                     price: 48,  odooId: 1239, catId: 25 },
  'HE-1396': { name: 'Pathiri Roti',               price: 36,  odooId: 1414, catId: 25 },
  'HE-1218': { name: 'Roomali Roti',               price: 17,  odooId: 1236, catId: 25 },
  'HE-1223': { name: 'Tandoori Paratha',           price: 48,  odooId: 1241, catId: 25 },
  'HE-1216': { name: 'Wheat Paratha',              price: 43,  odooId: 1234, catId: 25 },

  // ── Fried Chicken — Combos (cat 70 → parent 26) ──
  'HE-1351': { name: 'Duet Combo',                 price: 181, odooId: 1369, catId: 26 },
  'HE-1352': { name: 'Regular Combo',              price: 352, odooId: 1370, catId: 26 },
  'HE-1353': { name: 'Family Combo',               price: 666, odooId: 1371, catId: 26 },
  'HE-1354': { name: 'Party Combo',                price: 951, odooId: 1372, catId: 26 },

  // ── Fried Chicken — Pieces (cat 71 → parent 26) ──
  'HE-1348': { name: '1 Pc Fried Chicken',         price: 71,  odooId: 1366, catId: 26 },
  'HE-1349': { name: '2 Pcs Fried Chicken',        price: 143, odooId: 1367, catId: 26 },
  'HE-1350': { name: '4 Pcs Fried Chicken',        price: 266, odooId: 1368, catId: 26 },

  // ── Fried Chicken — Sides (cat 72 → parent 26) ──
  'HE-1355': { name: 'Cheesy Fries',               price: 143, odooId: 1373, catId: 26 },
  'HE-1356': { name: 'Loaded Fries',               price: 181, odooId: 1374, catId: 26 },
  'HE-1357': { name: 'Krispy Popcorn (S)',          price: 76,  odooId: 1375, catId: 26 },
  'HE-1358': { name: 'Krispy Popcorn (M)',          price: 143, odooId: 1376, catId: 26 },
  'HE-1359': { name: 'Krispy Popcorn (L)',          price: 219, odooId: 1377, catId: 26 },

  // ── Fried Chicken — Wings & Lollipop (cat 73 → parent 26) ──
  'HE-1360': { name: 'Krispy Shrimps with Mayo (10pcs)', price: 237, odooId: 1378, catId: 26 },
  'HE-1361': { name: 'Krispy Wings with Mayo (6pcs)',    price: 94,  odooId: 1379, catId: 26 },
  'HE-1362': { name: 'Krispy Lollipop with Mayo (6pcs)', price: 123, odooId: 1380, catId: 26 },

  // ── Fried Chicken — Burgers (cat 74 → parent 26) ──
  'HE-1363': { name: 'Chicken Zinger Burger',      price: 171, odooId: 1381, catId: 26 },
  'HE-1364': { name: 'Classic Chicken Burger',     price: 124, odooId: 1382, catId: 26 },

  // ── Fried Chicken — Salads & Rice (cat 75 → parent 26) ──
  'HE-1368': { name: 'Chicken Popcorn Salad',      price: 181, odooId: 1386, catId: 26 },
  'HE-1369': { name: 'Chicken Doner Salad',        price: 181, odooId: 1387, catId: 26 },
  'HE-1365': { name: 'Chicken Zinger Roll',        price: 152, odooId: 1383, catId: 26 },
  'HE-1370': { name: 'Rice with Chicken Popcorn',  price: 181, odooId: 1388, catId: 26 },

  // ── Fried Chicken — Extras (cat 76 → parent 26) ──
  'HE-1371': { name: 'Extra Bun',                  price: 14,  odooId: 1389, catId: 26 },
  'HE-1372': { name: 'Extra Mayo',                 price: 19,  odooId: 1390, catId: 26 },
  'HE-1367': { name: 'Shawarma Roll',              price: 76,  odooId: 1385, catId: 26 },
  'HE-1373': { name: 'Soft Drink',                 price: 38,  odooId: 1391, catId: 26 },

  // ── Bane Marie (cat 28) — counter service items ──
  'HE-1201': { name: 'Chicken Biryani',            price: 238, odooId: 1219, catId: 28 },
  'HE-1200': { name: 'Mutton Biryani',             price: 324, odooId: 1218, catId: 28 },
  'HE-1205': { name: 'Ghee Rice',                  price: 95,  odooId: 1223, catId: 28 },
  'HE-1164': { name: 'Chilli Chicken',             price: 190, odooId: 1182, catId: 28 },
  'HE-1397': { name: 'Butter Chicken (BM)',        price: 200, odooId: 1415, catId: 28 },
  'HE-1398': { name: 'Mutton Chatpata (BM)',       price: 219, odooId: 1416, catId: 28 },
  'HE-1399': { name: 'Singapore Chicken (BM)',     price: 210, odooId: 1417, catId: 28 },
  'HE-1400': { name: 'Lemon Chicken (BM)',         price: 219, odooId: 1418, catId: 28 },
};

// ── Category → collection point mapping ──
const KITCHEN_CATS = new Set([22, 24, 25, 26]); // Indian, Chinese, Tandoor, FC → Kitchen Counter
const KITCHEN_COUNTER_LABEL = 'Kitchen Counter'; // Customer-facing name (internal: Kitchen Pass)
const COUNTER_CATS = {
  27: 'Juice Counter',
  28: 'Bane Marie Counter',
  29: 'Shawarma Counter',
  30: 'Grill Counter',
};

// ── KDS stage → customer-facing counter name (for WhatsApp notifications) ──
const STAGE_COUNTER_MAP = {
  // PREPARING stages
  44: KITCHEN_COUNTER_LABEL,  // KDS 15 Kitchen Pass → Ready (all station items done)
  62: 'Juice Counter',        // KDS 16 Juice → Preparing
  64: 'Bane Marie Counter',   // KDS 17 Bane Marie → Preparing
  65: 'Shawarma Counter',     // KDS 18 Shawarma → Preparing
  66: 'Grill Counter',        // KDS 19 Grill → Preparing
  // READY stages
  76: KITCHEN_COUNTER_LABEL,  // KDS 21 Kitchen Pass TV → InProgress (packed, ready for pickup)
  47: 'Juice Counter',        // KDS 16 Juice → Ready
  50: 'Bane Marie Counter',   // KDS 17 Bane Marie → Ready
  53: 'Shawarma Counter',     // KDS 18 Shawarma → Ready
  56: 'Grill Counter',        // KDS 19 Grill → Ready
};

// ── Customer tier based on order history ──
function getCustomerTier(totalOrders) {
  if (totalOrders === 0) return 'new';      // First order: full guidance
  if (totalOrders <= 2) return 'learning';  // 1-2 orders: moderate guidance
  if (totalOrders <= 9) return 'familiar';  // 3-9 orders: concise
  return 'regular';                          // 10+ orders: minimal, speed
}

// ── Odoo configuration ──
const ODOO_URL = 'https://ops.hamzahotel.com/jsonrpc';
const ODOO_DB = 'main';
const ODOO_UID = 2;
const TEST_ODOO_URL = 'https://test.hamzahotel.com/jsonrpc';
const POS_CONFIG_ID = 10;     // HE - WABA
const PRICELIST_ID = 1;       // Default pricelist
const PAYMENT_METHOD_UPI = 17; // WABA General UPI
const GST_TAX_ID = 31;        // 5% GST S

// ── WhatsApp configuration ──
// WA_PHONE_ID loaded from env secret (set via wrangler/CF dashboard)
const WA_API_VERSION = 'v21.0';
const PAYMENT_CONFIGURATION = 'Hamza_Express_Payments'; // Razorpay config in WhatsApp Manager

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// ── Customer-facing menu categories (for WhatsApp category picker) ──
// Each category ≤ 30 products (WhatsApp MPM hard limit is 30 total per message)
// Grouped by how customers browse food online (Swiggy/Zomato style), NOT by KDS station
const MENU_CATEGORIES = {
  biryani: {
    title: 'Biryani & Rice', desc: 'Mutton, Chicken, Egg Biryani & more',
    sections: [
      { title: 'Biryani', items: ['HE-1201','HE-1200','HE-1202','HE-1389','HE-1204'] },
      { title: 'Rice', items: ['HE-1203','HE-1205','HE-1207'] },
    ],
  },
  starters: {
    title: 'Starters', desc: 'Tandoori, Chicken & Mutton dry starters',
    sections: [
      { title: 'Tandoori Starters', items: ['HE-1135','HE-1138','HE-1142','HE-1143','HE-1141','HE-1393','HE-1394','HE-1395','HE-1145','HE-1163'] },
      { title: 'Chicken Starters', items: ['HE-1169','HE-1173','HE-1159','HE-1136','HE-1140'] },
      { title: 'Mutton Starters', items: ['HE-1191','HE-1187','HE-1192','HE-1194','HE-1199','HE-1195'] },
    ],
  },
  chicken: {
    title: 'Chicken Curry', desc: 'Butter Chicken, Kadai, Tikka Masala & more',
    sections: [
      { title: 'Chicken Curry', items: ['HE-1149','HE-1146','HE-1150','HE-1147','HE-1148','HE-1151','HE-1155','HE-1154','HE-1162','HE-1157','HE-1156','HE-1152','HE-1158','HE-1161','HE-1160'] },
    ],
  },
  mutton: {
    title: 'Mutton', desc: 'Rogan Josh, Kassa, Kolhapuri & more',
    sections: [
      { title: 'Mutton Curry', items: ['HE-1177','HE-1185','HE-1178','HE-1179','HE-1180','HE-1181','HE-1182','HE-1183','HE-1184','HE-1186','HE-1386','HE-1188','HE-1189','HE-1190','HE-1197','HE-1198'] },
    ],
  },
  chinese: {
    title: 'Chinese', desc: 'Fried Rice, Noodles, Gravy, Rolls & more',
    sections: [
      { title: 'Fried Rice', items: ['HE-1235','HE-1237','HE-1243','HE-1241','HE-1245','HE-1247'] },
      { title: 'Noodles', items: ['HE-1236','HE-1238','HE-1244','HE-1242','HE-1246','HE-1248'] },
      { title: 'Chinese Gravy', items: ['HE-1170','HE-1174','HE-1167','HE-1390','HE-1391'] },
      { title: 'Starters & Seafood', items: ['HE-1166','HE-1168','HE-1172','HE-1164','HE-1258'] },
      { title: 'Rolls', items: ['HE-1208','HE-1209','HE-1211','HE-1392','HE-1210'] },
    ],
  },
  breads: {
    title: 'Roti & Breads', desc: 'Naan, Paratha, Chapathi & more',
    sections: [
      { title: 'Indian Breads', items: ['HE-1220','HE-1222','HE-1221','HE-1223','HE-1216','HE-1212','HE-1213','HE-1217','HE-1218','HE-1396'] },
    ],
  },
  krispy: {
    title: 'Krispy Eats', desc: 'Fried Chicken, Burgers, Combos',
    sections: [
      { title: 'Fried Chicken', items: ['HE-1348','HE-1349','HE-1350'] },
      { title: 'Combos', items: ['HE-1351','HE-1352','HE-1353','HE-1354'] },
      { title: 'Snacks & Sides', items: ['HE-1355','HE-1356','HE-1357','HE-1358','HE-1359','HE-1360','HE-1361','HE-1362'] },
      { title: 'Burgers & Rolls', items: ['HE-1363','HE-1364','HE-1365','HE-1367'] },
      { title: 'Salads & Rice', items: ['HE-1368','HE-1369','HE-1370'] },
      { title: 'Extras', items: ['HE-1371','HE-1372','HE-1373'] },
    ],
  },
  veg: {
    title: 'Veg & Dal', desc: 'Paneer, Kofta, Dal, Mixed Veg',
    sections: [
      { title: 'Veg & Dal', items: ['HE-1226','HE-1227','HE-1228','HE-1229','HE-1230','HE-1231','HE-1232','HE-1234','HE-1225','HE-1233','HE-1387','HE-1388'] },
    ],
  },
};

// ── Meal-intent groupings: customer picks an "intent" → receives ALL items via multi-MPM ──
// Each MPM ≤ 30 items (WhatsApp hard limit). WhatsApp native cart persists across MPMs.
const MEAL_INTENT_CATEGORIES = {
  meals: {
    label: 'Meals',
    desc: 'Curry + Bread + Rice + Veg — all in one go',
    mpms: [
      {
        header: 'Chicken Curry & Biryani',
        body: 'Chicken curries + Biryani & Rice\nAdd items to cart, then browse next message for more!',
        sections: [
          { title: 'Chicken Curry', items: ['HE-1149','HE-1146','HE-1150','HE-1147','HE-1148','HE-1151','HE-1155','HE-1154','HE-1162','HE-1157','HE-1156','HE-1152','HE-1158','HE-1161','HE-1160'] },
          { title: 'Biryani & Rice', items: ['HE-1201','HE-1200','HE-1202','HE-1389','HE-1204','HE-1203','HE-1205','HE-1207'] },
        ],
      },
      {
        header: 'Mutton & Veg',
        body: 'Mutton curries + Veg & Dal\nKeep adding to the same cart!',
        sections: [
          { title: 'Mutton Curry', items: ['HE-1177','HE-1185','HE-1178','HE-1179','HE-1180','HE-1181','HE-1182','HE-1183','HE-1184','HE-1186','HE-1386','HE-1188','HE-1189','HE-1190','HE-1197','HE-1198'] },
          { title: 'Veg & Dal', items: ['HE-1226','HE-1227','HE-1228','HE-1229','HE-1230','HE-1231','HE-1232','HE-1234','HE-1225','HE-1233','HE-1387','HE-1388'] },
        ],
      },
      {
        header: 'Roti & Breads',
        body: 'Naan, Paratha, Chapathi & more\nAdd breads to complete your meal, then Send your cart!',
        sections: [
          { title: 'Indian Breads', items: ['HE-1220','HE-1222','HE-1221','HE-1223','HE-1216','HE-1212','HE-1213','HE-1217','HE-1218','HE-1396'] },
        ],
      },
    ],
  },
  starters: {
    label: 'Starters',
    desc: 'Tandoori, Chicken & Mutton dry starters',
    mpms: [
      {
        header: 'Starters',
        body: 'Tandoori, Chicken & Mutton dry starters\nAdd items to cart, then tap Send!',
        sections: [
          { title: 'Tandoori Starters', items: ['HE-1135','HE-1138','HE-1142','HE-1143','HE-1141','HE-1393','HE-1394','HE-1395','HE-1145','HE-1163'] },
          { title: 'Chicken Starters', items: ['HE-1169','HE-1173','HE-1159','HE-1136','HE-1140'] },
          { title: 'Mutton Starters', items: ['HE-1191','HE-1187','HE-1192','HE-1194','HE-1199','HE-1195'] },
        ],
      },
    ],
  },
  krispy: {
    label: 'Krispy Eats',
    desc: 'Fried Chicken, Burgers, Combos',
    mpms: [
      {
        header: 'Krispy Eats',
        body: 'Fried Chicken, Burgers, Combos & more\nAdd items to cart, then tap Send!',
        sections: [
          { title: 'Fried Chicken', items: ['HE-1348','HE-1349','HE-1350'] },
          { title: 'Combos', items: ['HE-1351','HE-1352','HE-1353','HE-1354'] },
          { title: 'Snacks & Sides', items: ['HE-1355','HE-1356','HE-1357','HE-1358','HE-1359','HE-1360','HE-1361','HE-1362'] },
          { title: 'Burgers & Rolls', items: ['HE-1363','HE-1364','HE-1365','HE-1367'] },
          { title: 'Salads & Rice', items: ['HE-1368','HE-1369','HE-1370'] },
          { title: 'Extras', items: ['HE-1371','HE-1372','HE-1373'] },
        ],
      },
    ],
  },
  chinese: {
    label: 'Chinese',
    desc: 'Fried rice, noodles, gravy, rolls & seafood',
    mpms: [
      {
        header: 'Chinese',
        body: 'Fried rice, noodles, gravy, starters & rolls\nAdd items to cart, then tap Send!',
        sections: [
          { title: 'Fried Rice', items: ['HE-1235','HE-1237','HE-1243','HE-1241','HE-1245','HE-1247'] },
          { title: 'Noodles', items: ['HE-1236','HE-1238','HE-1244','HE-1242','HE-1246','HE-1248'] },
          { title: 'Chinese Gravy', items: ['HE-1170','HE-1174','HE-1167','HE-1390','HE-1391'] },
          { title: 'Starters & Seafood', items: ['HE-1166','HE-1168','HE-1172','HE-1164','HE-1258'] },
          { title: 'Rolls', items: ['HE-1208','HE-1209','HE-1211','HE-1392','HE-1210'] },
        ],
      },
    ],
  },
};

// ── Counter-specific menus for in-outlet QR ordering ──
// Customer scans QR at counter → sees ONLY that counter's items → orders → pays → collects there
const COUNTER_MENUS = {
  bm_counter: {
    title: 'Bane Marie Counter',
    counter: 'Bane Marie Counter',
    greeting: 'Order from the Bane Marie counter — Biryani, Rice & Curry!',
    sections: [
      { title: 'Biryani & Rice', items: ['HE-1201','HE-1200','HE-1205'] },
      { title: 'Curry & Starters', items: ['HE-1397','HE-1398','HE-1164','HE-1399','HE-1400'] },
    ],
  },
};

// ── Detect counter keyword from QR code text (e.g. "BM Counter") ──
function detectCounterKeyword(text) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized === 'bm counter' || normalized === 'bm_counter') return 'bm_counter';
  if (normalized === 'juice counter' || normalized === 'juice_counter') return 'juice_counter';
  if (normalized === 'shawarma counter' || normalized === 'shawarma_counter') return 'shawarma_counter';
  if (normalized === 'grill counter' || normalized === 'grill_counter') return 'grill_counter';
  return null;
}

// ── Keyword shortcuts → jump directly to a meal intent or category MPM ──
const STATION_KEYWORDS = {
  // Direct category shortcuts (used by "Browse by Category" sub-flow)
  'krispy':       'krispy',
  'fc':           'krispy',
  'fried chicken':'krispy',
  'biryani':      'biryani',
  'veg':          'veg',
  'breads':       'breads',
  'bread':        'breads',
  'roti':         'breads',
  'naan':         'breads',
  'noodles':      'chinese',
  'chinese':      'chinese',
  'fried rice':   'chinese',
  'chicken':      'chicken',
  'mutton':       'mutton',
  // Meal-intent shortcuts (route to multi-MPM meal intents)
  'meals':        'intent_meals',
  'meal':         'intent_meals',
  'curry':        'intent_meals',
  'curries':      'intent_meals',
  'starters':     'intent_starters',
  'starter':      'intent_starters',
  'snacks':       'intent_starters',
  'tandoori':     'intent_starters',
  'kabab':        'intent_starters',
  'rice':         'intent_chinese',
  'prawns':       'intent_chinese',
  'seafood':      'intent_chinese',
};

// ── NCH forwarding (disabled — NCH phone now serves HE) ──
// When HE gets its own WABA+phone, re-enable NCH forwarding:
// const NCH_PHONE_ID = '970365416152029';
// const NCH_WEBHOOK_URL = 'https://nawabichaihouse.com/api/whatsapp';
// Also restore NCH profile via: bash scripts/restore-nch-profile.sh

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

  // Floor operations — Captain/Waiter coordination (PIN-gated, no X-API-Key)
  if (action && action.startsWith('floor-')) {
    return handleFloorAction(context, action, corsHeaders);
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
      // NCH forwarding disabled — NCH phone (970365416152029) now serves HE
      // When HE gets its own phone, re-enable: check incomingPhoneId and forward NCH messages
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

  // List picker selections (works in any state)
  if (msg.type === 'list_reply' && msg.id) {
    // Meal-intent selection → send multi-MPMs
    if (msg.id.startsWith('intent_')) {
      const intentKey = msg.id.replace('intent_', '');
      return handleMealIntent(context, user, intentKey, waId, phoneId, token, db);
    }
    // "Full Menu" → show original 9-category sub-menu
    if (msg.id === 'cat_full_menu') {
      return handleShowFullMenu(context, user, waId, phoneId, token, db);
    }
    // Direct category selection (from "Full Menu" sub-flow)
    if (msg.id.startsWith('cat_')) {
      const categoryKey = msg.id.replace('cat_', '');
      return handleCategorySelection(context, user, categoryKey, waId, phoneId, token, db);
    }
  }

  // Global commands (work in any state)
  if (msg.type === 'text') {
    const text = msg.text;

    // Counter-specific entry (QR code scan — "BM Counter", "Juice Counter", etc.)
    const counterKey = detectCounterKeyword(text);
    if (counterKey) {
      return handleCounterMenu(context, user, counterKey, waId, phoneId, token, db);
    }

    // Keyword shortcuts — jump to meal intent or direct category MPM
    const keywordTarget = STATION_KEYWORDS[text];
    if (keywordTarget) {
      if (keywordTarget.startsWith('intent_')) {
        return handleMealIntent(context, user, keywordTarget.replace('intent_', ''), waId, phoneId, token, db);
      }
      return handleCategorySelection(context, user, keywordTarget, waId, phoneId, token, db);
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
  // Ask for name — first-time welcome with context about the ordering flow
  await sendWhatsApp(phoneId, token, buildText(waId,
    'Welcome to *Hamza Express*! Biryani & More Since 1918.\n\n' +
    'Order from your phone, pay via UPI, and collect at the counter — skip the queue!\n\n' +
    'What\'s your name?'));
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

  // If there's a saved cart from a pre-name order, resume the order flow
  const savedCart = JSON.parse(session.cart || '[]');
  if (Array.isArray(savedCart) && savedCart.length > 0 && session.cart_total > 0) {
    const collection = determineCollectionPoints(savedCart);
    await updateSession(db, waId, 'awaiting_payment', session.cart, session.cart_total);

    const itemLines = savedCart.map(c => `${c.qty}x ${c.name} — Rs.${c.price * c.qty}`).join('\n');
    let collectionText;
    if (collection.points.length === 1) {
      collectionText = `*Collect from:* ${collection.points[0].counter}`;
    } else {
      const lines = collection.points.map(p =>
        `• *${p.counter}* — ${p.items.join(', ')}`
      ).join('\n');
      collectionText = `*Collect from:*\n${lines}`;
    }

    const body = `Thanks, *${name}*!\n\n*Your Order:*\n${itemLines}\n\n` +
      `*Total: Rs.${session.cart_total}* (incl. GST)\n` +
      `${collectionText}\n\n` +
      `Tap *Pay Now* to pay via UPI.`;

    const buttons = [
      { type: 'reply', reply: { id: 'pay_upi', title: 'Pay Now (UPI)' } },
      { type: 'reply', reply: { id: 'pay_cancel', title: 'Cancel' } },
    ];
    await sendWhatsApp(phoneId, token, buildReplyButtons(waId, body, buttons));
    return;
  }

  await sendWhatsApp(phoneId, token, buildText(waId,
    `Great, *${name}*! Let's get you some amazing food.`));
  return handleShowMenu(context, user, waId, phoneId, token, db);
}

async function handleShowMenu(context, user, waId, phoneId, token, db) {
  // Send catalog_message — opens visual catalog browser with images, categories, prices, built-in cart.
  // NOTE: catalog_message API quirks:
  //   - Body text MUST NOT contain exclamation marks (!) — causes silent API failure
  //   - Footer and thumbnail_product_retailer_id params also cause failures
  //   - Keep payload minimal: body + action only
  const tier = getCustomerTier(user.total_orders || 0);

  let bodyText;
  if (tier === 'new') {
    bodyText = user.name
      ? `Hi ${user.name}, welcome to Hamza Express. Tap below to browse our full menu — add items to cart, pay via UPI, and collect at the counter.`
      : 'Welcome to Hamza Express. Tap below to browse our full menu, add items to cart, pay via UPI and collect at the counter.';
  } else if (tier === 'regular') {
    bodyText = `Hey ${user.name || 'there'}, tap below to order.`;
  } else {
    bodyText = user.name
      ? `Hi ${user.name}, tap below to browse our menu.`
      : 'Tap below to browse our menu and order.';
  }

  const catalogMsg = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: waId,
    type: 'interactive',
    interactive: {
      type: 'catalog_message',
      body: { text: bodyText },
      action: {
        name: 'catalog_message',
      },
    },
  };

  const resp = await sendWhatsApp(phoneId, token, catalogMsg);
  if (!resp || !resp.ok) {
    // Fallback: if catalog_message fails, send the meal-intent list instead
    console.log('catalog_message failed (status:', resp?.status, '), falling back to list menu');
    return handleShowMenuList(context, user, waId, phoneId, token, db);
  }
  await updateSession(db, waId, 'awaiting_menu', '[]', 0);
}

async function handleShowMenuList(context, user, waId, phoneId, token, db) {
  // Fallback: Send WhatsApp List message with 5 meal-intent options
  // Used when catalog_message fails or when triggered via keyword "menu list"
  const tier = getCustomerTier(user.total_orders || 0);
  const rows = [
    { id: 'intent_meals', title: '🍛 Meals', description: 'Curry + Bread + Rice + Veg — all in one go' },
    { id: 'intent_starters', title: '🔥 Starters', description: 'Tandoori, Chinese dry, Kababs' },
    { id: 'intent_krispy', title: '🍗 Krispy Eats', description: 'Fried Chicken, Burgers, Combos' },
    { id: 'intent_chinese', title: '🍜 Chinese', description: 'Fried rice, noodles, gravy, rolls & seafood' },
    { id: 'cat_full_menu', title: '📋 Full Menu', description: 'Browse all 9 categories separately' },
  ];

  let bodyText;
  if (tier === 'new') {
    bodyText = user.name
      ? `Hi ${user.name}! Welcome to Hamza Express.\n\nPick what you're in the mood for — add items to cart, pay via UPI, and collect at the counter!`
      : 'Welcome to Hamza Express!\n\nPick what you\'re in the mood for, add items to cart, pay via UPI — and collect from the counter!';
  } else if (tier === 'regular') {
    bodyText = `Hey ${user.name || 'there'}! What'll it be today?`;
  } else {
    bodyText = user.name
      ? `Hi ${user.name}! What are you in the mood for?`
      : 'What are you in the mood for? Pick below.';
  }

  const listMsg = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Hamza Express Menu' },
      body: { text: bodyText },
      footer: { text: 'Biryani & More Since 1918 | All prices incl. GST' },
      action: {
        button: 'What\'s Cooking?',
        sections: [{ title: 'Order By', rows }],
      },
    },
  };

  await sendWhatsApp(phoneId, token, listMsg);
  await updateSession(db, waId, 'awaiting_menu', '[]', 0);
}

async function handleShowFullMenu(context, user, waId, phoneId, token, db) {
  // Original 9-category list — accessible via "Full Menu" option
  // Customer taps a category → receives a focused MPM (≤30 items) for that category
  const tier = getCustomerTier(user.total_orders || 0);
  const rows = Object.entries(MENU_CATEGORIES).map(([key, cat]) => ({
    id: `cat_${key}`,
    title: cat.title,
    description: cat.desc,
  }));

  let bodyText;
  if (tier === 'new') {
    bodyText = user.name
      ? `Hi ${user.name}! Here are all 9 categories.\n\nPick a category, add items to cart, then send.`
      : 'Here are all 9 categories.\n\nPick a category, add items to cart, then send.';
  } else if (tier === 'regular') {
    bodyText = 'All categories:';
  } else {
    bodyText = 'Pick a category below to browse items.';
  }

  const listMsg = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Full Menu — All Categories' },
      body: { text: bodyText },
      footer: { text: 'Biryani & More Since 1918 | All prices incl. GST' },
      action: {
        button: 'Browse Categories',
        sections: [{ title: 'Categories', rows }],
      },
    },
  };

  await sendWhatsApp(phoneId, token, listMsg);
  await updateSession(db, waId, 'awaiting_menu', '[]', 0);
}

async function handleCategorySelection(context, user, categoryKey, waId, phoneId, token, db) {
  const category = MENU_CATEGORIES[categoryKey];
  if (!category) {
    // Unknown category — fall back to category picker
    return handleShowMenu(context, user, waId, phoneId, token, db);
  }

  // Build MPM sections from category definition
  const sections = category.sections.map(section => ({
    title: section.title,
    product_items: section.items.map(rid => ({ product_retailer_id: rid })),
  }));

  const mpm = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: { type: 'text', text: category.title },
      body: {
        text: 'Add items to your cart, then tap Send.\nSend *"menu"* to browse other categories.',
      },
      footer: { text: 'All prices inclusive of GST' },
      action: {
        catalog_id: CATALOG_ID,
        sections,
      },
    },
  };

  await sendWhatsApp(phoneId, token, mpm);
  // Stay in awaiting_menu state so customer can browse more categories or send order
  await updateSession(db, waId, 'awaiting_menu', '[]', 0);
}

async function handleMealIntent(context, user, intentKey, waId, phoneId, token, db) {
  const intent = MEAL_INTENT_CATEGORIES[intentKey];
  if (!intent) {
    return handleShowMenu(context, user, waId, phoneId, token, db);
  }

  // Send each MPM sequentially (WhatsApp native cart persists across messages)
  for (let i = 0; i < intent.mpms.length; i++) {
    const mpmDef = intent.mpms[i];
    const sections = mpmDef.sections.map(section => ({
      title: section.title,
      product_items: section.items.map(rid => ({ product_retailer_id: rid })),
    }));

    const isLast = i === intent.mpms.length - 1;
    let bodyText = mpmDef.body;
    if (isLast) {
      bodyText += '\n\n✅ Done? Tap Send on your cart!';
    }

    const mpm = {
      messaging_product: 'whatsapp',
      to: waId,
      type: 'interactive',
      interactive: {
        type: 'product_list',
        header: { type: 'text', text: mpmDef.header },
        body: { text: bodyText },
        footer: { text: 'All prices inclusive of GST' },
        action: { catalog_id: CATALOG_ID, sections },
      },
    };

    await sendWhatsApp(phoneId, token, mpm);
    // Small delay between MPMs to avoid rate limiting (except after last)
    if (!isLast) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Send tip: browse more or send cart
  if (intent.mpms.length > 1) {
    await sendWhatsApp(phoneId, token, buildText(waId,
      'Browse all messages above, add items to your cart from any message, then tap *Send*!\n\n' +
      'Send *"menu"* to browse other categories too — your cart stays intact.'));
  }

  await updateSession(db, waId, 'awaiting_menu', '[]', 0);
}

async function handleCounterMenu(context, user, counterKey, waId, phoneId, token, db) {
  const counterMenu = COUNTER_MENUS[counterKey];
  if (!counterMenu || counterMenu.sections.length === 0) {
    await sendWhatsApp(phoneId, token, buildText(waId,
      `Sorry, ${counterMenu?.title || 'this counter'} menu isn\'t available for WhatsApp ordering yet.\n\n` +
      `Send *"menu"* to browse our full menu.`));
    return;
  }

  // Build and send single MPM for this counter's items
  const sections = counterMenu.sections.map(section => ({
    title: section.title,
    product_items: section.items.map(rid => ({ product_retailer_id: rid })),
  }));

  const mpm = {
    messaging_product: 'whatsapp',
    to: waId,
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: { type: 'text', text: counterMenu.title },
      body: { text: counterMenu.greeting + '\n\nAdd items to cart, then tap Send!' },
      footer: { text: 'All prices inclusive of GST | Collect at this counter' },
      action: { catalog_id: CATALOG_ID, sections },
    },
  };

  await sendWhatsApp(phoneId, token, mpm);
  await updateSession(db, waId, 'awaiting_menu', '[]', 0);
}

async function handleMenuState(context, session, user, msg, waId, phoneId, token, db) {
  // Handle list picker selections (intent or category)
  if (msg.type === 'list_reply' && msg.id) {
    if (msg.id.startsWith('intent_')) {
      return handleMealIntent(context, user, msg.id.replace('intent_', ''), waId, phoneId, token, db);
    }
    if (msg.id === 'cat_full_menu') {
      return handleShowFullMenu(context, user, waId, phoneId, token, db);
    }
    if (msg.id.startsWith('cat_')) {
      return handleCategorySelection(context, user, msg.id.replace('cat_', ''), waId, phoneId, token, db);
    }
  }

  // Any text that's not a global command — prompt to use the picker
  await sendWhatsApp(phoneId, token, buildText(waId,
    'Tap *What\'s Cooking?* above to pick a category, or send *"menu"* to see the menu again.'));
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

  // Determine collection points (may be multiple for mixed orders)
  const collection = determineCollectionPoints(cart.items);
  const tier = getCustomerTier(user.total_orders || 0);

  // Save cart and move to payment
  await updateSession(db, waId, 'awaiting_payment', JSON.stringify(cart.items), cart.total);

  // Build order summary
  const itemLines = cart.items.map(c => `${c.qty}x ${c.name} — Rs.${c.price * c.qty}`).join('\n');

  // Build collection point text
  let collectionText;
  if (collection.points.length === 1) {
    collectionText = `*Collect from:* ${collection.points[0].counter}`;
  } else {
    const lines = collection.points.map(p =>
      `• *${p.counter}* — ${p.items.join(', ')}`
    ).join('\n');
    collectionText = `*Collect from:*\n${lines}`;
  }

  let body;
  if (tier === 'new') {
    body = `*Your Order:*\n${itemLines}\n\n` +
      `*Total: Rs.${cart.total}* (incl. GST)\n\n` +
      `${collectionText}\n\n` +
      `_Look for the counter name boards above each station._\n\n` +
      `Tap *Pay Now* to pay via UPI and confirm your order.`;
  } else {
    body = `*Your Order:*\n${itemLines}\n\n` +
      `*Total: Rs.${cart.total}* (incl. GST)\n` +
      `${collectionText}\n\n` +
      `Tap *Pay Now* to pay via UPI.`;
  }

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

function determineCollectionPoints(cartItems) {
  const kitchenItems = cartItems.filter(item => KITCHEN_CATS.has(item.catId));
  const counterItems = cartItems.filter(item => !KITCHEN_CATS.has(item.catId));

  const points = [];

  if (kitchenItems.length > 0) {
    points.push({
      counter: KITCHEN_COUNTER_LABEL,
      items: kitchenItems.map(i => `${i.qty}x ${i.name}`),
    });
  }

  // Group counter items by their counter name
  const counterGroups = {};
  for (const item of counterItems) {
    const counterName = COUNTER_CATS[item.catId] || KITCHEN_COUNTER_LABEL;
    if (!counterGroups[counterName]) counterGroups[counterName] = [];
    counterGroups[counterName].push(`${item.qty}x ${item.name}`);
  }
  for (const [counter, items] of Object.entries(counterGroups)) {
    points.push({ counter, items });
  }

  // Backward-compat: primary + summary string for DB storage
  const primary = points[0]?.counter || KITCHEN_COUNTER_LABEL;
  const summary = points.length === 1
    ? points[0].counter
    : points.map(p => p.counter).join(' + ');

  return { points, primary, summary };
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
  const collection = determineCollectionPoints(cart);
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

  // Create order in DB with payment_pending status (store summary string for reference)
  const result = await db.prepare(
    `INSERT INTO wa_orders (order_code, wa_id, items, subtotal, total, payment_method, payment_status,
     collection_point, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    orderCode, waId, JSON.stringify(cart), total, total, 'upi', 'pending',
    collection.summary, 'payment_pending', now, now
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

    // Detect test mode from webhook URL (?env=test added by test SA 944)
    const isTestWebhook = url.searchParams.get('env') === 'test';
    const webhookOdooUrl = isTestWebhook ? TEST_ODOO_URL : undefined;

    const body = await context.request.json();
    const { stage_id, todo, prep_line_id } = body;

    // Resolve: prep_line_id → pos.prep.order → pos.order → config_id
    const apiKey = context.env.ODOO_API_KEY;
    if (!apiKey || !prep_line_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no api key or prep_line_id' }), { headers: corsHeaders });
    }

    // Step 1: Get prep_order_id from pos.prep.line
    const prepLine = await odooRPC(apiKey, 'pos.prep.line', 'search_read',
      [[['id', '=', prep_line_id]]], { fields: ['prep_order_id', 'product_id'], limit: 1 }, webhookOdooUrl);
    if (!prepLine || !prepLine[0]?.prep_order_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'prep line not found' }), { headers: corsHeaders });
    }
    const prepOrderId = prepLine[0].prep_order_id[0];
    const productId = prepLine[0].product_id?.[0] || null;

    // Step 2: Get pos_order_id from pos.prep.order
    const prepOrder = await odooRPC(apiKey, 'pos.prep.order', 'search_read',
      [[['id', '=', prepOrderId]]], { fields: ['pos_order_id'], limit: 1 }, webhookOdooUrl);
    if (!prepOrder || !prepOrder[0]?.pos_order_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'prep order not found' }), { headers: corsHeaders });
    }
    const posOrderId = prepOrder[0].pos_order_id[0];

    // Step 3: Get config_id + preset_id from pos.order
    const posOrder = await odooRPC(apiKey, 'pos.order', 'search_read',
      [[['id', '=', posOrderId]]], { fields: ['config_id', 'preset_id', 'tracking_number'], limit: 1 }, webhookOdooUrl);
    if (!posOrder || !posOrder[0]) {
      return new Response(JSON.stringify({ ok: true, skipped: 'pos order not found' }), { headers: corsHeaders });
    }
    const configId = posOrder[0].config_id[0];
    const presetId = posOrder[0].preset_id?.[0] || posOrder[0].preset_id || null;
    const trackingNumber = posOrder[0].tracking_number || null;

    // Route by config
    if (configId === POS_CONFIG_ID && !isTestWebhook) {
      // WABA order (config 10) — existing WhatsApp notification flow (production only)
      return handleKdsWebhookWABA(context, corsHeaders, {
        stage_id, todo, prep_line_id, posOrderId, trackingNumber
      });
    }

    if (configId === 6 && presetId === 1) {
      // Captain dine-in order — floor tracking flow
      // Use test config if webhook came from test Odoo
      const floorCfg = isTestWebhook
        ? { isTest: true, odooUrl: TEST_ODOO_URL, stageMap: TEST_FLOOR_STAGE_MAP, t: 'test_' }
        : { isTest: false, odooUrl: ODOO_URL, stageMap: FLOOR_STAGE_MAP, t: '' };
      return handleKdsWebhookFloor(context, corsHeaders, {
        stage_id, todo, prep_line_id, posOrderId, configId, trackingNumber, productId
      }, floorCfg);
    }

    return new Response(JSON.stringify({ ok: true, skipped: 'irrelevant config' }), { headers: corsHeaders });

  } catch (error) {
    console.error('KDS webhook error:', error.message);
    return new Response(JSON.stringify({ ok: true, error: 'internal' }), { headers: corsHeaders });
  }
}

// WABA KDS notification (extracted from original handleKdsWebhook)
async function handleKdsWebhookWABA(context, corsHeaders, data) {
  const { stage_id, todo, prep_line_id, posOrderId, trackingNumber } = data;

  // Quick filter: only react to todo=true on stages we care about
  if (todo !== true) {
    return new Response(JSON.stringify({ ok: true, skipped: 'todo not true' }), { headers: corsHeaders });
  }
  const isPreparing = PREPARING_STAGES.has(stage_id);
  const isReady = READY_STAGES.has(stage_id);
  if (!isPreparing && !isReady) {
    return new Response(JSON.stringify({ ok: true, skipped: 'irrelevant stage' }), { headers: corsHeaders });
  }
  const notificationType = isReady ? 'ready' : 'preparing';

  const db = context.env.DB;
  const waOrder = await db.prepare('SELECT * FROM wa_orders WHERE odoo_order_id = ? AND payment_status = ?')
    .bind(posOrderId, 'paid').first();
  if (!waOrder) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no matching wa_order' }), { headers: corsHeaders });
  }

  // Counter-aware dedup
  const counterName = STAGE_COUNTER_MAP[stage_id] || KITCHEN_COUNTER_LABEL;
  const notified = JSON.parse(waOrder.notified_counters || '{}');
  const counterKey = counterName.replace(/\s+/g, '_').toLowerCase();
  const notifKey = `${notificationType}_${counterKey}`;
  if (notified[notifKey]) {
    return new Response(JSON.stringify({ ok: true, skipped: `already sent ${notifKey}` }), { headers: corsHeaders });
  }
  notified[notifKey] = new Date().toISOString();

  const now = new Date().toISOString();
  const newStatus = notificationType === 'ready' ? 'ready' :
    (waOrder.status === 'ready' ? 'ready' : 'preparing');
  await db.prepare('UPDATE wa_orders SET status = ?, notified_counters = ?, tracking_number = ?, updated_at = ? WHERE id = ?')
    .bind(newStatus, JSON.stringify(notified), trackingNumber, now, waOrder.id).run();

  const waUser = await db.prepare('SELECT total_orders FROM wa_users WHERE wa_id = ?')
    .bind(waOrder.wa_id).first();
  const tier = getCustomerTier(waUser?.total_orders || 0);
  const phoneId = context.env.WA_PHONE_ID;
  const token = context.env.WA_ACCESS_TOKEN;

  if (notificationType === 'preparing') {
    if (tier === 'regular') {
      await sendWhatsApp(phoneId, token, buildText(waOrder.wa_id,
        `*${waOrder.order_code}* — preparing at ${counterName}`));
    } else {
      await sendWhatsApp(phoneId, token, buildText(waOrder.wa_id,
        `Your order *${waOrder.order_code}* is being prepared!\n\n` +
        `*At:* ${counterName}\n` +
        `We'll notify you when it's ready for pickup.`));
    }
  } else if (notificationType === 'ready') {
    if (tier === 'regular') {
      await sendWhatsApp(phoneId, token, buildText(waOrder.wa_id,
        `*${waOrder.order_code}* — READY at ${counterName}` +
        (trackingNumber ? ` (Token ${trackingNumber})` : '')));
    } else {
      await sendWhatsApp(phoneId, token, buildText(waOrder.wa_id,
        `Your order *${waOrder.order_code}* is *READY* for pickup!\n\n` +
        `*Collect from:* ${counterName}\n` +
        (trackingNumber ? `*Token:* ${trackingNumber}\n\n` : '\n') +
        `Please collect it now.`));
    }
  }

  console.log(`KDS→WA: ${notificationType} at ${counterName} sent for ${waOrder.order_code} (Odoo #${posOrderId}, tier: ${tier})`);
  return new Response(JSON.stringify({ ok: true, sent: notificationType, counter: counterName, order: waOrder.order_code }), { headers: corsHeaders });
}

// ═══════════════════════════════════════════════════════════════════
// FLOOR KDS WEBHOOK — Captain dine-in item readiness tracking
// ═══════════════════════════════════════════════════════════════════

// Stage → {counter, status} mapping for floor item tracking
const FLOOR_STAGE_MAP = {
  // Station Done → cooked (item finished at cooking station)
  78: { counter: 'Kitchen Pass', status: 'cooked' },    // Indian Done
  81: { counter: 'Kitchen Pass', status: 'cooked' },    // Chinese Done
  84: { counter: 'Kitchen Pass', status: 'cooked' },    // Tandoor Done
  87: { counter: 'Kitchen Pass', status: 'cooked' },    // FC Done
  // KP Packed (stage 74) → at_counter (waiter READY signal: items packed for pickup)
  74: { counter: 'Kitchen Pass', status: 'at_counter' },
  // KP Completed (stage 63) → picked_up (counter confirms waiter collected)
  63: { counter: 'Kitchen Pass', status: 'picked_up' },
  // Counter Ready → at_counter (waiter READY signal)
  47: { counter: 'Juice Counter', status: 'at_counter' },
  50: { counter: 'Bane Marie', status: 'at_counter' },
  53: { counter: 'Shawarma Counter', status: 'at_counter' },
  56: { counter: 'Grill Counter', status: 'at_counter' },
  // Counter Completed → picked_up (counter confirms waiter collected)
  48: { counter: 'Juice Counter', status: 'picked_up' },
  51: { counter: 'Bane Marie', status: 'picked_up' },
  54: { counter: 'Shawarma Counter', status: 'picked_up' },
  57: { counter: 'Grill Counter', status: 'picked_up' },
};

const FLOOR_STATUS_ORDER = { cooking: 0, cooked: 1, at_counter: 2, picked_up: 3, delivered: 4 };

// Test stage map — only Kitchen Pass + Bain Marie (the two serving counters)
// We do NOT track individual cooking stations (Indian, Chinese, Tandoor, FC).
// Items jump from cooking → at_counter when Kitchen Pass marks "Packed".
const TEST_FLOOR_STAGE_MAP = {
  // Kitchen Pass: Packed → at_counter (strikethrough), Completed → picked_up
  74: { counter: 'Kitchen Pass', status: 'at_counter' },
  63: { counter: 'Kitchen Pass', status: 'picked_up' },
  // Bain Marie: Prepared → at_counter (strikethrough), Completed → picked_up
  50: { counter: 'Bane Marie', status: 'at_counter' },
  51: { counter: 'Bane Marie', status: 'picked_up' },
};

// Category → counter mapping for floor items
// Includes both parent categories (22-30) and new subcategories (70-90)
const FLOOR_COUNTER_MAP = {
  // Parent categories
  22: 'Kitchen Pass', 24: 'Kitchen Pass', 25: 'Kitchen Pass', 26: 'Kitchen Pass',
  27: 'Juice Counter', 28: 'Bane Marie', 29: 'Shawarma Counter', 30: 'Grill Counter',
  // Snacks & Chai
  47: 'Kitchen Pass', 48: 'Kitchen Pass',
  // FC subcategories (parent 26)
  70: 'Kitchen Pass', 71: 'Kitchen Pass', 72: 'Kitchen Pass', 73: 'Kitchen Pass',
  74: 'Kitchen Pass', 75: 'Kitchen Pass', 76: 'Kitchen Pass',
  // Indian subcategories (parent 22)
  77: 'Kitchen Pass', 78: 'Kitchen Pass', 79: 'Kitchen Pass', 80: 'Kitchen Pass',
  81: 'Kitchen Pass', 82: 'Kitchen Pass',
  // Chinese subcategories (parent 24)
  83: 'Kitchen Pass', 84: 'Kitchen Pass', 85: 'Kitchen Pass', 86: 'Kitchen Pass',
  87: 'Kitchen Pass', 88: 'Kitchen Pass',
  // Tandoor subcategories (parent 25)
  89: 'Kitchen Pass', 90: 'Kitchen Pass',
};

// Get floor config based on env=test query param
function getFloorConfig(url) {
  const isTest = new URL(url).searchParams.get('env') === 'test';
  const t = isTest ? 'test_' : '';
  return {
    isTest,
    odooUrl: isTest ? TEST_ODOO_URL : ODOO_URL,
    stageMap: isTest ? TEST_FLOOR_STAGE_MAP : FLOOR_STAGE_MAP,
    t, // table prefix: '' for prod, 'test_' for test
  };
}

async function handleKdsWebhookFloor(context, corsHeaders, data, floorCfg) {
  const { stage_id, todo, prep_line_id, posOrderId, configId, trackingNumber, productId } = data;
  const db = context.env.DB;
  const t = floorCfg?.t || '';
  const stageMap = floorCfg?.stageMap || FLOOR_STAGE_MAP;
  const ok = (msg) => new Response(JSON.stringify({ ok: true, floor: msg }), { headers: corsHeaders });

  // Check if this stage is relevant for floor tracking (stage map is the sole filter)
  const stageInfo = stageMap[stage_id];
  if (!stageInfo) return ok('irrelevant stage for floor');

  // NOTE: We intentionally do NOT check todo !== false here.
  // Intermediate KDS stages (Ready, Packed) fire with todo=true.
  // The stage map filters which stages we care about, and the
  // forward-only status guard below prevents backward/redundant moves.

  // Find or create floor_order
  let floorOrder = await db.prepare(`SELECT * FROM ${t}floor_orders WHERE odoo_order_id = ?`)
    .bind(posOrderId).first();

  if (!floorOrder) {
    // Auto-create from Odoo data (webhook arrived before poller)
    floorOrder = await createFloorOrderFromOdoo(context, posOrderId, configId, floorCfg);
    if (!floorOrder) return ok('could not create floor order');
    // Auto-assign to on-shift waiter
    await autoAssignOrder(db, floorOrder.id, t);
    // Re-read to get assignment data
    floorOrder = await db.prepare(`SELECT * FROM ${t}floor_orders WHERE id = ?`).bind(floorOrder.id).first();
  }

  // Find floor_item by prep_line_id
  let floorItem = await db.prepare(`SELECT * FROM ${t}floor_items WHERE prep_line_id = ?`)
    .bind(prep_line_id).first();

  if (!floorItem && productId) {
    // Fallback: match by product_id within this order (for items not yet bound)
    floorItem = await db.prepare(
      `SELECT * FROM ${t}floor_items WHERE floor_order_id = ? AND odoo_product_id = ? AND prep_line_id IS NULL LIMIT 1`
    ).bind(floorOrder.id, productId).first();

    if (floorItem) {
      await db.prepare(`UPDATE ${t}floor_items SET prep_line_id = ? WHERE id = ?`)
        .bind(prep_line_id, floorItem.id).run();
    }
  }

  if (!floorItem) return ok('no matching floor item');

  // Status advancement (only forward, never backward)
  const newStatus = stageInfo.status;
  if ((FLOOR_STATUS_ORDER[newStatus] || 0) <= (FLOOR_STATUS_ORDER[floorItem.status] || 0)) {
    return ok('status not advancing');
  }

  const now = new Date().toISOString();
  let sql = `UPDATE ${t}floor_items SET status = ?, counter = ?, updated_at = ?`;
  const params = [newStatus, stageInfo.counter, now];

  if (newStatus === 'cooked') { sql += ', cooked_at = ?'; params.push(now); }
  if (newStatus === 'at_counter') { sql += ', at_counter_at = ?'; params.push(now); }
  if (newStatus === 'picked_up') { sql += ', picked_up_at = ?'; params.push(now); }

  sql += ' WHERE id = ?';
  params.push(floorItem.id);
  await db.prepare(sql).bind(...params).run();

  // Update order-level counters
  if (newStatus === 'at_counter') {
    await db.prepare(
      `UPDATE ${t}floor_orders SET items_ready = items_ready + 1, status = CASE WHEN status = 'served' THEN status ELSE 'in_progress' END, updated_at = ? WHERE id = ?`
    ).bind(now, floorOrder.id).run();
  }

  // Update tracking number if we have it
  if (trackingNumber && !floorOrder.tracking_number) {
    await db.prepare(`UPDATE ${t}floor_orders SET tracking_number = ? WHERE id = ?`)
      .bind(trackingNumber, floorOrder.id).run();
  }

  console.log(`KDS→Floor${t ? '[TEST]' : ''}: item ${floorItem.id} (${floorItem.product_name}) → ${newStatus} at ${stageInfo.counter} (order ${floorOrder.odoo_order_name})`);
  return ok(`item ${floorItem.id} → ${newStatus}`);
}

// ═══════════════════════════════════════════════════════════════════
// FLOOR OPERATIONS — Captain/Waiter Coordination System
// ═══════════════════════════════════════════════════════════════════

// Counter adjacency for multi-counter trip suggestions (physical layout from stairs)
const COUNTER_ADJACENCY = ['Kitchen Pass', 'Bane Marie', 'Juice Counter', 'Shawarma Counter', 'Grill Counter'];

// ── Auth helper: validate session token ──
async function validateFloorToken(db, token, requireRole, t) {
  if (!token) return null;
  const staff = await db.prepare(
    `SELECT * FROM ${t}floor_staff WHERE session_token = ? AND is_active = 1`
  ).bind(token).first();
  if (!staff) return null;
  if (staff.token_expires_at && new Date(staff.token_expires_at) < new Date()) return null;
  if (requireRole === 'captain' && !staff.can_captain) return null;
  if (requireRole === 'waiter' && !staff.can_waiter) return null;
  // Update last_seen
  await db.prepare(`UPDATE ${t}floor_staff SET last_seen_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), staff.id).run();
  return staff;
}

// ── Auto-assign order to lowest-load on-shift waiter ──
async function autoAssignOrder(db, orderId, t = '') {
  // Check if order is already assigned
  const order = await db.prepare(`SELECT * FROM ${t}floor_orders WHERE id = ?`).bind(orderId).first();
  if (!order || order.waiter_id) return false; // already assigned or not found

  // Find on-shift waiters (role=waiter first, captain only as fallback)
  let waiters = await db.prepare(
    `SELECT * FROM ${t}floor_staff WHERE is_active = 1 AND role = 'waiter' AND on_shift = 1
     ORDER BY current_load ASC, last_delivery_at ASC NULLS FIRST`
  ).all();

  // Fallback: if no waiter-role staff on shift, try captains who can_waiter
  if (!waiters.results || waiters.results.length === 0) {
    waiters = await db.prepare(
      `SELECT * FROM ${t}floor_staff WHERE is_active = 1 AND role = 'captain' AND can_waiter = 1 AND on_shift = 1
       ORDER BY current_load ASC, last_delivery_at ASC NULLS FIRST`
    ).all();
  }

  if (!waiters.results || waiters.results.length === 0) {
    console.log(`AutoAssign${t ? '[TEST]' : ''}: no on-shift waiters for order ${orderId}`);
    return false; // No on-shift staff — captain will see unassigned alert
  }

  const waiter = waiters.results[0]; // lowest load, longest idle
  const now = new Date().toISOString();

  await db.prepare(
    `UPDATE ${t}floor_orders SET waiter_id = ?, assigned_at = ?, status = 'assigned', auto_assigned = 1, updated_at = ? WHERE id = ?`
  ).bind(waiter.id, now, now, orderId).run();
  await db.prepare(`UPDATE ${t}floor_staff SET current_load = current_load + 1 WHERE id = ?`).bind(waiter.id).run();

  console.log(`AutoAssign${t ? '[TEST]' : ''}: order ${orderId} → ${waiter.name} (load: ${waiter.current_load + 1})`);
  return true;
}

// ── Router for all floor-* actions ──
async function handleFloorAction(context, action, corsHeaders) {
  const db = context.env.DB;
  const method = context.request.method;
  const cfg = getFloorConfig(context.request.url);
  const t = cfg.t; // table prefix: '' for prod, 'test_' for test
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: corsHeaders });
  const err = (msg, status = 400) => json({ error: msg }, status);

  // CORS preflight
  if (method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Login doesn't need auth
  if (action === 'floor-login' && method === 'POST') {
    const body = await context.request.json();
    const pin = String(body.pin || '').trim();
    if (!pin) return err('PIN required');

    const staff = await db.prepare(`SELECT * FROM ${t}floor_staff WHERE pin = ? AND is_active = 1`).bind(pin).first();
    if (!staff) return err('Invalid PIN', 401);

    // Generate session token (32-char hex, valid 12h)
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    await db.prepare(`UPDATE ${t}floor_staff SET session_token = ?, token_expires_at = ?, last_seen_at = ? WHERE id = ?`)
      .bind(token, expires, new Date().toISOString(), staff.id).run();

    return json({
      token, name: staff.name, role: staff.role,
      can_captain: !!staff.can_captain, can_waiter: !!staff.can_waiter,
      staff_id: staff.id, on_shift: !!staff.on_shift
    });
  }

  // All other actions require auth
  const token = context.request.headers.get('Authorization')?.replace('Bearer ', '') || '';
  const staff = await validateFloorToken(db, token, null, t);
  if (!staff) return err('Unauthorized', 401);

  // ── Poll for new Odoo orders (Captain) ──
  if (action === 'floor-poll' && method === 'GET') {
    if (!staff.can_captain) return err('Captain access required', 403);
    return handleFloorPoll(context, db, staff, json, corsHeaders, cfg);
  }

  // ── Dashboard (Captain) ──
  if (action === 'floor-dashboard' && method === 'GET') {
    if (!staff.can_captain) return err('Captain access required', 403);
    return handleFloorDashboard(context, db, staff, json, corsHeaders, t);
  }

  // ── Assign order to waiter (Captain) ──
  if (action === 'floor-assign' && method === 'POST') {
    if (!staff.can_captain) return err('Captain access required', 403);
    const body = await context.request.json();
    return handleFloorAssign(db, body, json, err, t);
  }

  // ── Reassign order (Captain) ──
  if (action === 'floor-reassign' && method === 'POST') {
    if (!staff.can_captain) return err('Captain access required', 403);
    const body = await context.request.json();
    return handleFloorReassign(db, body, json, err, t);
  }

  // ── Set table number (Captain) ──
  if (action === 'floor-set-table' && method === 'POST') {
    if (!staff.can_captain) return err('Captain access required', 403);
    const body = await context.request.json();
    const { order_id, table_number } = body;
    if (!order_id || !table_number) return err('order_id and table_number required');
    const now = new Date().toISOString();
    await db.prepare(`UPDATE ${t}floor_orders SET table_number = ?, updated_at = ? WHERE id = ?`)
      .bind(String(table_number), now, order_id).run();
    return json({ ok: true });
  }

  // ── Waiter's orders + ready batches ──
  if (action === 'floor-my-orders' && method === 'GET') {
    if (!staff.can_waiter) return err('Waiter access required', 403);
    return handleFloorMyOrders(db, staff, json, t);
  }

  // ── Mark items picked up (Waiter) ──
  if (action === 'floor-pickup' && method === 'POST') {
    if (!staff.can_waiter) return err('Waiter access required', 403);
    const body = await context.request.json();
    return handleFloorPickup(db, staff, body, json, err, t);
  }

  // ── Mark items delivered (Waiter) ──
  if (action === 'floor-deliver' && method === 'POST') {
    if (!staff.can_waiter) return err('Waiter access required', 403);
    const body = await context.request.json();
    return handleFloorDeliver(db, staff, body, json, err, t);
  }

  // ── Manage staff (Captain) ──
  if (action === 'floor-manage-staff' && method === 'POST') {
    if (!staff.can_captain) return err('Captain access required', 403);
    const body = await context.request.json();
    return handleFloorManageStaff(db, body, json, err, t);
  }

  // ── List staff (Captain) ──
  if (action === 'floor-staff' && method === 'GET') {
    if (!staff.can_captain) return err('Captain access required', 403);
    const staffList = await db.prepare(
      `SELECT id, name, role, can_captain, can_waiter, is_active, current_load, on_shift, shift_started_at, shift_ended_at, last_delivery_at, last_seen_at FROM ${t}floor_staff ORDER BY name`
    ).all();
    return json({ staff: staffList.results });
  }

  // ── Start shift (any staff) ──
  if (action === 'floor-start-shift' && method === 'POST') {
    const now = new Date().toISOString();
    await db.prepare(
      `UPDATE ${t}floor_staff SET on_shift = 1, shift_started_at = ?, shift_ended_at = NULL WHERE id = ?`
    ).bind(now, staff.id).run();
    return json({ ok: true, on_shift: true, shift_started_at: now });
  }

  // ── End shift (any staff) ──
  if (action === 'floor-end-shift' && method === 'POST') {
    const now = new Date().toISOString();
    await db.prepare(
      `UPDATE ${t}floor_staff SET on_shift = 0, shift_ended_at = ? WHERE id = ?`
    ).bind(now, staff.id).run();
    return json({ ok: true, on_shift: false, shift_ended_at: now });
  }

  // ── Force start/end shift for any staff (Captain only) ──
  if (action === 'floor-force-shift' && method === 'POST') {
    if (!staff.can_captain) return err('Captain access required', 403);
    const body = await context.request.json();
    const { staff_id, on_shift } = body;
    if (!staff_id || on_shift === undefined) return err('staff_id and on_shift required');
    const now = new Date().toISOString();
    if (on_shift) {
      await db.prepare(
        `UPDATE ${t}floor_staff SET on_shift = 1, shift_started_at = ?, shift_ended_at = NULL WHERE id = ?`
      ).bind(now, staff_id).run();
    } else {
      await db.prepare(
        `UPDATE ${t}floor_staff SET on_shift = 0, shift_ended_at = ? WHERE id = ?`
      ).bind(now, staff_id).run();
    }
    return json({ ok: true, staff_id, on_shift: !!on_shift });
  }

  return err('Unknown floor action');
}

// ── Create floor_order from Odoo (when webhook arrives before poller) ──
async function createFloorOrderFromOdoo(context, posOrderId, configId, floorCfg) {
  const db = context.env.DB;
  const apiKey = context.env.ODOO_API_KEY;
  const now = new Date().toISOString();
  const t = floorCfg?.t || '';
  const odooUrl = floorCfg?.odooUrl || ODOO_URL;

  // Fetch order details from Odoo
  // Note: 'note' field doesn't exist on pos.order in Odoo 18; use 'general_customer_note' or skip
  const posOrder = await odooRPC(apiKey, 'pos.order', 'search_read',
    [[['id', '=', posOrderId]]], {
      fields: ['name', 'config_id', 'tracking_number', 'table_id', 'preset_id', 'general_customer_note'],
      limit: 1
    }, odooUrl);
  if (!posOrder?.[0]) return null;

  const order = posOrder[0];
  const tableId = order.table_id?.[0] || null;

  // Get table number if available
  let tableNumber = null;
  if (tableId) {
    const table = await odooRPC(apiKey, 'restaurant.table', 'search_read',
      [[['id', '=', tableId]]], { fields: ['table_number'], limit: 1 }, odooUrl);
    const rawTableNum = table?.[0]?.table_number;
    // table_number can be float like "1.0" — clean to integer string
    tableNumber = rawTableNum != null ? String(rawTableNum).replace(/\.0$/, '') : null;
  }

  // Fetch order lines for items
  const lines = await odooRPC(apiKey, 'pos.order.line', 'search_read',
    [[['order_id', '=', posOrderId], ['product_id', '!=', false]]], {
      fields: ['product_id', 'full_product_name', 'qty', 'note']
    }, odooUrl);
  if (!lines || lines.length === 0) return null;

  // Determine category for each product → counter mapping
  const productIds = lines.map(l => l.product_id[0]);
  const products = await odooRPC(apiKey, 'product.product', 'search_read',
    [[['id', 'in', productIds]]], { fields: ['id', 'pos_categ_ids'] }, odooUrl);
  const prodCatMap = {};
  if (products) {
    for (const p of products) {
      // Use first pos_categ_ids entry that maps to a counter
      const catIds = p.pos_categ_ids || [];
      for (const cid of catIds) {
        if (FLOOR_COUNTER_MAP[cid]) { prodCatMap[p.id] = cid; break; }
      }
      if (!prodCatMap[p.id] && catIds.length > 0) prodCatMap[p.id] = catIds[0];
    }
  }

  // Create floor_order
  await db.prepare(
    `INSERT INTO ${t}floor_orders (odoo_order_id, odoo_order_name, config_id, table_number, tracking_number, status, total_items, customer_note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`
  ).bind(
    posOrderId, order.name, configId, tableNumber,
    order.tracking_number || null, lines.length,
    order.general_customer_note || null, now, now
  ).run();

  const floorOrder = await db.prepare(`SELECT * FROM ${t}floor_orders WHERE odoo_order_id = ?`).bind(posOrderId).first();
  if (!floorOrder) return null;

  // Create floor_items
  for (const line of lines) {
    const productId = line.product_id[0];
    const catId = prodCatMap[productId] || null;
    const counter = catId ? (FLOOR_COUNTER_MAP[catId] || null) : null;
    await db.prepare(
      `INSERT INTO ${t}floor_items (floor_order_id, odoo_product_id, product_name, quantity, category_id, counter, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'cooking', ?, ?)`
    ).bind(floorOrder.id, productId, line.full_product_name || line.product_id[1], line.qty, catId, counter, now, now).run();
  }

  console.log(`Floor${t ? '[TEST]' : ''}: auto-created order ${order.name} (${lines.length} items, table ${tableNumber || '?'})`);
  return floorOrder;
}

// ── Poll Odoo for new config 6 dine-in orders ──
async function handleFloorPoll(context, db, staff, json, corsHeaders, cfg) {
  const apiKey = context.env.ODOO_API_KEY;
  if (!apiKey) return json({ error: 'Odoo not configured' }, 500);
  const t = cfg?.t || '';
  const odooUrl = cfg?.odooUrl || ODOO_URL;

  // Get last poll time
  const pollState = await db.prepare(`SELECT value FROM ${t}floor_poll_state WHERE key = 'last_poll_time'`).first();
  const lastPollTime = pollState?.value || '2026-02-26 00:00:00';

  // Convert stored time to Odoo datetime format: YYYY-MM-DD HH:MM:SS (no T, no Z, no ms)
  const odooLastPoll = lastPollTime.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '');

  // Query Odoo for new config 6 dine-in orders since last poll
  // Note: only need id + state here; createFloorOrderFromOdoo fetches full details separately
  const newOrders = await odooRPC(apiKey, 'pos.order', 'search_read',
    [[['config_id', '=', 6], ['preset_id', '=', 1], ['date_order', '>', odooLastPoll], ['state', 'in', ['draft', 'paid', 'done', 'invoiced']]]],
    { fields: ['id', 'name', 'date_order', 'state'], order: 'date_order asc' },
    odooUrl
  );

  // Odoo-compatible datetime: YYYY-MM-DD HH:MM:SS
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  let created = 0;
  let cancelled = 0;
  let odooError = false;

  if (newOrders === null) {
    // Odoo RPC failed — do NOT advance poll cursor
    odooError = true;
    console.error(`Floor${t ? '[TEST]' : ''} poll: Odoo RPC failed, not advancing poll time (last: ${odooLastPoll}), error: ${odooRPC._lastError}`);
  } else if (newOrders.length > 0) {
    for (const order of newOrders) {
      // Check if we already have this order
      const existing = await db.prepare(`SELECT id FROM ${t}floor_orders WHERE odoo_order_id = ?`).bind(order.id).first();
      if (existing) continue;

      // Handle cancelled orders
      if (order.state === 'cancel') { cancelled++; continue; }

      // Create floor_order + items, then auto-assign to on-shift waiter
      const result = await createFloorOrderFromOdoo(context, order.id, 6, cfg);
      if (result) {
        created++;
        await autoAssignOrder(db, result.id, t);
      }
    }
  }

  // Check for cancelled orders we already track
  const trackedOrders = await db.prepare(
    `SELECT odoo_order_id FROM ${t}floor_orders WHERE status NOT IN ('closed', 'cancelled')`
  ).all();

  if (trackedOrders.results.length > 0) {
    const odooIds = trackedOrders.results.map(o => o.odoo_order_id);
    // Check statuses in batches of 20
    for (let i = 0; i < odooIds.length; i += 20) {
      const batch = odooIds.slice(i, i + 20);
      const statuses = await odooRPC(apiKey, 'pos.order', 'search_read',
        [[['id', 'in', batch], ['state', '=', 'cancel']]],
        { fields: ['id'] },
        odooUrl
      );
      if (statuses) {
        for (const s of statuses) {
          await db.prepare(`UPDATE ${t}floor_orders SET status = 'cancelled', updated_at = ? WHERE odoo_order_id = ?`)
            .bind(now, s.id).run();
          cancelled++;
        }
      }
    }
  }

  // Only advance poll cursor if Odoo call succeeded
  if (!odooError) {
    await db.prepare(`UPDATE ${t}floor_poll_state SET value = ? WHERE key = 'last_poll_time'`).bind(now).run();
  }

  return json({ ok: true, created, cancelled, polled_at: now, odoo_error: odooError || undefined, odoo_error_detail: odooError ? (odooRPC._lastError || 'unknown') : undefined });
}

// ── Captain Dashboard ──
async function handleFloorDashboard(context, db, staff, json, corsHeaders, t = '') {
  const now = new Date().toISOString();

  // Unassigned orders
  const unassigned = await db.prepare(
    `SELECT * FROM ${t}floor_orders WHERE waiter_id IS NULL AND status IN ('new') ORDER BY created_at ASC`
  ).all();

  // Active orders (assigned, not yet closed)
  const active = await db.prepare(
    `SELECT fo.*, fs.name as waiter_name FROM ${t}floor_orders fo LEFT JOIN ${t}floor_staff fs ON fo.waiter_id = fs.id WHERE fo.status IN ('new', 'assigned', 'in_progress') ORDER BY fo.created_at ASC`
  ).all();

  // Waiter data with shift info + today's served count
  const waiters = await db.prepare(
    `SELECT fs.id, fs.name, fs.role, fs.can_captain, fs.can_waiter, fs.current_load,
      fs.on_shift, fs.shift_started_at, fs.shift_ended_at, fs.last_delivery_at, fs.last_seen_at,
      (SELECT COUNT(*) FROM ${t}floor_orders WHERE waiter_id = fs.id AND status IN ('assigned', 'in_progress')) as active_orders,
      (SELECT COUNT(*) FROM ${t}floor_orders WHERE waiter_id = fs.id AND status = 'served' AND DATE(updated_at) = DATE(?)) as served_today
     FROM ${t}floor_staff fs WHERE fs.is_active = 1 AND fs.can_waiter = 1 ORDER BY fs.name`
  ).bind(now).all();

  // Shift stats
  const stats = await db.prepare(
    `SELECT
       COUNT(*) as total_orders,
       SUM(CASE WHEN waiter_id IS NULL AND status = 'new' THEN 1 ELSE 0 END) as unassigned,
       SUM(CASE WHEN status IN ('assigned', 'in_progress') THEN 1 ELSE 0 END) as active,
       SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END) as served
     FROM ${t}floor_orders WHERE status NOT IN ('cancelled', 'closed') AND DATE(created_at) = DATE(?)`
  ).bind(now).first();

  // On-shift waiter count
  const onShiftCount = await db.prepare(
    `SELECT COUNT(*) as cnt FROM ${t}floor_staff WHERE is_active = 1 AND can_waiter = 1 AND on_shift = 1`
  ).first();

  // Get items for active orders + unassigned orders
  const allOrderIds = [...active.results.map(o => o.id), ...unassigned.results.map(o => o.id)];
  let itemsByOrder = {};
  if (allOrderIds.length > 0) {
    const placeholders = allOrderIds.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT * FROM ${t}floor_items WHERE floor_order_id IN (${placeholders}) ORDER BY id`
    ).bind(...allOrderIds).all();
    for (const item of items.results) {
      if (!itemsByOrder[item.floor_order_id]) itemsByOrder[item.floor_order_id] = [];
      itemsByOrder[item.floor_order_id].push(item);
    }
  }

  return json({
    unassigned: unassigned.results.map(o => ({ ...o, items: itemsByOrder[o.id] || [] })),
    active: active.results.map(o => ({ ...o, items: itemsByOrder[o.id] || [] })),
    waiters: waiters.results,
    stats: { ...(stats || { total_orders: 0, unassigned: 0, active: 0, served: 0 }), on_shift_waiters: onShiftCount?.cnt || 0 },
    staff_id: staff.id
  });
}

// ── Assign order to waiter ──
async function handleFloorAssign(db, body, json, err, t = '') {
  const { order_id, waiter_id } = body;
  if (!order_id || !waiter_id) return err('order_id and waiter_id required');

  const order = await db.prepare(`SELECT * FROM ${t}floor_orders WHERE id = ?`).bind(order_id).first();
  if (!order) return err('Order not found', 404);
  if (order.waiter_id) return err('Order already assigned — use reassign');

  const waiter = await db.prepare(`SELECT * FROM ${t}floor_staff WHERE id = ? AND is_active = 1 AND can_waiter = 1`).bind(waiter_id).first();
  if (!waiter) return err('Waiter not found or inactive', 404);

  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE ${t}floor_orders SET waiter_id = ?, assigned_at = ?, status = 'assigned', updated_at = ? WHERE id = ?`
  ).bind(waiter_id, now, now, order_id).run();
  await db.prepare(`UPDATE ${t}floor_staff SET current_load = current_load + 1 WHERE id = ?`).bind(waiter_id).run();

  return json({ ok: true, order_id, waiter_id });
}

// ── Reassign order ──
async function handleFloorReassign(db, body, json, err, t = '') {
  const { order_id, waiter_id } = body;
  if (!order_id || !waiter_id) return err('order_id and waiter_id required');

  const order = await db.prepare(`SELECT * FROM ${t}floor_orders WHERE id = ?`).bind(order_id).first();
  if (!order) return err('Order not found', 404);

  const newWaiter = await db.prepare(`SELECT * FROM ${t}floor_staff WHERE id = ? AND is_active = 1 AND can_waiter = 1`).bind(waiter_id).first();
  if (!newWaiter) return err('Waiter not found or inactive', 404);

  const now = new Date().toISOString();
  // Decrement old waiter load
  if (order.waiter_id) {
    await db.prepare(`UPDATE ${t}floor_staff SET current_load = MAX(0, current_load - 1) WHERE id = ?`).bind(order.waiter_id).run();
  }
  // Assign to new waiter
  await db.prepare(
    `UPDATE ${t}floor_orders SET waiter_id = ?, assigned_at = ?, updated_at = ? WHERE id = ?`
  ).bind(waiter_id, now, now, order_id).run();
  await db.prepare(`UPDATE ${t}floor_staff SET current_load = current_load + 1 WHERE id = ?`).bind(waiter_id).run();

  return json({ ok: true, order_id, old_waiter: order.waiter_id, new_waiter: waiter_id });
}

// ── Waiter's orders (v2: My Orders + Deliver batches by table) ──
async function handleFloorMyOrders(db, staff, json, t = '') {
  // Get all active orders assigned to this waiter
  const orders = await db.prepare(
    `SELECT * FROM ${t}floor_orders WHERE waiter_id = ? AND status IN ('assigned', 'in_progress') ORDER BY created_at ASC`
  ).bind(staff.id).all();

  if (orders.results.length === 0) {
    return json({
      orders: [], deliver_batches: [],
      cooking_count: 0, ready_count: 0, picked_up_count: 0,
      on_shift: !!staff.on_shift
    });
  }

  // Get all items for these orders
  const orderIds = orders.results.map(o => o.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const items = await db.prepare(
    `SELECT fi.*, fo.table_number FROM ${t}floor_items fi JOIN ${t}floor_orders fo ON fi.floor_order_id = fo.id WHERE fi.floor_order_id IN (${placeholders}) ORDER BY fi.id`
  ).bind(...orderIds).all();

  // Count items by status
  let cookingCount = 0, readyCount = 0, pickedUpCount = 0;

  // Build deliver batches: picked_up items grouped by table
  const deliverByTable = {};

  for (const item of items.results) {
    if (item.status === 'cooking' || item.status === 'cooked') cookingCount++;
    else if (item.status === 'at_counter') readyCount++;
    else if (item.status === 'picked_up') {
      pickedUpCount++;
      const table = item.table_number || 'Unknown';
      if (!deliverByTable[table]) deliverByTable[table] = { table_number: table, items: [] };
      deliverByTable[table].items.push({
        id: item.id, product_name: item.product_name, quantity: item.quantity,
        counter: item.counter, picked_up_at: item.picked_up_at, floor_order_id: item.floor_order_id
      });
    }
  }

  // Convert deliver batches to sorted array
  const deliverBatches = Object.values(deliverByTable).map(batch => ({
    table_number: batch.table_number,
    item_count: batch.items.length,
    items: batch.items
  })).sort((a, b) => {
    // Sort by table number (numeric)
    const an = parseInt(a.table_number) || 999;
    const bn = parseInt(b.table_number) || 999;
    return an - bn;
  });

  // Group items by order for "My Orders" view
  const itemsByOrder = {};
  for (const item of items.results) {
    if (!itemsByOrder[item.floor_order_id]) itemsByOrder[item.floor_order_id] = [];
    itemsByOrder[item.floor_order_id].push(item);
  }

  return json({
    orders: orders.results.map(o => ({
      ...o,
      items: (itemsByOrder[o.id] || []).map(i => ({
        id: i.id, product_name: i.product_name, quantity: i.quantity,
        counter: i.counter, status: i.status,
        cooked_at: i.cooked_at, at_counter_at: i.at_counter_at,
        picked_up_at: i.picked_up_at, delivered_at: i.delivered_at
      }))
    })),
    deliver_batches: deliverBatches,
    cooking_count: cookingCount,
    ready_count: readyCount,
    picked_up_count: pickedUpCount,
    on_shift: !!staff.on_shift
  });
}

// ── Mark items as picked up (creates trip) ──
async function handleFloorPickup(db, staff, body, json, err, t = '') {
  const { item_ids, counter } = body;
  if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) return err('item_ids array required');

  const now = new Date().toISOString();
  const placeholders = item_ids.map(() => '?').join(',');

  // Verify all items belong to this waiter's orders and are at_counter
  const items = await db.prepare(
    `SELECT fi.*, fo.waiter_id, fo.table_number FROM ${t}floor_items fi
     JOIN ${t}floor_orders fo ON fi.floor_order_id = fo.id
     WHERE fi.id IN (${placeholders})`
  ).bind(...item_ids).all();

  const validItems = items.results.filter(i => i.waiter_id === staff.id && i.status === 'at_counter');
  if (validItems.length === 0) return err('No valid items to pick up');

  // Create pickup trip
  const tables = [...new Set(validItems.map(i => i.table_number).filter(Boolean))];
  const counters = [...new Set(validItems.map(i => i.counter).filter(Boolean))];

  await db.prepare(
    `INSERT INTO ${t}pickup_trips (waiter_id, counters, tables_served, item_count, started_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(staff.id, JSON.stringify(counters), JSON.stringify(tables), validItems.length, now).run();

  const trip = await db.prepare('SELECT last_insert_rowid() as id').first();
  const tripId = trip?.id || null;

  // Update items to picked_up
  for (const item of validItems) {
    await db.prepare(
      `UPDATE ${t}floor_items SET status = 'picked_up', picked_up_at = ?, trip_id = ?, updated_at = ? WHERE id = ?`
    ).bind(now, tripId, now, item.id).run();
  }

  return json({ ok: true, trip_id: tripId, picked_up: validItems.length, tables, counters });
}

// ── Mark items as delivered to table (v2: accepts table_number OR item_ids) ──
async function handleFloorDeliver(db, staff, body, json, err, t = '') {
  const { item_ids, table_number, trip_id } = body;
  const now = new Date().toISOString();
  let validItems;

  if (table_number) {
    // v2: Deliver ALL picked_up items for this table (one-tap-per-table)
    const items = await db.prepare(
      `SELECT fi.*, fo.waiter_id, fo.id as order_id FROM ${t}floor_items fi
       JOIN ${t}floor_orders fo ON fi.floor_order_id = fo.id
       WHERE fo.waiter_id = ? AND fo.table_number = ? AND fi.status = 'picked_up'`
    ).bind(staff.id, String(table_number)).all();
    validItems = items.results;
  } else if (item_ids && Array.isArray(item_ids) && item_ids.length > 0) {
    // v1 fallback: deliver specific item_ids
    const placeholders = item_ids.map(() => '?').join(',');
    const items = await db.prepare(
      `SELECT fi.*, fo.waiter_id, fo.id as order_id FROM ${t}floor_items fi
       JOIN ${t}floor_orders fo ON fi.floor_order_id = fo.id
       WHERE fi.id IN (${placeholders})`
    ).bind(...item_ids).all();
    validItems = items.results.filter(i => i.waiter_id === staff.id && i.status === 'picked_up');
  } else {
    return err('table_number or item_ids required');
  }

  if (!validItems || validItems.length === 0) return err('No valid items to deliver');

  // Update items to delivered
  const affectedOrders = new Set();
  for (const item of validItems) {
    await db.prepare(
      `UPDATE ${t}floor_items SET status = 'delivered', delivered_at = ?, updated_at = ? WHERE id = ?`
    ).bind(now, now, item.id).run();
    affectedOrders.add(item.order_id);
  }

  // Update order-level counters and check if fully served
  for (const orderId of affectedOrders) {
    const delivered = await db.prepare(
      `SELECT COUNT(*) as cnt FROM ${t}floor_items WHERE floor_order_id = ? AND status = 'delivered'`
    ).bind(orderId).first();
    const total = await db.prepare(
      `SELECT total_items FROM ${t}floor_orders WHERE id = ?`
    ).bind(orderId).first();

    await db.prepare(
      `UPDATE ${t}floor_orders SET items_delivered = ?, updated_at = ? WHERE id = ?`
    ).bind(delivered.cnt, now, orderId).run();

    // If all items delivered, mark order as served
    if (delivered.cnt >= (total?.total_items || 0)) {
      await db.prepare(
        `UPDATE ${t}floor_orders SET status = 'served', updated_at = ? WHERE id = ?`
      ).bind(now, orderId).run();
      // Decrement waiter load
      const order = await db.prepare(`SELECT waiter_id FROM ${t}floor_orders WHERE id = ?`).bind(orderId).first();
      if (order?.waiter_id) {
        await db.prepare(`UPDATE ${t}floor_staff SET current_load = MAX(0, current_load - 1) WHERE id = ?`)
          .bind(order.waiter_id).run();
      }
    }
  }

  // Complete trip if provided
  if (trip_id) {
    await db.prepare(`UPDATE ${t}pickup_trips SET completed_at = ? WHERE id = ?`).bind(now, trip_id).run();
  }

  // Update waiter's last_delivery_at for auto-assign load balancing
  await db.prepare(`UPDATE ${t}floor_staff SET last_delivery_at = ? WHERE id = ?`).bind(now, staff.id).run();

  return json({ ok: true, delivered: validItems.length, orders_served: [...affectedOrders].length });
}

// ── Staff management (Captain) ──
async function handleFloorManageStaff(db, body, json, err, t = '') {
  const { operation, staff_id, name, pin, role, can_captain, can_waiter } = body;
  const now = new Date().toISOString();

  if (operation === 'add') {
    if (!name || !pin) return err('name and pin required');
    const existing = await db.prepare(`SELECT id FROM ${t}floor_staff WHERE pin = ?`).bind(pin).first();
    if (existing) return err('PIN already in use');
    await db.prepare(
      `INSERT INTO ${t}floor_staff (pin, name, role, can_captain, can_waiter, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).bind(pin, name, role || 'waiter', can_captain ? 1 : 0, can_waiter !== false ? 1 : 0, now).run();
    return json({ ok: true, operation: 'add' });
  }

  if (operation === 'toggle') {
    if (!staff_id) return err('staff_id required');
    const s = await db.prepare(`SELECT is_active FROM ${t}floor_staff WHERE id = ?`).bind(staff_id).first();
    if (!s) return err('Staff not found', 404);
    await db.prepare(`UPDATE ${t}floor_staff SET is_active = ?, last_seen_at = ? WHERE id = ?`)
      .bind(s.is_active ? 0 : 1, now, staff_id).run();
    return json({ ok: true, operation: 'toggle', is_active: !s.is_active });
  }

  if (operation === 'update') {
    if (!staff_id) return err('staff_id required');
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (pin !== undefined) { updates.push('pin = ?'); params.push(pin); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (can_captain !== undefined) { updates.push('can_captain = ?'); params.push(can_captain ? 1 : 0); }
    if (can_waiter !== undefined) { updates.push('can_waiter = ?'); params.push(can_waiter ? 1 : 0); }
    if (updates.length === 0) return err('Nothing to update');
    params.push(staff_id);
    await db.prepare(`UPDATE ${t}floor_staff SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
    return json({ ok: true, operation: 'update' });
  }

  if (operation === 'remove') {
    if (!staff_id) return err('staff_id required');
    await db.prepare(`DELETE FROM ${t}floor_staff WHERE id = ?`).bind(staff_id).run();
    return json({ ok: true, operation: 'remove' });
  }

  return err('Unknown operation (add|toggle|update|remove)');
}

// ═══════════════════════════════════════════════════════════════════
// ORDER CONFIRMATION (shared by all payment paths)
// ═══════════════════════════════════════════════════════════════════

async function confirmOrder(context, order, razorpayPaymentId, phoneId, token, db) {
  const now = new Date().toISOString();

  // Load user for tier (before incrementing total_orders — this order not counted yet)
  const waUser = await db.prepare('SELECT total_orders FROM wa_users WHERE wa_id = ?')
    .bind(order.wa_id).first();
  const tier = getCustomerTier(waUser?.total_orders || 0);

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

  // Build confirmation message — adaptive based on customer tier
  const itemLines = cart.map(c => `${c.qty}x ${c.name} — Rs.${c.price * c.qty}`).join('\n');
  const trackingNum = odooResult?.trackingNumber || order.order_code;
  const collection = determineCollectionPoints(cart);

  let confirmMsg;
  if (tier === 'new') {
    // First order ever — full welcome + guidance
    let collectionGuide;
    if (collection.points.length === 1) {
      collectionGuide = `*Collect from:* ${collection.points[0].counter}\n` +
        `_Look for the "${collection.points[0].counter}" board above the counter._`;
    } else {
      const lines = collection.points.map(p =>
        `• *${p.counter}* — ${p.items.join(', ')}`
      ).join('\n');
      collectionGuide = `*Collect from:*\n${lines}\n` +
        `_Look for the counter name boards above each station._`;
    }

    confirmMsg = `*Order confirmed! Payment received.*\n\n` +
      `*Order:* ${order.order_code}\n` +
      `*Token:* ${trackingNum}\n\n` +
      `${itemLines}\n` +
      `*Total: Rs.${order.total}* (UPI Paid)\n\n` +
      `${collectionGuide}\n\n` +
      `We'll send you a message when your food is being prepared, and another when it's ready.\n\n` +
      `_Show your token number at the counter._`;

  } else if (tier === 'regular') {
    // 10+ orders — minimal, fast
    const collectionText = collection.points.length === 1
      ? collection.points[0].counter
      : collection.points.map(p => p.counter).join(' + ');

    confirmMsg = `*Confirmed!* ${order.order_code}\n` +
      `Token: ${trackingNum} | Rs.${order.total}\n` +
      `Collect: ${collectionText}`;

  } else {
    // Learning (1-2) or Familiar (3-9) — balanced
    let collectionText;
    if (collection.points.length === 1) {
      collectionText = `*Collect from:* ${collection.points[0].counter}`;
    } else {
      const lines = collection.points.map(p =>
        `• *${p.counter}* — ${p.items.join(', ')}`
      ).join('\n');
      collectionText = `*Collect from:*\n${lines}`;
    }

    confirmMsg = `*Order confirmed!*\n\n` +
      `*Order:* ${order.order_code}\n` +
      `*Token:* ${trackingNum}\n\n` +
      `${itemLines}\n` +
      `*Total: Rs.${order.total}* (UPI Paid)\n` +
      `${collectionText}\n\n` +
      `_Show token at counter._`;
  }

  await sendWhatsApp(phoneId, token, buildText(order.wa_id, confirmMsg));
  await updateSession(db, order.wa_id, 'idle', '[]', 0);

  console.log(`Order confirmed: ${order.order_code}, Odoo: ${odooResult?.name || 'N/A'}, Tier: ${tier}`);
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
    `*Collect from:* ${order.collection_point || KITCHEN_COUNTER_LABEL}\n` +
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

async function odooRPC(apiKey, model, method, args, kwargs, odooUrl) {
  const targetUrl = odooUrl || ODOO_URL;
  const payload = {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: {
      service: 'object', method: 'execute_kw',
      args: [ODOO_DB, ODOO_UID, apiKey, model, method, args, kwargs || {}],
    },
  };
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Odoo RPC HTTP error: ${res.status} ${res.statusText} (${targetUrl})`);
      odooRPC._lastError = `HTTP ${res.status} ${res.statusText}`;
      return null;
    }
    const data = await res.json();
    if (data.error) {
      const errMsg = data.error.data?.message || data.error.message || JSON.stringify(data.error);
      console.error(`Odoo RPC error (${targetUrl}): ${errMsg}`);
      odooRPC._lastError = errMsg;
      return null;
    }
    odooRPC._lastError = null;
    return data.result;
  } catch (e) {
    console.error(`Odoo RPC fetch error (${targetUrl}): ${e.message}`);
    odooRPC._lastError = `fetch: ${e.message}`;
    return null;
  }
}
odooRPC._lastError = null;

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
          `*Collect from:* ${order.collection_point || KITCHEN_COUNTER_LABEL}\n` +
          `We'll notify you when it's ready.`));
      } else if (newStatus === 'ready') {
        await sendWhatsApp(phoneId, token, buildText(order.wa_id,
          `Your order *${order.order_code}* is *READY*!\n\n` +
          `*Collect from:* ${order.collection_point || KITCHEN_COUNTER_LABEL}\n` +
          (order.tracking_number ? `*Token:* ${order.tracking_number}\n\n` : '\n') +
          `Please collect it now.`));
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
}
