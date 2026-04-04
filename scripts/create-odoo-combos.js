#!/usr/bin/env node
/**
 * Create 10 Hamza Meals combo products in Odoo (ops.hamzahotel.com)
 *
 * Each combo is a product.product in Odoo with:
 * - name: combo display name
 * - list_price: GST-exclusive base price
 * - default_code: HE-CXXX retailer ID
 * - available_in_pos: true
 * - pos_categ_ids: [22] (Indian — for KDS routing)
 * - taxes_id: [[6, 0, [31]]] (5% GST)
 *
 * Run: ODOO_API_KEY=xxx node scripts/create-odoo-combos.js
 */

const ODOO_URL = 'https://ops.hamzahotel.com/jsonrpc';
const ODOO_DB = 'main';
const ODOO_UID = 2;
const API_KEY = process.env.ODOO_API_KEY || '9ee27d7da807853f1d36b0d4967b73878c090d4c';

async function odooRPC(model, method, args, kwargs = {}) {
  const payload = {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: {
      service: 'object', method: 'execute_kw',
      args: [ODOO_DB, ODOO_UID, API_KEY, model, method, args, kwargs],
    },
  };
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.error) {
    console.error(`Odoo error: ${data.error.message || JSON.stringify(data.error)}`);
    return null;
  }
  return data.result;
}

const COMBOS = [
  { code: 'HE-C001', name: '[HE-C001] Ghee Rice + Butter Chicken + Kabab', price: 237 },
  { code: 'HE-C002', name: '[HE-C002] Chicken Biriyani + Chicken Kabab', price: 256 },
  { code: 'HE-C003', name: '[HE-C003] Ghee Rice + Butter Chicken', price: 170 },
  { code: 'HE-C004', name: '[HE-C004] Ghee Rice + Dal Fry + Chicken Kabab', price: 237 },
  { code: 'HE-C005', name: '[HE-C005] Mutton Biriyani + Chicken Lollipop', price: 380 },
  { code: 'HE-C006', name: '[HE-C006] Ghee Rice + Dal Fry', price: 170 },
  { code: 'HE-C007', name: '[HE-C007] Butter Naan + Butter Chicken + Kabab', price: 209 },
  { code: 'HE-C008', name: '[HE-C008] Butter Naan + Butter Chicken', price: 170 },
  { code: 'HE-C009', name: '[HE-C009] Biriyani Rice + Chicken Kabab', price: 170 },
  { code: 'HE-C010', name: '[HE-C010] Premium Family Combo (Serves 2)', price: 475 },
];

// Prices above are GST-exclusive base (customer price / 1.05, rounded)
// Customer pays: base * 1.05 = menu price

async function main() {
  console.log('Creating 10 Hamza Meals combo products in Odoo...\n');

  // First check if any already exist
  const existing = await odooRPC('product.product', 'search_read',
    [[['default_code', 'like', 'HE-C0']]],
    { fields: ['id', 'name', 'default_code', 'list_price'] }
  );

  if (existing && existing.length > 0) {
    console.log('⚠️  Some combos already exist:');
    for (const p of existing) {
      console.log(`  ${p.default_code} → ID ${p.id} — ${p.name} (₹${p.list_price})`);
    }
    console.log('');
  }

  const existingCodes = new Set((existing || []).map(p => p.default_code));
  const results = [];

  for (const combo of COMBOS) {
    if (existingCodes.has(combo.code)) {
      const ex = existing.find(p => p.default_code === combo.code);
      console.log(`✅ ${combo.code} already exists → ID ${ex.id}`);
      results.push({ code: combo.code, odooId: ex.id, name: combo.name });
      continue;
    }

    console.log(`Creating ${combo.code} — ${combo.name}...`);
    const productId = await odooRPC('product.product', 'create', [{
      name: combo.name,
      default_code: combo.code,
      list_price: combo.price,
      type: 'consu',
      available_in_pos: true,
      pos_categ_ids: [[6, 0, [22]]], // Indian category for KDS
      taxes_id: [[6, 0, [31]]],       // 5% GST
    }]);

    if (productId) {
      console.log(`  ✅ Created → ID ${productId}`);
      results.push({ code: combo.code, odooId: productId, name: combo.name });
    } else {
      console.log(`  ❌ Failed to create ${combo.code}`);
      results.push({ code: combo.code, odooId: null, name: combo.name });
    }
  }

  console.log('\n=== RESULTS — Copy to PRODUCTS constant ===\n');
  for (const r of results) {
    if (r.odooId) {
      const combo = COMBOS.find(c => c.code === r.code);
      console.log(`'${r.code}': { name: '${combo.name.replace(/^\[HE-C\d+\] /, '')}', price: ${combo.price}, odooId: ${r.odooId}, catId: 22 },`);
    }
  }
}

main().catch(console.error);
