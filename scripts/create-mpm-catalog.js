/**
 * Create/update the 30-item MPM catalog in Meta Commerce
 *
 * 10 Hamza Meals (Combos) — NEW, need new retailer_ids + Odoo products
 * 20 Individual Items — MOST exist already, map to existing retailer_ids
 *
 * Run: node scripts/create-mpm-catalog.js
 * Requires: WA_ACCESS_TOKEN env var
 */

const CATALOG_ID = '1639757440737691';
const BASE_URL = 'https://hamzaexpress.in/assets/menu';

// ═══════════════════════════════════════════════════════════
// FINAL 30 ITEMS — MPM SECTIONS
// ═══════════════════════════════════════════════════════════

const MPM_ITEMS = {
  // ── SECTION 1: Hamza Meals (10 Combos) ──
  // These are NEW — need to be created in Meta catalog + Odoo
  combos: [
    { rid: 'HE-C001', name: 'Ghee Rice + Butter Chicken + Kabab', price: 249, desc: 'GR + BC (250g) + Kabab (2 pcs). Complimentary: Dal + Gravy + Onion Salad. Serves 1.', photo: 'Combo 1 - Ghee Rice Butter Chicken Kebab.jpg' },
    { rid: 'HE-C002', name: 'Chicken Biriyani + Chicken Kabab', price: 269, desc: 'Chicken Biriyani + Kabab (2 pcs). Complimentary: Raita + Gravy + Onion Salad. Serves 1.', photo: 'Combo 2 - Chicken Biryani Kebab.jpg' },
    { rid: 'HE-C003', name: 'Ghee Rice + Butter Chicken', price: 179, desc: 'GR + BC (250g). Complimentary: Dal + Gravy + Onion Salad. Serves 1.', photo: 'Combo 3 - Ghee Rice Butter Chicken.jpg' },
    { rid: 'HE-C004', name: 'Ghee Rice + Dal Fry + Chicken Kabab', price: 249, desc: 'GR + Dal Fry + Kabab (3 pcs). Complimentary: Gravy + Onion Salad. Serves 1.', photo: 'Combo 4 - Ghee Rice Dal Fry Kebab.jpg' },
    { rid: 'HE-C005', name: 'Mutton Biriyani + Chicken Lollipop', price: 399, desc: 'Mutton Biriyani + Chicken Lollipop (2 pcs). Complimentary: Raita + Gravy + Onion Salad. Serves 1.', photo: 'Combo 5 - Mutton Biryani Chicken Lollipop.jpg' },
    { rid: 'HE-C006', name: 'Ghee Rice + Dal Fry', price: 179, desc: 'GR + Dal Fry. Complimentary: Gravy + Onion Salad. Serves 1.', photo: 'Combo 6 - Ghee Rice Dal Fry.jpg' },
    { rid: 'HE-C007', name: 'Butter Naan + Butter Chicken + Kabab', price: 219, desc: '2 Butter Naan + BC (250g) + Kabab (3 pcs). Complimentary: Dal + Gravy + Onion Salad. Serves 1.', photo: 'Combo 7 - Butter Naan Butter Chicken Kebab.jpg' },
    { rid: 'HE-C008', name: 'Butter Naan + Butter Chicken', price: 179, desc: '2 Butter Naan + BC (250g). Complimentary: Dal + Gravy + Onion Salad. Serves 1.', photo: 'Combo 8 - Butter Naan Butter Chicken.jpg' },
    { rid: 'HE-C009', name: 'Biriyani Rice + Chicken Kabab', price: 179, desc: 'Biriyani Rice + Kabab (3 pcs). Complimentary: Raita + Gravy + Onion Salad. Serves 1.', photo: 'Combo 9 - Biryani Rice Kebab.jpg' },
    { rid: 'HE-C010', name: 'Premium Family Combo', price: 499, desc: 'GR (500g) + Kabab (3 pcs) + Brain (1 pc) + BC (250g) + 2 Roti. Complimentary: Dal + Gravy + Onion Salad. Serves 2.', photo: 'Combo 10 - Premium Combo.jpg' },
  ],

  // ── SECTION 2: Biryani & Rice (3 items) — ALL EXIST ──
  biryani: [
    { rid: 'HE-1201', name: 'Chicken Biryani', price: 275, desc: 'Dakhni-style dum biryani with chicken pieces and basmati rice. Served with raita and salan.', photo: 'Chicken Biryani.jpg', exists: true },
    { rid: 'HE-1200', name: 'Mutton Biryani', price: 350, desc: 'Dakhni-style dum biryani with bone-in mutton pieces and aged basmati rice. Served with raita and salan.', photo: 'Mutton Biryani.jpg', exists: true },
    { rid: 'HE-1205', name: 'Ghee Rice', price: 100, desc: 'Fragrant basmati rice cooked in pure ghee with whole spices. Serves 1.', photo: 'Ghee Rice.jpg', exists: true },
  ],

  // ── SECTION 3: Kebabs & Starters (5 items) — ALL EXIST ──
  kebabs: [
    { rid: 'HE-1163', name: 'Chicken Kabab', price: 210, desc: 'Hamza\'s signature charcoal-grilled chicken kebab. Juicy, smoky, served with salad. (Half)', photo: 'Chicken Kebab.jpg', exists: true },
    { rid: 'HE-1135', name: 'Tandoori Chicken', price: 230, desc: 'Chicken marinated overnight in spices and roasted in a tandoor. (Half)', photo: 'Tandoori Chicken.jpg', exists: true },
    { rid: 'HE-1192', name: 'Mutton Brain Dry', price: 170, desc: 'Pan-fried goat brain with Dakhni spices — a rare specialty only at Hamza. (Qtr)', photo: 'Mutton Brain Dry.jpg', exists: true },
    { rid: 'HE-1169', name: 'Boneless Chicken Pepper Dry', price: 235, desc: 'Boneless chicken pieces tossed in cracked black pepper. Dry preparation.', photo: 'Boneless Chicken Pepper Dry.jpg', exists: true },
    { rid: 'HE-1138', name: 'Kalmi Kabab', price: 155, desc: 'Chicken drumsticks marinated in cream and spices, tandoor-roasted.', photo: 'Chicken Kalmi Kebab.jpg', exists: true },
  ],

  // ── SECTION 4: Curries (5 items) — ALL EXIST ──
  curries: [
    { rid: 'HE-1149', name: 'Butter Chicken', price: 225, desc: 'Creamy tomato-based gravy with tender chicken pieces. Pairs well with rice or paratha. (Half)', photo: 'Butter Chicken.jpg', exists: true },
    { rid: 'HE-1160', name: 'Chicken Hamza Special', price: 240, desc: 'Our signature chicken curry — a family recipe since 1918. (Qtr)', photo: null, exists: true },
    { rid: 'HE-1148', name: 'Hyderabadi Chicken', price: 210, desc: 'Tangy, spicy Dakhni-style chicken curry. (Half)', photo: null, exists: true },
    { rid: 'HE-1191', name: 'Mutton Pepper Dry', price: 230, desc: 'Tender mutton pieces with crushed black pepper. Dry preparation. (Qtr)', photo: 'Mutton Pepper Dry.jpg', exists: true },
    { rid: 'HE-1167', name: 'Boneless Singapore Chicken', price: 255, desc: 'Boneless chicken in a sweet-spicy Singapore-style sauce. Dry.', photo: 'Boneless Singapore Chicken.jpg', exists: true },
  ],

  // ── SECTION 5: Breads (2 items) — ALL EXIST ──
  breads: [
    { rid: 'HE-1212', name: 'Kerala Paratha', price: 30, desc: 'Soft flaky layered paratha.', photo: 'Kerala Paratha.jpg', exists: true },
    { rid: 'HE-1220', name: 'Butter Naan', price: 45, desc: 'Soft leavened naan brushed with butter.', photo: null, exists: true },
  ],

  // ── SECTION 6: Chinese & Rolls (3 items) — ALL EXIST ──
  chinese: [
    { rid: 'HE-1235', name: 'Chicken Fried Rice', price: 190, desc: 'Wok-tossed basmati rice with chicken, egg and vegetables.', photo: 'Chicken Fried Rice.jpg', exists: true },
    { rid: 'HE-1236', name: 'Chicken Noodles', price: 190, desc: 'Wok-tossed noodles with chicken and vegetables.', photo: null, exists: true },
    { rid: 'HE-1208', name: 'Chicken Roll', price: 90, desc: 'Paratha roll stuffed with spiced chicken filling.', photo: null, exists: true },
  ],

  // ── SECTION 7: Vegetarian (2 items) — ALL EXIST ──
  veg: [
    { rid: 'HE-1225', name: 'Dal Fry', price: 110, desc: 'Yellow dal tempered with garlic, cumin and spices.', photo: 'Dal Fry.jpg', exists: true },
    { rid: 'HE-1226', name: 'Paneer Butter Masala', price: 180, desc: 'Soft paneer in a creamy tomato-based gravy. Pairs well with naan or rice.', photo: 'Paneer Butter Masala.jpg', exists: true },
  ],
};

// ═══════════════════════════════════════════════════════════
// ANALYSIS: What needs to be created vs updated
// ═══════════════════════════════════════════════════════════

console.log('=== MPM CATALOG ANALYSIS ===\n');

let newItems = 0;
let existingItems = 0;
let missingPhotos = [];

for (const [section, items] of Object.entries(MPM_ITEMS)) {
  console.log(`Section: ${section.toUpperCase()} (${items.length} items)`);
  for (const item of items) {
    if (item.exists) {
      existingItems++;
      console.log(`  ✅ ${item.rid} — ${item.name} (exists in catalog)`);
    } else {
      newItems++;
      console.log(`  🆕 ${item.rid} — ${item.name} (NEEDS CREATION)`);
    }
    if (!item.photo) {
      missingPhotos.push(item.name);
    }
  }
  console.log('');
}

console.log(`\nSummary:`);
console.log(`  Existing items (update price/desc): ${existingItems}`);
console.log(`  New items (create in catalog + Odoo): ${newItems}`);
console.log(`  Missing photos: ${missingPhotos.length}`);
if (missingPhotos.length > 0) {
  console.log(`  → ${missingPhotos.join(', ')}`);
}

console.log(`\n=== PRICE DISCREPANCIES (catalog price ≠ menu price) ===`);
console.log(`NOTE: PRODUCTS array has GST-exclusive base prices.`);
console.log(`Menu CSV has GST-inclusive customer prices.`);
console.log(`Meta catalog price should be: base_price * 1.05 (5% GST)`);
console.log(`Meta catalog expects price in format: "XXX.XX INR"\n`);

// Price check against PRODUCTS constant
const CURRENT_PRODUCTS = {
  'HE-1201': { name: 'Chicken Biryani', currentBase: 238 },
  'HE-1200': { name: 'Mutton Biryani', currentBase: 324 },
  'HE-1205': { name: 'Ghee Rice', currentBase: 1 }, // TEST PRICE!
  'HE-1163': { name: 'Chicken Kabab', currentBase: 171 },
  'HE-1135': { name: 'Tandoori Chicken', currentBase: 190 },
  'HE-1192': { name: 'Mutton Brain Dry', currentBase: 152 },
  'HE-1169': { name: 'Boneless Chicken Pepper Dry', currentBase: 190 },
  'HE-1138': { name: 'Kalmi Kabab', currentBase: 257 },
  'HE-1149': { name: 'Butter Chicken', currentBase: 200 },
  'HE-1160': { name: 'Chicken Hamza Special', currentBase: 210 },
  'HE-1148': { name: 'Hyderabadi Chicken', currentBase: 200 },
  'HE-1191': { name: 'Mutton Pepper Dry', currentBase: 200 },
  'HE-1167': { name: 'Boneless Singapore Chicken', currentBase: 210 },
  'HE-1212': { name: 'Kerala Paratha', currentBase: 29 },
  'HE-1220': { name: 'Butter Naan', currentBase: 43 },
  'HE-1235': { name: 'Chicken Fried Rice', currentBase: 181 },
  'HE-1236': { name: 'Chicken Noodles', currentBase: 181 },
  'HE-1208': { name: 'Chicken Roll', currentBase: 86 },
  'HE-1225': { name: 'Dal Fry', currentBase: 105 },
  'HE-1226': { name: 'Paneer Butter Masala', currentBase: 171 },
};

for (const [section, items] of Object.entries(MPM_ITEMS)) {
  for (const item of items) {
    if (CURRENT_PRODUCTS[item.rid]) {
      const current = CURRENT_PRODUCTS[item.rid];
      const expectedBase = Math.round(item.price / 1.05);
      const currentBase = current.currentBase;
      if (Math.abs(expectedBase - currentBase) > 5) {
        console.log(`⚠️  ${item.rid} ${item.name}:`);
        console.log(`   Menu price: ₹${item.price} → base should be ~₹${expectedBase}`);
        console.log(`   Current PRODUCTS base: ₹${currentBase}`);
        if (currentBase === 1) console.log(`   ⚠️ TEST PRICE — needs to be set to real price!`);
      }
    }
  }
}

console.log('\n=== NEXT STEPS ===');
console.log('1. Create 10 combo products in Odoo (get odooIds)');
console.log('2. Create 10 combo items in Meta catalog via items_batch API');
console.log('3. Update prices for existing items where needed');
console.log('4. Fix Ghee Rice test price (₹1 → ₹95 base)');
console.log('5. Upload combo photos to /assets/menu/');
console.log('6. Update PRODUCTS constant with combos + corrected prices');
console.log('7. Update BESTSELLERS_MPM sections');
