#!/usr/bin/env node
// Phase 3: AI Enhancement + Generation via Gemini 2.5 Flash Image
// Usage: GEMINI_API_KEY=xxx node scripts/enhance-images.js
// Or: node scripts/enhance-images.js (uses hardcoded key)
//
// Strategy:
// - Items WITH Swiggy photos: enhance (send photo + enhance prompt)
// - Items WITHOUT photos: send a REFERENCE photo from a similar dish + generate prompt
//   This ensures visual consistency across the entire menu

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

const BASE_DIR = path.join(__dirname, '..');
const SOURCE_DIR = path.join(BASE_DIR, 'images', 'source');
const ENHANCED_DIR = path.join(BASE_DIR, 'images', 'enhanced');
const MANIFEST_PATH = path.join(BASE_DIR, 'images', 'manifest.json');

const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBnkKEcWrNkJTRL9wtzeGmFSsBvgoPyu9c';
const MODEL = 'gemini-2.5-flash-image';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ── Category references: for items without photos, use a similar dish as reference ──
// catId → list of retailerIds that have Swiggy source images (best references)
function buildCategoryRefs(manifest) {
  const refs = {};
  for (const [id, prod] of Object.entries(manifest)) {
    if (prod.source === 'swiggy' && prod.sourceFile) {
      if (!refs[prod.catId]) refs[prod.catId] = [];
      refs[prod.catId].push({ id, ...prod });
    }
  }
  return refs;
}

// Find best reference image for a product that needs generation
function findReference(product, manifest, categoryRefs) {
  const catId = product.catId;

  // 1. Try same category first
  if (categoryRefs[catId] && categoryRefs[catId].length > 0) {
    // Pick the most visually similar type
    const name = product.name.toLowerCase();
    const candidates = categoryRefs[catId];

    // Try to match by cooking style keywords
    const keywords = ['biryani', 'rice', 'noodles', 'curry', 'masala', 'dry', 'fry', 'roast',
                       'kebab', 'tikka', 'roll', 'paratha', 'naan', 'roti', 'dal', 'paneer',
                       'fish', 'prawns', 'mutton', 'chicken'];
    for (const kw of keywords) {
      if (name.includes(kw)) {
        const match = candidates.find(c => c.name.toLowerCase().includes(kw));
        if (match) return match;
      }
    }
    // Fallback: first item in same category
    return candidates[0];
  }

  // 2. Fallback: any Indian curry image
  const fallbackCats = [22, 24, 25, 23]; // Indian, Chinese, Tandoor, Biryani
  for (const fc of fallbackCats) {
    if (categoryRefs[fc] && categoryRefs[fc].length > 0) {
      return categoryRefs[fc][0];
    }
  }
  return null;
}

// ── Prompts ──
// Brand DNA: Hamza Express is a heritage QSR (Est. 1918) — warm, traditional, earthy tones
// Colors: Burnt Sienna #713520, Tan #D2B48C, Off-White #FAF3E3
// Feel: Heritage Indian restaurant, warm sepia/golden tones, NOT modern/minimalist
const ENHANCE_PROMPT = `You are a professional food photographer for "Hamza Express", a heritage North Indian restaurant established in 1918 in Bangalore.

Brand colors: Burnt Sienna (#713520), Tan (#D2B48C), Off-White (#FAF3E3). The brand has a warm, traditional, heritage feel.

Enhance this food photo:
- REMOVE any text overlays, watermarks, logos, or labels completely
- Warm golden-amber lighting — like a traditional Indian restaurant with warm tungsten bulbs
- Make colors rich and appetizing — deep reds, warm oranges, golden browns of Indian cuisine
- Background should be a warm dark wood table or dark matte surface with warm undertones (NOT cold/grey/modern)
- Food fills ~70-80% of frame, centered
- Must look COMPLETELY REAL and authentic — like a photo taken in a busy Indian restaurant kitchen
- Warm sepia-tinted color grading — earthy, heritage feel matching the brand
- Dish should look freshly served and steaming
- Square 1:1 composition
- No text, no watermarks, no logos — only food

CRITICAL: Do NOT change the actual food item. Keep the same dish — only enhance lighting, warmth, framing, and background.

Output a single enhanced photo.`;

function getGeneratePrompt(dishName) {
  return `You are a professional food photographer for "Hamza Express", a heritage North Indian restaurant established in 1918 in Bangalore.

Brand colors: Burnt Sienna (#713520), Tan (#D2B48C), Off-White (#FAF3E3). Warm, traditional, heritage aesthetic.

I'm providing a REFERENCE photo of a similar dish — match its STYLE, LIGHTING, and PRESENTATION.
Generate a NEW photorealistic food photo of: "${dishName}"

The reference is for visual consistency only — the food must be "${dishName}", NOT the reference dish.

Requirements:
- Match the lighting, color warmth, and serving vessel style of the reference image
- Warm golden-amber lighting — traditional Indian restaurant feel, warm tungsten
- Background: warm dark wood table or dark surface with warm brown undertones
- Rich, deep colors — reds, oranges, golden browns of authentic Indian cuisine
- Food fills ~70-80% of frame, centered
- Garnished authentically (coriander, onion rings, green chillies, lemon wedge as appropriate)
- Must look COMPLETELY REAL — like a DSLR photo in a busy Indian restaurant
- Square 1:1 composition
- Warm sepia-tinted color grading — earthy, heritage feel
- Curry/gravy: copper or steel handi, clay pot, or traditional serving bowl
- Dry/starter: steel plate or wooden board with garnish
- Rice/biryani: traditional dum pot or steel plate with raita on side
- Bread/roti/paratha: stacked on plate, in basket, or on wooden board
- Roll: sliced showing filling, on plate or paper
- Salad/raita: small steel katori bowl
- Noodles/fried rice: plate or bowl, stir-fry style

No text, no watermarks. Output a single photorealistic food photo of "${dishName}".`;
}

function getGeneratePromptNoRef(dishName) {
  return `You are a professional food photographer for "Hamza Express", a heritage North Indian restaurant established in 1918 in Bangalore.

Brand colors: Burnt Sienna (#713520), Tan (#D2B48C), Off-White (#FAF3E3). Warm, traditional, heritage aesthetic.

Generate a photorealistic food photo of: "${dishName}"

Requirements:
- Warm golden-amber lighting — traditional Indian restaurant feel
- Background: warm dark wood table or dark surface with earthy tones
- Rich, vibrant Indian cuisine colors — deep reds, warm oranges, golden browns
- Food fills ~70-80% of frame, centered in traditional serving vessels
- Garnished authentically (coriander, onion rings, green chillies as appropriate)
- Must look COMPLETELY REAL — like a DSLR photo in a restaurant
- Square 1:1 composition
- Warm sepia-tinted color grading — heritage feel
- No text, no watermarks

Output a single photorealistic food photo.`;
}

// ── Gemini API call ──
function callGemini(parts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const url = new URL(API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
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
          if (res.statusCode === 429) {
            resolve({ rateLimited: true, retryAfter: parseInt(res.headers['retry-after'] || '60', 10) });
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`API ${res.statusCode}: ${data.substring(0, 500)}`));
            return;
          }
          resolve(json);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}\nBody: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractImage(response) {
  if (!response.candidates || !response.candidates[0]) return null;
  const parts = response.candidates[0].content?.parts || [];
  for (const part of parts) {
    if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
      return {
        data: Buffer.from(part.inlineData.data, 'base64'),
        mimeType: part.inlineData.mimeType,
      };
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Post-process: resize to 1024x1024 square, convert to JPEG q=90, target < 500KB
async function postProcess(inputBuffer, outPath) {
  let quality = 90;
  let result = await sharp(inputBuffer)
    .resize(1024, 1024, { fit: 'cover', position: 'centre' })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  // If still > 500KB, reduce quality
  while (result.length > 500 * 1024 && quality > 50) {
    quality -= 10;
    result = await sharp(inputBuffer)
      .resize(1024, 1024, { fit: 'cover', position: 'centre' })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  fs.writeFileSync(outPath, result);
  return result.length;
}

// ── Main pipeline ──
async function main() {
  fs.mkdirSync(ENHANCED_DIR, { recursive: true });

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('manifest.json not found. Run extract-and-map.js first.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const entries = Object.entries(manifest);
  const categoryRefs = buildCategoryRefs(manifest);

  const enhanceCount = entries.filter(([,v]) => v.source === 'swiggy').length;
  const generateCount = entries.filter(([,v]) => v.source === 'generate').length;

  console.log(`\n=== Phase 3: Gemini 2.5 Flash Image — Enhancement & Generation ===`);
  console.log(`Model: ${MODEL}`);
  console.log(`Total products: ${entries.length}`);
  console.log(`Enhance (with source photo): ${enhanceCount}`);
  console.log(`Generate (with reference photo): ${generateCount}`);
  console.log(`Category references available: ${Object.keys(categoryRefs).map(k => `cat${k}(${categoryRefs[k].length})`).join(', ')}\n`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  // Process in order: start index from CLI arg (for resuming)
  const startIdx = parseInt(process.argv[2] || '0', 10);

  for (let i = startIdx; i < entries.length; i++) {
    const [retailerId, product] = entries[i];
    const outPath = path.join(ENHANCED_DIR, `${retailerId}.jpg`);

    // Skip if already processed
    if (fs.existsSync(outPath)) {
      const stat = fs.statSync(outPath);
      if (stat.size > 5000) { // must be > 5KB to be valid
        console.log(`  [SKIP] ${retailerId} "${product.name}" (${(stat.size/1024).toFixed(0)} KB)`);
        skipped++;
        continue;
      }
    }

    const num = processed + skipped + failed + 1;
    console.log(`  [${num}/${entries.length}] ${retailerId} "${product.name}" (${product.source})...`);

    let parts;
    if (product.source === 'swiggy' && product.sourceFile) {
      // ENHANCEMENT: send source photo + enhance prompt
      const srcPath = path.join(SOURCE_DIR, product.sourceFile);
      if (!fs.existsSync(srcPath)) {
        console.log(`    [FAIL] Source file not found: ${product.sourceFile}`);
        failed++;
        errors.push({ retailerId, name: product.name, error: 'source file missing' });
        continue;
      }
      const imgData = fs.readFileSync(srcPath);
      const base64 = imgData.toString('base64');
      const ext = product.sourceFile.toLowerCase();
      const mimeType = ext.endsWith('.png') ? 'image/png' : 'image/jpeg';
      parts = [
        { text: ENHANCE_PROMPT },
        { inlineData: { mimeType, data: base64 } },
      ];
    } else {
      // GENERATION: find reference image + generate prompt
      const ref = findReference(product, manifest, categoryRefs);
      if (ref && ref.sourceFile) {
        const refPath = path.join(SOURCE_DIR, ref.sourceFile);
        if (fs.existsSync(refPath)) {
          const refData = fs.readFileSync(refPath);
          const base64 = refData.toString('base64');
          const ext = ref.sourceFile.toLowerCase();
          const mimeType = ext.endsWith('.png') ? 'image/png' : 'image/jpeg';
          console.log(`    [REF] Using "${ref.name}" as style reference`);
          parts = [
            { text: getGeneratePrompt(product.name) },
            { inlineData: { mimeType, data: base64 } },
          ];
        } else {
          console.log(`    [WARN] Reference file missing, generating without reference`);
          parts = [{ text: getGeneratePromptNoRef(product.name) }];
        }
      } else {
        console.log(`    [WARN] No reference found, generating without reference`);
        parts = [{ text: getGeneratePromptNoRef(product.name) }];
      }
    }

    // Call Gemini with retry logic
    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await callGemini(parts);

        if (response.rateLimited) {
          const wait = Math.max(response.retryAfter, 30) * 1000;
          console.log(`    [RATE] Rate limited, waiting ${wait/1000}s...`);
          await sleep(wait);
          continue;
        }

        const img = extractImage(response);
        if (img) {
          const finalSize = await postProcess(img.data, outPath);
          const kb = (finalSize / 1024).toFixed(0);
          console.log(`    [OK]  Saved ${retailerId}.jpg (${kb} KB, JPEG 1024x1024)`);
          result = true;
          processed++;
          break;
        } else {
          // Check if there's text feedback (safety filter, etc.)
          const textParts = response.candidates?.[0]?.content?.parts?.filter(p => p.text) || [];
          const feedback = textParts.map(p => p.text).join(' ').substring(0, 200);
          const blockReason = response.candidates?.[0]?.finishReason;
          console.log(`    [WARN] No image in response (attempt ${attempt}). Reason: ${blockReason || 'unknown'}. Text: ${feedback || 'none'}`);
          if (attempt < 3) await sleep(5000);
        }
      } catch (err) {
        console.log(`    [ERR]  Attempt ${attempt}: ${err.message.substring(0, 200)}`);
        if (attempt < 3) await sleep(10000);
      }
    }

    if (!result) {
      console.log(`    [FAIL] Could not process ${retailerId} after 3 attempts`);
      failed++;
      errors.push({ retailerId, name: product.name, source: product.source });
    }

    // Rate limit spacing: ~7s between requests (10 RPM free tier)
    await sleep(7000);
  }

  // Update manifest with enhanced paths
  for (const [retailerId] of entries) {
    const outPath = path.join(ENHANCED_DIR, `${retailerId}.jpg`);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 5000) {
      manifest[retailerId].enhancedFile = `${retailerId}.jpg`;
    }
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped (already done): ${skipped}`);
  console.log(`Failed: ${failed}`);
  if (errors.length > 0) {
    console.log(`\nFailed items:`);
    errors.forEach(e => console.log(`  - ${e.retailerId} "${e.name}" (${e.source || e.error})`));
  }
  console.log(`\nManifest updated: ${MANIFEST_PATH}`);
  console.log(`Output directory: ${ENHANCED_DIR}`);
}

main().catch(console.error);
