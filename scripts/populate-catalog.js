#!/usr/bin/env node
// Populate Meta Commerce Catalog with all HE menu products
// Usage: ACCESS_TOKEN=your_token node scripts/populate-catalog.js

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('Set ACCESS_TOKEN env var first');
  process.exit(1);
}

const CATALOG_ID = '1639757440737691';
const GST_RATE = 0.05; // 5% GST
const BASE_URL = 'https://hamzaexpress.in/assets/menu';
const SITE_URL = 'https://hamzaexpress.in';

// Category descriptions for product descriptions
const CAT_DESCRIPTIONS = {
  25: 'Tandoori',
  22: 'Indian',
  24: 'Chinese',
  23: 'Biryani & Rice',
  28: 'Bane Marie',
  27: 'Juices & Desserts',
  29: 'Shawarma',
  30: 'Grill',
  26: 'Fried Chicken',
};

// Products from worker code (retailer_id → name, price excl GST, catId)
const PRODUCTS = {
  'HE-1134': { name: 'Grill Chicken', price: 190, catId: 25 },
  'HE-1135': { name: 'Tandoori Chicken', price: 190, catId: 25 },
  'HE-1136': { name: 'Barbique Chicken (Boona)', price: 200, catId: 25 },
  'HE-1137': { name: 'Chicken Tikka', price: 230, catId: 25 },
  'HE-1138': { name: 'Kalmi Kabab', price: 100, catId: 25 },
  'HE-1139': { name: 'Chicken Chops', price: 200, catId: 25 },
  'HE-1140': { name: 'American Chops', price: 240, catId: 25 },
  'HE-1141': { name: 'Haryali Tikka', price: 230, catId: 25 },
  'HE-1142': { name: 'Malai Tikka', price: 250, catId: 25 },
  'HE-1143': { name: 'Andra Tikka', price: 230, catId: 25 },
  'HE-1144': { name: 'Pepper Barbique', price: 200, catId: 25 },
  'HE-1145': { name: 'Pahadi Kabab', price: 210, catId: 25 },
  'HE-1146': { name: 'Mughlai Chicken', price: 200, catId: 22 },
  'HE-1147': { name: 'Chicken Dopiyaza', price: 200, catId: 22 },
  'HE-1148': { name: 'Hyderabadi Chicken', price: 190, catId: 22 },
  'HE-1149': { name: 'Butter Chicken', price: 190, catId: 22 },
  'HE-1150': { name: 'Punjabi Chicken', price: 200, catId: 22 },
  'HE-1151': { name: 'Chicken Kali Mirch', price: 200, catId: 22 },
  'HE-1152': { name: 'Chicken Burtha', price: 220, catId: 22 },
  'HE-1153': { name: 'Chicken Masala', price: 190, catId: 22 },
  'HE-1154': { name: 'Methi Chicken', price: 190, catId: 22 },
  'HE-1155': { name: 'Kadai Chicken', price: 190, catId: 22 },
  'HE-1156': { name: 'Chicken Chatpat', price: 200, catId: 22 },
  'HE-1157': { name: 'Chicken Sagwala', price: 210, catId: 22 },
  'HE-1158': { name: 'Tandoori Chicken Masala', price: 260, catId: 22 },
  'HE-1159': { name: 'Theethar Pepper Roast', price: 280, catId: 22 },
  'HE-1160': { name: 'Chicken Hamza Special', price: 210, catId: 22 },
  'HE-1161': { name: 'Chicken Tikka Masala', price: 280, catId: 22 },
  'HE-1162': { name: 'Kolapuri Chicken', price: 200, catId: 22 },
  'HE-1163': { name: 'Chicken Kabab', price: 170, catId: 24 },
  'HE-1164': { name: 'Chilly Chicken', price: 190, catId: 24 },
  'HE-1165': { name: 'Chicken Manchurian', price: 190, catId: 24 },
  'HE-1166': { name: 'Chicken 65', price: 200, catId: 24 },
  'HE-1167': { name: 'Chicken Singapore', price: 210, catId: 24 },
  'HE-1168': { name: 'Lemon Chicken', price: 210, catId: 24 },
  'HE-1169': { name: 'Chicken Pepper Dry', price: 190, catId: 24 },
  'HE-1170': { name: 'Garlic Chicken', price: 190, catId: 24 },
  'HE-1171': { name: 'Chicken Jalfrize', price: 220, catId: 24 },
  'HE-1172': { name: 'Lollipop', price: 170, catId: 24 },
  'HE-1173': { name: 'Theethar Pepper Dry', price: 260, catId: 24 },
  'HE-1174': { name: 'Hongkong Chicken', price: 210, catId: 24 },
  'HE-1175': { name: 'Chicken Hot & Sour Wings', price: 170, catId: 24 },
  'HE-1176': { name: 'Honey Chicken', price: 230, catId: 24 },
  'HE-1177': { name: 'Mutton Rogan Josh', price: 200, catId: 22 },
  'HE-1178': { name: 'Methi Mutton', price: 200, catId: 22 },
  'HE-1179': { name: 'Mutton Achari', price: 220, catId: 22 },
  'HE-1180': { name: 'Kadai Mutton', price: 210, catId: 22 },
  'HE-1181': { name: 'Mutton Chatpat', price: 220, catId: 22 },
  'HE-1182': { name: 'Mutton Punjabi', price: 220, catId: 22 },
  'HE-1183': { name: 'Mutton Sagwala', price: 220, catId: 22 },
  'HE-1184': { name: 'Mutton Hyderabadi', price: 210, catId: 22 },
  'HE-1185': { name: 'Mutton Masala', price: 200, catId: 22 },
  'HE-1186': { name: 'Mutton Kolapuri', price: 220, catId: 22 },
  'HE-1187': { name: 'Mutton Pepper Roast', price: 210, catId: 22 },
  'HE-1188': { name: 'Mutton Kassa', price: 220, catId: 22 },
  'HE-1189': { name: 'Mutton Tadka', price: 200, catId: 22 },
  'HE-1190': { name: 'Mutton Hamza Special', price: 230, catId: 22 },
  'HE-1191': { name: 'Mutton Pepper Dry', price: 200, catId: 24 },
  'HE-1192': { name: 'Mutton Brain Dry', price: 150, catId: 24 },
  'HE-1193': { name: 'Mutton Jalfrize', price: 230, catId: 24 },
  'HE-1194': { name: 'Mutton Gurda Dry', price: 200, catId: 24 },
  'HE-1195': { name: 'Mutton Sheek Kabab', price: 130, catId: 24 },
  'HE-1196': { name: 'Mutton Paya', price: 130, catId: 22 },
  'HE-1197': { name: 'Mutton Khima', price: 120, catId: 22 },
  'HE-1198': { name: 'Mutton Brain', price: 150, catId: 22 },
  'HE-1199': { name: 'Mutton Chops', price: 130, catId: 22 },
  'HE-1200': { name: 'Mutton Biryani', price: 220, catId: 23 },
  'HE-1201': { name: 'Chicken Biryani', price: 220, catId: 23 },
  'HE-1202': { name: 'Theethar Biryani', price: 280, catId: 23 },
  'HE-1203': { name: 'Biryani Rice', price: 160, catId: 23 },
  'HE-1204': { name: 'Egg Biryani', price: 180, catId: 23 },
  'HE-1205': { name: 'Ghee Rice', price: 80, catId: 23 },
  'HE-1206': { name: 'Jeera Rice', price: 60, catId: 23 },
  'HE-1207': { name: 'Plain Rice', price: 45, catId: 23 },
  'HE-1208': { name: 'Chicken Roll', price: 80, catId: 25 },
  'HE-1209': { name: 'Egg Roll', price: 80, catId: 25 },
  'HE-1210': { name: 'Veg Roll', price: 70, catId: 25 },
  'HE-1211': { name: 'Mutton Sheek Roll', price: 140, catId: 25 },
  'HE-1212': { name: 'Kerala Paratha', price: 25, catId: 25 },
  'HE-1213': { name: 'Ceylon Paratha', price: 27, catId: 25 },
  'HE-1214': { name: 'Coin Paratha', price: 25, catId: 25 },
  'HE-1215': { name: 'Irani Paratha', price: 37, catId: 25 },
  'HE-1216': { name: 'Wheat Paratha', price: 30, catId: 25 },
  'HE-1217': { name: 'Chapathi', price: 18, catId: 25 },
  'HE-1218': { name: 'Roomali Roti', price: 15, catId: 25 },
  'HE-1219': { name: 'Naan', price: 40, catId: 25 },
  'HE-1220': { name: 'Butter Naan', price: 45, catId: 25 },
  'HE-1221': { name: 'Kulcha', price: 45, catId: 25 },
  'HE-1222': { name: 'Garlic Naan', price: 45, catId: 25 },
  'HE-1223': { name: 'Tandoori Paratha', price: 40, catId: 25 },
  'HE-1224': { name: 'Pathla Roti', price: 30, catId: 25 },
  'HE-1225': { name: 'Dal Fry', price: 100, catId: 22 },
  'HE-1226': { name: 'Paneer Butter Masala', price: 160, catId: 22 },
  'HE-1227': { name: 'Kadai Paneer', price: 160, catId: 22 },
  'HE-1228': { name: 'Palak Paneer', price: 170, catId: 22 },
  'HE-1229': { name: 'Paneer Mutter Masala', price: 170, catId: 22 },
  'HE-1230': { name: 'Aloo Gobi', price: 160, catId: 22 },
  'HE-1231': { name: 'Mixed Veg Curry', price: 170, catId: 22 },
  'HE-1232': { name: 'Gobi Masala', price: 170, catId: 22 },
  'HE-1233': { name: 'Dal Tadka', price: 110, catId: 22 },
  'HE-1234': { name: 'Mushroom Masala', price: 190, catId: 22 },
  'HE-1235': { name: 'Chicken Fried Rice', price: 150, catId: 24 },
  'HE-1236': { name: 'Chicken Noodles', price: 150, catId: 24 },
  'HE-1237': { name: 'Mutton Fried Rice', price: 170, catId: 24 },
  'HE-1238': { name: 'Mutton Noodles', price: 170, catId: 24 },
  'HE-1239': { name: 'Egg Fried Rice', price: 120, catId: 24 },
  'HE-1240': { name: 'Egg Noodles', price: 120, catId: 24 },
  'HE-1241': { name: 'Prawns Fried Rice', price: 200, catId: 24 },
  'HE-1242': { name: 'Prawns Noodles', price: 200, catId: 24 },
  'HE-1243': { name: 'Mix Fried Rice', price: 160, catId: 24 },
  'HE-1244': { name: 'Mix Noodles', price: 160, catId: 24 },
  'HE-1245': { name: 'Chicken Schezwan Fried Rice', price: 170, catId: 24 },
  'HE-1246': { name: 'Chicken Schezwan Noodles', price: 170, catId: 24 },
  'HE-1247': { name: 'Veg Fried Rice', price: 120, catId: 24 },
  'HE-1248': { name: 'Veg Noodles', price: 120, catId: 24 },
  'HE-1249': { name: 'Green Salad', price: 60, catId: 28 },
  'HE-1250': { name: 'Cucumber Salad', price: 60, catId: 28 },
  'HE-1251': { name: 'Pineapple Raitha', price: 50, catId: 28 },
  'HE-1252': { name: 'Mix Raitha', price: 50, catId: 28 },
  'HE-1253': { name: 'Fried Fish', price: 200, catId: 24 },
  'HE-1254': { name: 'Fish Masala', price: 200, catId: 24 },
  'HE-1255': { name: 'Chilly Fish', price: 200, catId: 24 },
  'HE-1256': { name: 'Fish Manchurian', price: 200, catId: 24 },
  'HE-1257': { name: 'Kadai Prawns', price: 250, catId: 24 },
  'HE-1258': { name: 'Prawns Chilly Manchurian', price: 250, catId: 24 },
  'HE-1259': { name: 'Prawns Pepper Fry', price: 250, catId: 24 },
};

async function addProduct(retailerId, product) {
  const priceInPaise = Math.round(product.price * (1 + GST_RATE) * 100);
  const category = CAT_DESCRIPTIONS[product.catId] || 'Menu';
  const imageUrl = `${BASE_URL}/${retailerId}.jpg`;

  const body = {
    retailer_id: retailerId,
    name: product.name,
    description: `${category} — Hamza Express (Est. 1918)`,
    price: priceInPaise,
    currency: 'INR',
    availability: 'in stock',
    image_url: imageUrl,
    url: SITE_URL,
  };

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${CATALOG_ID}/products`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const result = await response.json();
  if (result.id) {
    return { success: true, id: result.id };
  } else {
    return { success: false, error: result.error?.message || JSON.stringify(result) };
  }
}

async function main() {
  const entries = Object.entries(PRODUCTS);
  console.log(`Adding ${entries.length} products to catalog ${CATALOG_ID}...`);
  console.log('');

  let success = 0;
  let failed = 0;
  const errors = [];

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(([retailerId, product]) => addProduct(retailerId, product))
    );

    for (let j = 0; j < batch.length; j++) {
      const [retailerId, product] = batch[j];
      const result = results[j];
      if (result.success) {
        success++;
        process.stdout.write('.');
      } else {
        failed++;
        errors.push({ retailerId, error: result.error });
        process.stdout.write('X');
      }
    }

    // Small delay between batches
    if (i + 5 < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n');
  console.log(`Done! Success: ${success}, Failed: ${failed}`);
  if (errors.length > 0) {
    console.log('\nFailed products:');
    for (const e of errors) {
      console.log(`  ${e.retailerId}: ${e.error}`);
    }
  }
}

main().catch(console.error);
