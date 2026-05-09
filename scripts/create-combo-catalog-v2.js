#!/usr/bin/env node
/**
 * Add 15 combo products to Meta Commerce Catalog (5 combos × 3 sizes)
 * Groups by item_group_id so each combo shows as one listing with variant picker
 *
 * Run: META_TOKEN=xxx node scripts/create-combo-catalog-v2.js
 */

const CATALOG_ID = '1639757440737691';
const META_TOKEN = process.env.META_TOKEN || process.env.WA_ACCESS_TOKEN;

if (!META_TOKEN) {
  console.error('Set META_TOKEN or WA_ACCESS_TOKEN env variable');
  process.exit(1);
}

const COMPLIANCE = {
  origin_country: 'IN',
  importer_name: 'HN Hotels Private Limited',
  importer_address: '{"street1":"151-154, HKP Road, Near Russell Market, Shivajinagar","city":"Bangalore","postal_code":"560051","country":"IN"}',
};

// 5 combos, each with 3 serving sizes
// menuPrice = GST-inclusive (customer-facing)
// Meta catalog price = menuPrice in paise format "XXXXX INR" (no decimals needed since all are whole rupees)
const COMBOS = [
  {
    group: 'HE-CM01-GRP',
    title: 'Ghee Rice + Kabab + Butter Chicken Combo',
    desc: 'Ghee Rice + 1 Tandoor Roti + 3pc Kabab + 250g Butter Chicken. FREE: Dal + Gravy + Onion Salad',
    image: 'https://hamzaexpress.in/assets/menu/HE-C001.jpg',
    sizes: [
      { rid: 'HE-CM01-1', label: 'For You', menuPrice: 299 },
      { rid: 'HE-CM01-2', label: 'For Two', menuPrice: 629 },
      { rid: 'HE-CM01-3', label: 'For Three', menuPrice: 829 },
    ],
  },
  {
    group: 'HE-CM02-GRP',
    title: 'Ghee Rice + Dal + Brain + Kulcha Combo',
    desc: 'Ghee Rice + 300g Dal Fry + Quarter Brain Dry Fry + 2 Kulcha. FREE: Dal + Gravy + Onion Salad',
    image: 'https://hamzaexpress.in/assets/menu/HE-C004.jpg',
    sizes: [
      { rid: 'HE-CM02-1', label: 'For You', menuPrice: 349 },
      { rid: 'HE-CM02-2', label: 'For Two', menuPrice: 669 },
      { rid: 'HE-CM02-3', label: 'For Three', menuPrice: 989 },
    ],
  },
  {
    group: 'HE-CM03-GRP',
    title: 'Ghee Rice + Dal Fry Combo',
    desc: 'Ghee Rice + 300g Dal Fry. FREE: Dal + Gravy + Onion Salad',
    image: 'https://hamzaexpress.in/assets/menu/HE-C006.jpg',
    sizes: [
      { rid: 'HE-CM03-1', label: 'For You', menuPrice: 139 },
      { rid: 'HE-CM03-2', label: 'For Two', menuPrice: 259 },
      { rid: 'HE-CM03-3', label: 'For Three', menuPrice: 359 },
    ],
  },
  {
    group: 'HE-CM04-GRP',
    title: 'Brain Dry Fry + Butter Naan Combo',
    desc: 'Quarter Brain Dry Fry + 2 Butter Naan. FREE: Dal + Gravy + Onion Salad',
    image: 'https://hamzaexpress.in/assets/menu/HE-C008.jpg',
    sizes: [
      { rid: 'HE-CM04-1', label: 'For You', menuPrice: 199 },
      { rid: 'HE-CM04-2', label: 'For Two', menuPrice: 379 },
      { rid: 'HE-CM04-3', label: 'For Three', menuPrice: 559 },
    ],
  },
  {
    group: 'HE-CM05-GRP',
    title: 'Ghee Rice + Butter Chicken + Naan Combo',
    desc: 'Ghee Rice + 300g Butter Chicken + 1 Butter Naan. FREE: Dal + Gravy + Onion Salad',
    image: 'https://hamzaexpress.in/assets/menu/HE-C003.jpg',
    sizes: [
      { rid: 'HE-CM05-1', label: 'For You', menuPrice: 189 },
      { rid: 'HE-CM05-2', label: 'For Two', menuPrice: 359 },
      { rid: 'HE-CM05-3', label: 'For Three', menuPrice: 529 },
    ],
  },
];

async function metaBatch(requests) {
  const res = await fetch(`https://graph.facebook.com/v25.0/${CATALOG_ID}/items_batch?access_token=${META_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_type: 'PRODUCT_ITEM', allow_upsert: true, requests }),
  });
  return res.json();
}

async function main() {
  console.log('Adding 15 combo items to Meta Commerce Catalog...\n');

  const requests = [];

  for (const combo of COMBOS) {
    for (const size of combo.sizes) {
      const priceStr = `${size.menuPrice}.00 INR`;
      requests.push({
        method: 'CREATE',
        data: {
          id: size.rid,
          item_group_id: combo.group,
          title: `${combo.title} — ${size.label}`,
          description: combo.desc,
          price: priceStr,
          availability: 'in stock',
          condition: 'new',
          brand: 'Hamza Express',
          link: 'https://hamzaexpress.in',
          image_link: combo.image,
          additional_variant_attribute: `Serves:${size.label}`,
          ...COMPLIANCE,
        },
      });
      console.log(`  ${size.rid} — ${combo.title} — ${size.label} (₹${size.menuPrice})`);
    }
  }

  console.log(`\nSending ${requests.length} items to catalog...`);
  const result = await metaBatch(requests);
  console.log('\nMeta API response:', JSON.stringify(result, null, 2));

  if (result.handles) {
    console.log(`\n✅ Batch accepted — handle: ${result.handles[0]}`);
    console.log('Items will be available in catalog within a few minutes.');
  } else if (result.error) {
    console.log(`\n❌ Error: ${result.error.message}`);
  }
}

main().catch(console.error);
