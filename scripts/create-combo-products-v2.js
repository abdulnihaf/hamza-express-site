#!/usr/bin/env node
/**
 * Create 15 new combo products (5 combos × 3 sizes) in Odoo POS
 *
 * Each combo has: For You (1 person), For Two, For Three
 * Prices are GST-inclusive — Odoo gets base price (÷ 1.05)
 *
 * Run: ODOO_API_KEY=xxx node scripts/create-combo-products-v2.js
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

// 5 combos × 3 sizes = 15 SKUs
// menuPrice = GST-inclusive (what customer pays)
// Odoo list_price = menuPrice / 1.05 (rounded to 2 decimals)
const COMBOS = [
  // Combo 1: Ghee Rice + Tandoor Roti + Kabab + Butter Chicken
  { code: 'HE-CM01-1', name: '[HE-CM01-1] CM1 For You — Rice+Roti+Kabab+BC', menuPrice: 299 },
  { code: 'HE-CM01-2', name: '[HE-CM01-2] CM1 For Two — Rice+Roti+Kabab+BC', menuPrice: 629 },
  { code: 'HE-CM01-3', name: '[HE-CM01-3] CM1 For Three — Rice+Roti+Kabab+BC', menuPrice: 829 },

  // Combo 2: Ghee Rice + Dal Fry + Brain Dry Fry + Kulcha
  { code: 'HE-CM02-1', name: '[HE-CM02-1] CM2 For You — Rice+Dal+Brain+Kulcha', menuPrice: 349 },
  { code: 'HE-CM02-2', name: '[HE-CM02-2] CM2 For Two — Rice+Dal+Brain+Kulcha', menuPrice: 669 },
  { code: 'HE-CM02-3', name: '[HE-CM02-3] CM2 For Three — Rice+Dal+Brain+Kulcha', menuPrice: 989 },

  // Combo 3: Ghee Rice + Dal Fry
  { code: 'HE-CM03-1', name: '[HE-CM03-1] CM3 For You — Rice+Dal', menuPrice: 139 },
  { code: 'HE-CM03-2', name: '[HE-CM03-2] CM3 For Two — Rice+Dal', menuPrice: 259 },
  { code: 'HE-CM03-3', name: '[HE-CM03-3] CM3 For Three — Rice+Dal', menuPrice: 359 },

  // Combo 4: Brain Dry Fry + Butter Naan
  { code: 'HE-CM04-1', name: '[HE-CM04-1] CM4 For You — Brain+Naan', menuPrice: 199 },
  { code: 'HE-CM04-2', name: '[HE-CM04-2] CM4 For Two — Brain+Naan', menuPrice: 379 },
  { code: 'HE-CM04-3', name: '[HE-CM04-3] CM4 For Three — Brain+Naan', menuPrice: 559 },

  // Combo 5: Ghee Rice + Butter Chicken + Butter Naan
  { code: 'HE-CM05-1', name: '[HE-CM05-1] CM5 For You — Rice+BC+Naan', menuPrice: 189 },
  { code: 'HE-CM05-2', name: '[HE-CM05-2] CM5 For Two — Rice+BC+Naan', menuPrice: 359 },
  { code: 'HE-CM05-3', name: '[HE-CM05-3] CM5 For Three — Rice+BC+Naan', menuPrice: 529 },
];

async function main() {
  console.log('Creating 15 combo products (5 combos × 3 sizes) in Odoo...\n');

  // Check existing
  const existing = await odooRPC('product.product', 'search_read',
    [[['default_code', 'like', 'HE-CM']]],
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
      results.push({ code: combo.code, odooId: ex.id, menuPrice: combo.menuPrice });
      continue;
    }

    const basePrice = Math.round((combo.menuPrice / 1.05) * 100) / 100;
    console.log(`Creating ${combo.code} — ${combo.name} (menu ₹${combo.menuPrice}, base ₹${basePrice})...`);

    const productId = await odooRPC('product.product', 'create', [{
      name: combo.name,
      default_code: combo.code,
      list_price: basePrice,
      type: 'consu',
      available_in_pos: true,
      pos_categ_ids: [[6, 0, [22]]], // Indian category → Kitchen Pass KDS
      taxes_id: [[6, 0, [31]]],       // 5% GST
      company_id: 1,
    }]);

    if (productId) {
      console.log(`  ✅ Created → ID ${productId}`);
      results.push({ code: combo.code, odooId: productId, menuPrice: combo.menuPrice });
    } else {
      console.log(`  ❌ Failed to create ${combo.code}`);
      results.push({ code: combo.code, odooId: null, menuPrice: combo.menuPrice });
    }
  }

  // Output for PRODUCTS constant in whatsapp.js
  console.log('\n=== PRODUCTS CONSTANT — Copy to whatsapp.js ===\n');
  for (const r of results) {
    if (r.odooId) {
      const basePrice = Math.round(r.menuPrice / 1.05);
      console.log(`'${r.code}': { name: '${COMBOS.find(c => c.code === r.code).name.replace(/^\[HE-CM\d+-\d\] /, '')}', price: ${basePrice}, odooId: ${r.odooId}, catId: 22 },`);
    }
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total: ${results.length} products`);
  console.log(`Created: ${results.filter(r => r.odooId).length}`);
  console.log(`Failed: ${results.filter(r => !r.odooId).length}`);
}

main().catch(console.error);
