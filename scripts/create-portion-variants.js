#!/usr/bin/env node
/**
 * Create portion variant products in Odoo + Meta catalog
 *
 * For 7 items that have Half/Full/Quarter portions:
 * 1. Create new Odoo products for each variant
 * 2. Create Meta catalog items with item_group_id + additional_variant_attribute
 * 3. Update existing default-portion items with item_group_id too
 */

const ODOO_URL = 'https://ops.hamzahotel.com/jsonrpc';
const ODOO_DB = 'main';
const ODOO_UID = 2;
const API_KEY = '9ee27d7da807853f1d36b0d4967b73878c090d4c';
const CATALOG_ID = '1639757440737691';
const META_TOKEN = process.env.META_TOKEN || 'EAAdjKyLVeusBRPJkZAZBebr88mClnso7avcC9IAnKldOm3HbyKvheaBZBEC6OeD3WWPoEVRJqYfJxHHtvsqD6pFpBvslPsb3OU5s9T6ZAA9yz0n2VczFPMsWfvFQKZCJhwvpAk7vHrvj5FNxrZBuHcibvEy5dwctbFbid2EDInUXc171WUsRizXlGopVb7U1UKXbUYm8V2gTZCJ';

// ── Variant definitions ──
// existing = already in catalog (default portion), new variants to create
const VARIANTS = [
  {
    group: 'HE-1163-GRP',
    name: 'Chicken Kabab',
    image: 'https://hamzaexpress.in/assets/menu/HE-1163.jpg',
    catId: 25,
    desc: "Hamza's signature charcoal-grilled chicken kebab. Juicy, smoky, served with salad.",
    existing: { rid: 'HE-1163', portion: 'Half', price: 171 },
    variants: [
      { rid: 'HE-1163-Q', portion: 'Quarter', price: 95, odooName: '[HE-1163-Q] Chicken Kabab — Quarter' },
      { rid: 'HE-1163-F', portion: 'Full', price: 343, odooName: '[HE-1163-F] Chicken Kabab — Full' },
    ]
  },
  {
    group: 'HE-1135-GRP',
    name: 'Tandoori Chicken',
    image: 'https://hamzaexpress.in/assets/menu/HE-1135.jpg',
    catId: 25,
    desc: 'Chicken marinated overnight in spices and roasted in tandoor.',
    existing: { rid: 'HE-1135', portion: 'Half', price: 190 },
    variants: [
      { rid: 'HE-1135-F', portion: 'Full', price: 381, odooName: '[HE-1135-F] Tandoori Chicken — Full' },
    ]
  },
  {
    group: 'HE-1192-GRP',
    name: 'Mutton Brain Dry',
    image: 'https://hamzaexpress.in/assets/menu/HE-1192.jpg',
    catId: 22,
    desc: 'Pan-fried goat brain with Dakhni spices. A rare specialty only at Hamza.',
    existing: { rid: 'HE-1192', portion: 'Quarter', price: 152 },
    variants: [
      { rid: 'HE-1192-H', portion: 'Half', price: 305, odooName: '[HE-1192-H] Mutton Brain Dry — Half' },
      { rid: 'HE-1192-F', portion: 'Full', price: 610, odooName: '[HE-1192-F] Mutton Brain Dry — Full' },
    ]
  },
  {
    group: 'HE-1149-GRP',
    name: 'Butter Chicken',
    image: 'https://hamzaexpress.in/assets/menu/HE-1149.jpg',
    catId: 22,
    desc: 'Creamy tomato-based gravy with tender chicken pieces. Pairs with rice or naan.',
    existing: { rid: 'HE-1149', portion: 'Half', price: 200 },
    variants: [
      { rid: 'HE-1149-F', portion: 'Full', price: 429, odooName: '[HE-1149-F] Butter Chicken — Full' },
    ]
  },
  {
    group: 'HE-1160-GRP',
    name: 'Chicken Hamza Special',
    image: 'https://hamzaexpress.in/assets/menu/HE-1160.jpg',
    catId: 22,
    desc: "Our signature chicken curry — a family recipe since 1918.",
    existing: { rid: 'HE-1160', portion: 'Quarter', price: 210 },
    variants: [
      { rid: 'HE-1160-H', portion: 'Half', price: 457, odooName: '[HE-1160-H] Chicken Hamza Special — Half' },
      { rid: 'HE-1160-F', portion: 'Full', price: 686, odooName: '[HE-1160-F] Chicken Hamza Special — Full' },
    ]
  },
  {
    group: 'HE-1148-GRP',
    name: 'Hyderabadi Chicken',
    image: 'https://hamzaexpress.in/assets/menu/HE-1148.jpg',
    catId: 22,
    desc: 'Tangy, spicy Dakhni-style chicken curry.',
    existing: { rid: 'HE-1148', portion: 'Half', price: 200 },
    variants: [
      { rid: 'HE-1148-F', portion: 'Full', price: 419, odooName: '[HE-1148-F] Hyderabadi Chicken — Full' },
    ]
  },
  {
    group: 'HE-1191-GRP',
    name: 'Mutton Pepper Dry',
    image: 'https://hamzaexpress.in/assets/menu/HE-1191.jpg',
    catId: 22,
    desc: 'Tender mutton pieces with crushed black pepper. Dry preparation.',
    existing: { rid: 'HE-1191', portion: 'Quarter', price: 200 },
    variants: [
      { rid: 'HE-1191-H', portion: 'Half', price: 400, odooName: '[HE-1191-H] Mutton Pepper Dry — Half' },
      { rid: 'HE-1191-F', portion: 'Full', price: 800, odooName: '[HE-1191-F] Mutton Pepper Dry — Full' },
    ]
  },
];

async function odooRPC(model, method, args, kwargs = {}) {
  const payload = {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: { service: 'object', method: 'execute_kw', args: [ODOO_DB, ODOO_UID, API_KEY, model, method, args, kwargs] },
  };
  const res = await fetch(ODOO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (data.error) { console.error(`Odoo error:`, data.error.message || data.error); return null; }
  return data.result;
}

async function metaBatch(requests) {
  const res = await fetch(`https://graph.facebook.com/v25.0/${CATALOG_ID}/items_batch?access_token=${META_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_type: 'PRODUCT_ITEM', allow_upsert: true, requests }),
  });
  return res.json();
}

async function main() {
  console.log('=== Creating Portion Variants ===\n');

  const allMetaRequests = [];
  const productsEntries = [];

  for (const item of VARIANTS) {
    console.log(`\n${item.name} (group: ${item.group})`);

    // Step 1: Update existing item with item_group_id
    console.log(`  Updating existing ${item.existing.rid} with item_group_id...`);
    allMetaRequests.push({
      method: 'UPDATE',
      data: {
        id: item.existing.rid,
        item_group_id: item.group,
        additional_variant_attribute: `Portion:${item.existing.portion}`,
        title: `${item.name} — ${item.existing.portion}`,
      }
    });

    // Step 2: Create new variant items
    for (const v of item.variants) {
      // Create in Odoo
      console.log(`  Creating Odoo product: ${v.odooName}...`);
      const odooId = await odooRPC('product.product', 'create', [{
        name: v.odooName,
        default_code: v.rid,
        list_price: v.price,
        type: 'consu',
        available_in_pos: true,
        pos_categ_ids: [[6, 0, [item.catId]]],
        taxes_id: [[6, 0, [31]]],
      }]);

      if (odooId) {
        console.log(`    ✅ Odoo ID: ${odooId}`);
        productsEntries.push(`'${v.rid}': { name: '${item.name} — ${v.portion}', price: ${v.price}, odooId: ${odooId}, catId: ${item.catId} },`);
      } else {
        console.log(`    ❌ Failed`);
        continue;
      }

      // Create in Meta catalog
      const catalogPrice = (v.price * 1.05).toFixed(2);
      allMetaRequests.push({
        method: 'CREATE',
        data: {
          id: v.rid,
          item_group_id: item.group,
          title: `${item.name} — ${v.portion}`,
          description: `${item.desc} ${v.portion} portion.`,
          price: `${catalogPrice} INR`,
          availability: 'in stock',
          condition: 'new',
          brand: 'Hamza Express',
          link: 'https://hamzaexpress.in',
          image_link: item.image,
          origin_country: 'IN',
          importer_name: 'HN Hotels Private Limited',
          importer_address: '{"street1":"Near Russell Market, Shivajinagar","city":"Bangalore","postal_code":"560051","country":"IN"}',
          additional_variant_attribute: `Portion:${v.portion}`,
        }
      });
    }
  }

  // Step 3: Send all Meta catalog requests in one batch
  console.log(`\nSending ${allMetaRequests.length} Meta catalog requests...`);
  const metaResult = await metaBatch(allMetaRequests);
  console.log('Meta result:', JSON.stringify(metaResult, null, 2));

  // Step 4: Output PRODUCTS entries
  console.log('\n=== Add to PRODUCTS constant in whatsapp.js ===\n');
  for (const entry of productsEntries) {
    console.log(`  ${entry}`);
  }
}

main().catch(console.error);
