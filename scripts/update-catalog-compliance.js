#!/usr/bin/env node
// Update all Meta Commerce Catalog products with India compliance fields
// Required for SPM/MPM messages to work in India
// Usage: ACCESS_TOKEN=your_token node scripts/update-catalog-compliance.js

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('Set ACCESS_TOKEN env var first');
  process.exit(1);
}

const CATALOG_ID = '1639757440737691';

// India compliance fields
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

async function getAllProductIds() {
  let products = [];
  let url = `https://graph.facebook.com/v21.0/${CATALOG_ID}/products?fields=id,retailer_id&limit=200`;

  while (url) {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    });
    const data = await response.json();
    if (data.error) {
      console.error('Error fetching products:', data.error.message);
      process.exit(1);
    }
    products = products.concat(data.data || []);
    url = data.paging?.next || null;
  }

  return products;
}

async function updateProduct(productId, retailerId) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${productId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(COMPLIANCE),
    }
  );

  const result = await response.json();
  if (result.success) {
    return { success: true };
  } else {
    return { success: false, error: result.error?.message || JSON.stringify(result) };
  }
}

async function main() {
  console.log('Fetching all catalog products...');
  const products = await getAllProductIds();
  console.log(`Found ${products.length} products\n`);

  let success = 0;
  let failed = 0;
  const errors = [];

  // Process in batches of 10
  for (let i = 0; i < products.length; i += 10) {
    const batch = products.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(p => updateProduct(p.id, p.retailer_id))
    );

    for (let j = 0; j < batch.length; j++) {
      const { id, retailer_id } = batch[j];
      const result = results[j];
      if (result.success) {
        success++;
        process.stdout.write('.');
      } else {
        failed++;
        errors.push({ id, retailer_id, error: result.error });
        process.stdout.write('X');
      }
    }

    // Small delay between batches
    if (i + 10 < products.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`\n\nDone! Success: ${success}, Failed: ${failed}`);
  if (errors.length > 0) {
    console.log('\nFailed products:');
    for (const e of errors) {
      console.log(`  ${e.retailer_id} (${e.id}): ${e.error}`);
    }
  }
}

main().catch(console.error);
