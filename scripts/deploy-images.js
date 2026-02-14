#!/usr/bin/env node
// Phase 4B: Deploy enhanced images to Odoo POS product.product
// Usage: node scripts/deploy-images.js [--start N] [--dry-run]
//
// Reads images from images/enhanced/ and uploads as base64 image_1920 to Odoo
// Odoo auto-generates image_512, image_256, image_128 for POS/KDS displays

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_DIR = path.join(__dirname, '..');
const ENHANCED_DIR = path.join(BASE_DIR, 'images', 'enhanced');
const MANIFEST_PATH = path.join(BASE_DIR, 'images', 'manifest.json');

// Odoo connection
const ODOO_URL = 'ops.hamzahotel.com';
const ODOO_DB = 'main';
const ODOO_UID = 2;
const ODOO_KEY = '9ee27d7da807853f1d36b0d4967b73878c090d4c';

function odooRPC(model, method, args, kwargs = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [ODOO_DB, ODOO_UID, ODOO_KEY, model, method, args, kwargs],
      },
    });

    const options = {
      hostname: ODOO_URL,
      path: '/jsonrpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Odoo error: ${JSON.stringify(json.error.data?.message || json.error.message || json.error).substring(0, 300)}`));
          } else {
            resolve(json.result);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}\nBody: ${data.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const startIdx = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1] || '0', 10);

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('manifest.json not found. Run enhance-images.js first.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const entries = Object.entries(manifest);

  console.log(`\n=== Phase 4B: Deploy Images to Odoo POS ===`);
  console.log(`Total products: ${entries.length}`);
  console.log(`Start index: ${startIdx}`);
  console.log(`Dry run: ${dryRun}\n`);

  // First, verify Odoo connection
  console.log('Verifying Odoo connection...');
  try {
    const test = await odooRPC('product.template', 'search_read',
      [[['id', '=', 1134]]],
      { fields: ['name', 'id'], limit: 1 }
    );
    console.log(`Connected to Odoo. Test product: ${test[0]?.name || 'not found'}\n`);
  } catch (e) {
    console.error(`Odoo connection failed: ${e.message}`);
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (let i = startIdx; i < entries.length; i++) {
    const [retailerId, product] = entries[i];
    const imgPath = path.join(ENHANCED_DIR, `${retailerId}.jpg`);

    if (!fs.existsSync(imgPath)) {
      console.log(`  [SKIP] ${retailerId} "${product.name}" — no enhanced image`);
      skipped++;
      continue;
    }

    const stat = fs.statSync(imgPath);
    if (stat.size < 5000) {
      console.log(`  [SKIP] ${retailerId} "${product.name}" — image too small (${stat.size} bytes)`);
      skipped++;
      continue;
    }

    const num = i + 1;
    const kb = (stat.size / 1024).toFixed(0);
    console.log(`  [${num}/${entries.length}] ${retailerId} "${product.name}" (${kb} KB) → Odoo product ${product.odooId}...`);

    if (dryRun) {
      console.log(`    [DRY] Would upload ${kb} KB to product.product id=${product.odooId}`);
      updated++;
      continue;
    }

    // Read image and convert to base64
    const imgData = fs.readFileSync(imgPath);
    const base64 = imgData.toString('base64');

    try {
      await odooRPC('product.template', 'write', [[product.odooId], { image_1920: base64 }]);
      console.log(`    [OK]  Updated product.template ${product.odooId}`);
      updated++;
    } catch (e) {
      console.log(`    [FAIL] ${e.message.substring(0, 200)}`);
      failed++;
      errors.push({ retailerId, odooId: product.odooId, name: product.name, error: e.message.substring(0, 200) });
    }

    // Small delay to avoid overwhelming Odoo
    await sleep(200);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  if (errors.length > 0) {
    console.log(`\nFailed items:`);
    errors.forEach(e => console.log(`  - ${e.retailerId} (${e.odooId}) "${e.name}": ${e.error}`));
  }
}

main().catch(console.error);
