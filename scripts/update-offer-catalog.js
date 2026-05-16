#!/usr/bin/env node
/**
 * Update the Meta Commerce catalog for the live two-item outdoor QR offer.
 *
 * Usage:
 *   META_TOKEN=... node scripts/update-offer-catalog.js
 *   WA_ACCESS_TOKEN=... node scripts/update-offer-catalog.js
 *   node scripts/update-offer-catalog.js --dry-run
 */

const CATALOG_ID = '1639757440737691';
const META_TOKEN = process.env.META_TOKEN || process.env.WA_ACCESS_TOKEN || process.env.ACCESS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

const COMMON = {
  availability: 'in stock',
  condition: 'new',
  brand: 'Hamza Express',
  link: 'https://hamzaexpress.in/go/shawarma',
  origin_country: 'IN',
  importer_name: 'HN Hotels Private Limited',
  importer_address: JSON.stringify({
    street1: 'Near Russell Market, Shivajinagar',
    city: 'Bangalore',
    postal_code: '560051',
    country: 'IN',
  }),
};

const OFFER_ITEMS = [
  {
    id: 'HE-BOGO-CHICKEN-SHAWARMA',
    title: 'BOGO Chicken Shawarma (2 pcs)',
    description: 'Buy 1 Get 1 counter-only UPI offer. Two chicken shawarma rolls for pickup at the Shawarma counter.',
    price: '99.00 INR',
    image_link: 'https://hamzaexpress.in/assets/catalog/offers/2026-05-16/hero-shawarma-roll-branded-4x3-final.png',
  },
  {
    id: 'HE-BOGO-KATHI-ROLL',
    title: 'BOGO Chicken Kathi Roll (2 pcs)',
    description: 'Buy 1 Get 1 counter-only UPI offer. Two chicken kathi rolls for pickup at the Shawarma counter.',
    price: '120.00 INR',
    image_link: 'https://hamzaexpress.in/assets/catalog/offers/2026-05-16/hero-chicken-kathi-roll-branded-4x3.png',
  },
];

async function metaBatch(requests) {
  const response = await fetch(`https://graph.facebook.com/v25.0/${CATALOG_ID}/items_batch?access_token=${META_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_type: 'PRODUCT_ITEM', allow_upsert: true, requests }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const requests = OFFER_ITEMS.map((item) => ({
    method: 'CREATE',
    data: { ...COMMON, ...item },
  }));

  if (DRY_RUN) {
    console.log(JSON.stringify({ catalog_id: CATALOG_ID, requests }, null, 2));
    return;
  }

  if (!META_TOKEN) {
    throw new Error('Set META_TOKEN, WA_ACCESS_TOKEN, or ACCESS_TOKEN before running.');
  }

  console.log(`Updating ${requests.length} offer items in catalog ${CATALOG_ID}...`);
  const result = await metaBatch(requests);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
