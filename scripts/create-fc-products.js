#!/usr/bin/env node
// Create Krispy Eats (Fried Chicken) products in Odoo POS
// These go into POS Category 26 (Fried Chicken) — KDS routes to FC station (KDS 14)
// All prices are INCLUSIVE of 5% GST — Odoo stores GST-inclusive list_price
// Usage: node scripts/create-fc-products.js

const DB = 'main', UID = 2;
const KEY = process.env.ODOO_API_KEY || '9ee27d7da807853f1d36b0d4967b73878c090d4c';
const URL = 'https://ops.hamzahotel.com/jsonrpc';

async function rpc(model, method, args, kwargs = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'call',
      params: { service: 'object', method: 'execute_kw', args: [DB, UID, KEY, model, method, args, kwargs] }
    })
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

// Krispy Eats menu items from the physical menu
// Prices shown on menu are GST-inclusive (customer-facing prices)
// Odoo list_price = GST-inclusive price / 1.05 (since tax is added on top)
// BUT Hamza Express uses Tax-Included pricing in POS → list_price = menu price directly
// GST tax ID 31 is configured as "price included" in POS
const FC_PRODUCTS = [
  // ── Fried Chicken Pieces ──
  { name: '1 Pc Fried Chicken',              price: 75,  desc: 'Single piece of crispy fried chicken' },
  { name: '2 Pcs Fried Chicken',             price: 150, desc: '2 pieces of crispy fried chicken' },
  { name: '4 Pcs Fried Chicken',             price: 279, desc: '4 pieces of crispy fried chicken' },

  // ── Combos ──
  { name: 'Duet Combo',                      price: 190, desc: '2pcs Fried Chicken + French Fries + Bun + Mayo + 1 Soft Drink' },
  { name: 'Regular Combo',                   price: 370, desc: '4pcs Fried Chicken + French Fries + 2 Bun + Mayo + Soft Drinks' },
  { name: 'Family Combo',                    price: 699, desc: '8pcs Fried Chicken + French Fries + 4 Bun + Mayo + Soft Drinks' },
  { name: 'Party Combo',                     price: 999, desc: '12pcs Fried Chicken + French Fries + 6 Bun + Mayo + Soft Drinks' },

  // ── Sides ──
  { name: 'Cheesy Fries',                    price: 150, desc: 'French fries loaded with melted cheese' },
  { name: 'Loaded Fries',                    price: 190, desc: 'French fries with toppings and sauces' },
  { name: 'Krispy Popcorn (S)',              price: 80,  desc: 'Small portion of crispy chicken popcorn bites' },
  { name: 'Krispy Popcorn (M)',              price: 150, desc: 'Medium portion of crispy chicken popcorn bites' },
  { name: 'Krispy Popcorn (L)',              price: 230, desc: 'Large portion of crispy chicken popcorn bites' },

  // ── Krispy Specials ──
  { name: 'Krispy Shrimps with Mayo (10pcs)', price: 249, desc: '10 crispy fried shrimps served with mayo dip' },
  { name: 'Krispy Wings with Mayo (6pcs)',    price: 99,  desc: '6 crispy chicken wings served with mayo dip' },
  { name: 'Krispy Lollipop with Mayo (6pcs)', price: 129, desc: '6 chicken lollipops served with mayo dip' },

  // ── Burgers with Fries ──
  { name: 'Chicken Zinger Burger',           price: 180, desc: 'Crispy chicken zinger burger served with fries' },
  { name: 'Classic Chicken Burger',          price: 130, desc: 'Classic chicken burger served with fries' },

  // ── Rolls ──
  { name: 'Chicken Zinger Roll',             price: 160, desc: 'Crispy chicken zinger wrapped in a roll' },
  { name: 'Mutton Sheekh Roll',              price: 160, desc: 'Mutton sheekh kabab wrapped in a roll' },
  { name: 'Shawarma Roll',                   price: 80,  desc: 'Chicken shawarma wrapped in a roll' },

  // ── Salads ──
  { name: 'Chicken Popcorn Salad',           price: 190, desc: 'Fresh salad topped with crispy chicken popcorn' },
  { name: 'Chicken Doner Salad',             price: 190, desc: 'Fresh salad topped with chicken doner' },

  // ── Rice Combo ──
  { name: 'Rice with Chicken Popcorn',       price: 190, desc: 'Steamed rice served with crispy chicken popcorn' },

  // ── Extras ──
  { name: 'Extra Bun',                       price: 15,  desc: 'Additional bun' },
  { name: 'Extra Mayo',                      price: 20,  desc: 'Additional mayo dip' },
  { name: 'Soft Drink',                      price: 40,  desc: 'Chilled soft drink' },
];

async function main() {
  console.log(`Creating ${FC_PRODUCTS.length} Krispy Eats products in Odoo...`);
  console.log('POS Category: 26 (Fried Chicken)');
  console.log('');

  const createdProducts = [];
  let success = 0;
  let failed = 0;

  for (const product of FC_PRODUCTS) {
    try {
      // list_price in Odoo: since GST tax (ID 31) is configured as "Tax Included in Price" in POS,
      // we store the base price (excl GST). The POS shows menu price with GST on top.
      // Base price = menu_price / 1.05
      const basePrice = Math.round((product.price / 1.05) * 100) / 100;

      const vals = {
        name: product.name,
        list_price: basePrice,
        type: 'consu',
        sale_ok: true,
        purchase_ok: false,
        available_in_pos: true,
        pos_categ_ids: [[6, 0, [26]]],  // Set POS category to FC (26)
        taxes_id: [[6, 0, [31]]],        // 5% GST S
        description_sale: product.desc,
        company_id: 1,                   // HN Hotels (Hamza Express)
      };

      const productId = await rpc('product.product', 'create', [vals]);
      success++;
      createdProducts.push({
        id: productId,
        name: product.name,
        menuPrice: product.price,
        basePrice: basePrice,
      });
      console.log(`  ✓ ID ${productId}: ${product.name} — ₹${product.price} (base: ₹${basePrice})`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${product.name}: ${err.message}`);
    }
  }

  console.log(`\nDone! Created: ${success}, Failed: ${failed}`);
  console.log('');

  // Output the product mapping for worker code
  console.log('=== WORKER CODE PRODUCTS MAP (copy to whatsapp.js) ===');
  console.log('');
  console.log("  // ── Krispy Eats / Fried Chicken (cat 70 → parent 26) ──");
  for (const p of createdProducts) {
    const retailerId = `HE-${p.id}`;
    const padding = ' '.repeat(Math.max(1, 40 - p.name.length));
    console.log(`  '${retailerId}': { name: '${p.name}',${padding}price: ${p.basePrice}, odooId: ${p.id}, catId: 26 },`);
  }

  console.log('');
  console.log('=== CATALOG SCRIPT PRODUCTS (copy to populate-catalog.js) ===');
  console.log('');
  for (const p of createdProducts) {
    const retailerId = `HE-${p.id}`;
    console.log(`  '${retailerId}': { name: '${p.name}', price: ${p.basePrice}, catId: 26 },`);
  }

  // Save mapping to JSON for image generation script
  const mapping = {};
  for (const p of createdProducts) {
    mapping[`HE-${p.id}`] = {
      name: p.name,
      odooId: p.id,
      menuPrice: p.menuPrice,
      basePrice: p.basePrice,
      catId: 26,
    };
  }

  const fs = require('fs');
  const mappingPath = require('path').join(__dirname, '..', 'images', 'fc-products.json');
  // Ensure images dir exists
  const imagesDir = require('path').join(__dirname, '..', 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
  console.log(`\nProduct mapping saved to: ${mappingPath}`);
}

main().catch(console.error);
