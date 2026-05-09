#!/usr/bin/env node
// Add Krispy Eats (FC) products to Meta Commerce Catalog
// Includes India compliance fields (origin_country, importer_name, importer_address)
// Usage: ACCESS_TOKEN=your_token node scripts/add-fc-to-catalog.js

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('Set ACCESS_TOKEN env var first');
  process.exit(1);
}

const CATALOG_ID = '1639757440737691';
const GST_RATE = 0.05;
const SITE_URL = 'https://hamzaexpress.in';
const BASE_URL = 'https://hamzaexpress.in/assets/menu';

// India compliance fields (required for SPM/MPM in India)
const COMPLIANCE = {
  origin_country: 'IN',
  importer_name: 'HN Hotels Private Limited',
  importer_address: JSON.stringify({
    street1: 'Near Russell Market, Shivajinagar',
    city: 'Bangalore',
    postal_code: '560051',
    country: 'IN',
  }),
};

// FC products — prices are base (excl GST), catalog shows GST-inclusive
const FC_PRODUCTS = {
  'HE-1366': { name: '1 Pc Fried Chicken',               price: 71 },
  'HE-1367': { name: '2 Pcs Fried Chicken',              price: 143 },
  'HE-1368': { name: '4 Pcs Fried Chicken',              price: 266 },
  'HE-1369': { name: 'Duet Combo',                       price: 181 },
  'HE-1370': { name: 'Regular Combo',                    price: 352 },
  'HE-1371': { name: 'Family Combo',                     price: 666 },
  'HE-1372': { name: 'Party Combo',                      price: 951 },
  'HE-1373': { name: 'Cheesy Fries',                     price: 143 },
  'HE-1374': { name: 'Loaded Fries',                     price: 181 },
  'HE-1375': { name: 'Krispy Popcorn (S)',               price: 76 },
  'HE-1376': { name: 'Krispy Popcorn (M)',               price: 143 },
  'HE-1377': { name: 'Krispy Popcorn (L)',               price: 219 },
  'HE-1378': { name: 'Krispy Shrimps with Mayo (10pcs)', price: 237 },
  'HE-1379': { name: 'Krispy Wings with Mayo (6pcs)',    price: 94 },
  'HE-1380': { name: 'Krispy Lollipop with Mayo (6pcs)', price: 123 },
  'HE-1381': { name: 'Chicken Zinger Burger',            price: 171 },
  'HE-1382': { name: 'Classic Chicken Burger',           price: 124 },
  'HE-1383': { name: 'Chicken Zinger Roll',              price: 152 },
  'HE-1384': { name: 'Mutton Sheekh Roll',               price: 152 },
  'HE-1385': { name: 'Shawarma Roll',                    price: 76 },
  'HE-1386': { name: 'Chicken Popcorn Salad',            price: 181 },
  'HE-1387': { name: 'Chicken Doner Salad',              price: 181 },
  'HE-1388': { name: 'Rice with Chicken Popcorn',        price: 181 },
  'HE-1389': { name: 'Extra Bun',                        price: 14 },
  'HE-1390': { name: 'Extra Mayo',                       price: 19 },
  'HE-1391': { name: 'Soft Drink',                       price: 38 },
};

async function addProduct(retailerId, product) {
  const priceInPaise = Math.round(product.price * (1 + GST_RATE) * 100);
  const imageUrl = `${BASE_URL}/${retailerId}.jpg`;

  const body = {
    retailer_id: retailerId,
    name: product.name,
    description: `Krispy Eats — Fried Chicken by Hamza Express`,
    price: priceInPaise,
    currency: 'INR',
    availability: 'in stock',
    image_url: imageUrl,
    url: SITE_URL,
    ...COMPLIANCE,
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
  const entries = Object.entries(FC_PRODUCTS);
  console.log(`Adding ${entries.length} Krispy Eats products to catalog ${CATALOG_ID}...`);
  console.log('');

  let success = 0;
  let failed = 0;
  const errors = [];
  const created = [];

  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(([id, prod]) => addProduct(id, prod))
    );

    for (let j = 0; j < batch.length; j++) {
      const [retailerId, product] = batch[j];
      const result = results[j];
      if (result.success) {
        success++;
        created.push({ retailerId, name: product.name, catalogId: result.id });
        process.stdout.write('.');
      } else {
        failed++;
        errors.push({ retailerId, name: product.name, error: result.error });
        process.stdout.write('X');
      }
    }

    if (i + 5 < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`\n\nDone! Success: ${success}, Failed: ${failed}`);

  if (created.length > 0) {
    console.log('\nCreated products:');
    for (const c of created) {
      console.log(`  ${c.retailerId}: ${c.name} (catalog ID: ${c.catalogId})`);
    }
  }

  if (errors.length > 0) {
    console.log('\nFailed products:');
    for (const e of errors) {
      console.log(`  ${e.retailerId}: ${e.name} — ${e.error}`);
    }
  }

  // Now add these products to the FC product set
  if (created.length > 0) {
    console.log('\nAdding products to FC product set (1559176248638822)...');
    const productSetId = '1559176248638822';
    const catalogProductIds = created.map(c => c.catalogId);

    const psResponse = await fetch(
      `https://graph.facebook.com/v21.0/${productSetId}/products`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: JSON.stringify({
            retailer_id: { is_any: Object.keys(FC_PRODUCTS) }
          }),
        }),
      }
    );

    const psResult = await psResponse.json();
    console.log('Product set update:', JSON.stringify(psResult));
  }
}

main().catch(console.error);
