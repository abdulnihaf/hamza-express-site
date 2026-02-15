#!/usr/bin/env node
// Regenerate 15 flagged images that have text overlays or look AI-generated
// Usage: GEMINI_API_KEY=xxx node scripts/regenerate-flagged.js
//
// Issues found:
// - Text overlays: 1139, 1140, 1210, 1211, 1136 (Gemini added dish name text + logo)
// - AI look: 1141, 1147, 1172, 1179, 1188, 1196, 1202, 1243, 1245, 1212
// - Common problems: too-smooth textures, plastic-looking food, perfect symmetry,
//   floating objects, unrealistic steam, CG-looking utensils

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

const BASE_DIR = path.join(__dirname, '..');
const SOURCE_DIR = path.join(BASE_DIR, 'images', 'source');
const ENHANCED_DIR = path.join(BASE_DIR, 'images', 'enhanced');
const ASSETS_DIR = path.join(BASE_DIR, 'assets', 'menu');
const MANIFEST_PATH = path.join(BASE_DIR, 'images', 'manifest.json');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('Set GEMINI_API_KEY env var'); process.exit(1); }
const MODEL = 'gemini-2.5-flash-image';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ── FLAGGED IMAGES with per-item analysis ──
const FLAGGED = [
  { id: 1136, name: 'Barbique Chicken (Boona)', source: 'generate', issue: 'Faint blurred text artifact in background, slightly AI-smooth texture' },
  { id: 1139, name: 'Chicken Chops', source: 'generate', issue: 'Red logo icon + "Chicken Chops" text overlay top-left' },
  { id: 1140, name: 'American Chops', source: 'generate', issue: 'Red logo icon + "American Chops" text overlay top-left' },
  { id: 1141, name: 'Haryali Tikka', source: 'swiggy', issue: 'Flat lighting, plastic texture, white plate on light wood - not heritage look' },
  { id: 1147, name: 'Chicken Dopiyaza', source: 'swiggy', issue: 'Too-smooth gravy, overly uniform fake steam, slightly uncanny' },
  { id: 1172, name: 'Lollipop', source: 'generate', issue: 'Too perfectly arranged, chicken pieces look plastic/uniform' },
  { id: 1179, name: 'Mutton Achari', source: 'swiggy', issue: 'Multiple side dishes look staged, flat composition' },
  { id: 1188, name: 'Mutton Kassa', source: 'swiggy', issue: 'Weird tray plating, rice and sides look low-res/blurry' },
  { id: 1196, name: 'Mutton Paya', source: 'generate', issue: 'Clay pot looks too perfect/rendered, onion rings floating unrealistically' },
  { id: 1202, name: 'Theethar Biryani', source: 'swiggy', issue: 'Flat overhead angle, spoon looks CG, wrong reflections in raita bowl' },
  { id: 1210, name: 'Veg Roll', source: 'generate', issue: 'Red logo icon + "Veg Roll" text overlay top-left' },
  { id: 1211, name: 'Mutton Sheek Roll', source: 'generate', issue: '"Mutton Sheek Roll" text overlay top-left' },
  { id: 1212, name: 'Kerala Paratha', source: 'generate', issue: 'Looks slightly AI-composed, too-perfect arrangement' },
  { id: 1243, name: 'Mix Fried Rice', source: 'swiggy', issue: 'Too close crop, raita floating on bowl edge, no depth' },
  { id: 1245, name: 'Chicken Schezwan Fried Rice', source: 'swiggy', issue: 'Very dark grey background, overflowing bowl, not heritage aesthetic' },
];

// ── IMPROVED PROMPTS — much stronger anti-text, anti-AI instructions ──

const ENHANCE_PROMPT_V2 = `Enhance this food photograph. This is for a restaurant menu.

ABSOLUTE RULES — VIOLATION OF ANY = FAILURE:
1. ZERO TEXT anywhere in the image. No words, no letters, no numbers, no logos, no icons, no watermarks, no labels, no stamps. The image must contain ONLY food and tableware.
2. The image must be indistinguishable from a real DSLR photograph. Zero AI artifacts.

Enhancement instructions:
- Warm golden-amber tungsten lighting as in an Indian restaurant
- Dark warm wood table surface as background
- Rich warm color palette — deep reds, golden browns, warm oranges
- Keep the SAME food item, only improve lighting/warmth/composition
- Food should fill 70-80% of the frame
- Natural imperfections: slightly uneven garnish, real-looking gravy surface texture, visible oil sheen
- Natural depth of field: slight background blur as with a 50mm f/1.8 lens
- NO artificial steam effects — if steam is present, make it subtle and natural
- Square 1:1 crop

Output ONLY a single photograph with absolutely no text or overlay of any kind.`;

function getRegenPrompt(dishName, specificNotes) {
  return `Generate a single photorealistic food photograph of "${dishName}" for a restaurant menu.

ABSOLUTE RULES — VIOLATION OF ANY = FAILURE:
1. ZERO TEXT anywhere in the image. No words, no letters, no numbers, no logos, no icons, no watermarks, no labels, no stamps, no captions. The output must contain ONLY food, plate/bowl, and table.
2. The image must be INDISTINGUISHABLE from a real photograph taken with a DSLR camera. It must NOT look AI-generated.

I am providing a reference photo of a DIFFERENT dish. Match ONLY its lighting style, color temperature, and camera angle. The food in your output must be "${dishName}", NOT the reference dish.

Photographic requirements:
- Shot with a Canon 5D Mark IV, 50mm f/1.8 lens, natural restaurant lighting
- Warm golden tungsten lighting, as in a traditional Indian restaurant at dinner time
- Background: warm dark brown wood table, slightly out of focus
- Shallow depth of field — background softly blurred, food sharp
- Natural imperfections that make it look REAL: slightly uneven garnish placement, real gravy texture with visible oil droplets and spice flecks, asymmetric food arrangement, natural shadows
- NO fake/cartoonish steam — either no steam or very subtle natural wisps
- Rich warm color grading — earthy golden-brown tones, NOT oversaturated
- Food fills 70-80% of frame, slightly off-center composition (rule of thirds)
- Traditional Indian restaurant serving vessel (steel plate, copper handi, clay pot, or steel katori as appropriate)
- Garnish: fresh coriander leaves, sliced onion rings, green chilli, lemon wedge — placed naturally, not perfectly arranged
${specificNotes ? `- Specific: ${specificNotes}` : ''}

The output must be a single photograph. ABSOLUTELY NO TEXT, NO LABELS, NO OVERLAY.`;
}

function getRegenPromptNoRef(dishName, specificNotes) {
  return `Generate a single photorealistic food photograph of "${dishName}" for a restaurant menu.

ABSOLUTE RULES — VIOLATION OF ANY = FAILURE:
1. ZERO TEXT anywhere in the image. No words, letters, numbers, logos, icons, watermarks, labels, stamps, or captions of any kind. Output ONLY contains food, plate/bowl, and table surface.
2. The image must look like a REAL photograph from a DSLR camera. NOT AI-generated.

Photographic requirements:
- Shot with Canon 5D Mark IV, 50mm f/1.8, available tungsten restaurant lighting
- Warm golden-amber lighting of a traditional Indian restaurant
- Background: dark warm wood table, naturally out of focus
- Shallow depth of field with natural bokeh
- Natural imperfections: uneven garnish, visible oil/spice texture in food, asymmetric placement, real shadows
- NO fake steam — subtle natural wisps only if appropriate
- Warm earthy color grading — golden-brown tones, not oversaturated
- Food fills 70-80%, slightly off-center (rule of thirds)
- Traditional serving vessel appropriate for the dish
- Natural garnish: coriander, onion rings, green chilli, lemon wedge
${specificNotes ? `- Specific: ${specificNotes}` : ''}

Output a single photograph. ABSOLUTELY NO TEXT OR OVERLAY.`;
}

// Dish-specific notes for better accuracy
const DISH_NOTES = {
  1136: 'Barbecue chicken pieces with charred edges, smoky reddish-brown color, on a wooden board or steel plate',
  1139: 'Indian-style chicken chops — whole leg pieces, deep-fried golden brown with foil on bone tips, on a steel plate',
  1140: 'American-style breaded chicken chops with ketchup/sauce drizzle, golden crispy coating, on a plate',
  1141: 'Haryali (green) tikka — green herb-marinated chicken pieces with visible char marks, bright green color from mint/coriander marinade, on a sizzler plate or steel plate with mint chutney',
  1147: 'Chicken dopiyaza — chicken curry with lots of onions visible in thick brown gravy, served in a copper handi or bowl',
  1172: 'Chicken lollipop — Indian-Chinese style, deep-fried drumettes shaped into lollipops, crispy golden-red exterior, arranged standing up on a plate with schezwan sauce on side',
  1179: 'Mutton achari — pickle-spiced mutton curry with visible mustard seeds and whole spices in oily red-brown gravy, in a bowl',
  1188: 'Mutton kassa — dry mutton preparation, dark brown spiced pieces with minimal gravy, on a plate or in a handi',
  1196: 'Mutton paya — trotters soup/stew, rich golden-brown broth with visible bone pieces, in a deep bowl or handi, served with bread on side',
  1202: 'Theethar biryani — layered rice with saffron coloring, visible meat pieces, fried onions on top, served in a dum pot or plate with raita',
  1210: 'Vegetable kathi roll — wrapped in paratha/roti showing colorful veggie filling (peppers, onions, paneer), cut diagonally, on a plate with chutney',
  1211: 'Mutton seekh kebab roll — rolled in paratha with minced mutton seekh kebab filling, sliced to show interior, on a plate',
  1212: 'Kerala paratha — flaky layered flatbread, golden-brown with visible layers, stacked 2-3 pieces on a plate with curry on side',
  1243: 'Mix fried rice — Chinese-Indian style with visible mixed vegetables (carrots, beans, peas, corn), soy sauce coloring, served in a bowl or plate',
  1245: 'Chicken schezwan fried rice — spicy red-tinted fried rice with chicken pieces, spring onions, in a bowl on warm wood background',
};

// ── API + processing functions (same as enhance-images.js) ──

function callGemini(parts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
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
          reject(new Error(`Parse error: ${e.message}`));
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
      return { data: Buffer.from(part.inlineData.data, 'base64'), mimeType: part.inlineData.mimeType };
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function postProcess(inputBuffer, outPath) {
  let quality = 90;
  let result = await sharp(inputBuffer)
    .resize(1024, 1024, { fit: 'cover', position: 'centre' })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
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

// Find a reference image from manifest (same category, different item)
function findReference(productId, manifest) {
  const product = manifest[`HE-${productId}`];
  if (!product) return null;
  const catId = product.catId;

  // Find another item in same category that has a Swiggy source AND is NOT in our flagged list
  const flaggedIds = FLAGGED.map(f => f.id);
  for (const [id, p] of Object.entries(manifest)) {
    const numId = parseInt(id.replace('HE-', ''));
    if (p.catId === catId && p.source === 'swiggy' && p.sourceFile && !flaggedIds.includes(numId)) {
      const srcPath = path.join(SOURCE_DIR, p.sourceFile);
      if (fs.existsSync(srcPath)) return { ...p, filePath: srcPath };
    }
  }

  // Cross-category fallback
  const fallbackCats = [22, 24, 25, 23];
  for (const fc of fallbackCats) {
    for (const [id, p] of Object.entries(manifest)) {
      const numId = parseInt(id.replace('HE-', ''));
      if (p.catId === fc && p.source === 'swiggy' && p.sourceFile && !flaggedIds.includes(numId)) {
        const srcPath = path.join(SOURCE_DIR, p.sourceFile);
        if (fs.existsSync(srcPath)) return { ...p, filePath: srcPath };
      }
    }
  }
  return null;
}

// ── Main ──
async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  console.log(`\n=== Regenerating ${FLAGGED.length} flagged images ===`);
  console.log(`Model: ${MODEL}`);
  console.log(`Issues: text overlays, AI-generated look, unrealistic textures\n`);

  let success = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < FLAGGED.length; i++) {
    const item = FLAGGED[i];
    const retailerId = `HE-${item.id}`;
    const enhancedPath = path.join(ENHANCED_DIR, `${retailerId}.jpg`);
    const assetPath = path.join(ASSETS_DIR, `${retailerId}.jpg`);
    const specificNotes = DISH_NOTES[item.id] || '';

    console.log(`[${i + 1}/${FLAGGED.length}] ${retailerId} "${item.name}"`);
    console.log(`  Issue: ${item.issue}`);

    let parts;
    const manifestEntry = manifest[retailerId];

    if (item.source === 'swiggy' && manifestEntry?.sourceFile) {
      // Re-enhance the original Swiggy photo with stronger prompt
      const srcPath = path.join(SOURCE_DIR, manifestEntry.sourceFile);
      if (fs.existsSync(srcPath)) {
        const imgData = fs.readFileSync(srcPath);
        const base64 = imgData.toString('base64');
        const mimeType = srcPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        console.log(`  Mode: re-enhance Swiggy source (${manifestEntry.sourceFile})`);
        parts = [
          { text: ENHANCE_PROMPT_V2 },
          { inlineData: { mimeType, data: base64 } },
        ];
      }
    }

    if (!parts) {
      // Generate with reference image
      const ref = findReference(item.id, manifest);
      if (ref) {
        const refData = fs.readFileSync(ref.filePath);
        const base64 = refData.toString('base64');
        const mimeType = ref.filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        console.log(`  Mode: generate with reference "${ref.name}"`);
        parts = [
          { text: getRegenPrompt(item.name, specificNotes) },
          { inlineData: { mimeType, data: base64 } },
        ];
      } else {
        console.log(`  Mode: generate without reference`);
        parts = [{ text: getRegenPromptNoRef(item.name, specificNotes) }];
      }
    }

    // Call Gemini with retry (up to 3 attempts)
    let ok = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await callGemini(parts);

        if (response.rateLimited) {
          const wait = Math.max(response.retryAfter, 30) * 1000;
          console.log(`  [RATE] Waiting ${wait / 1000}s...`);
          await sleep(wait);
          continue;
        }

        const img = extractImage(response);
        if (img) {
          // Save to both enhanced dir and assets dir
          const size1 = await postProcess(img.data, enhancedPath);
          fs.copyFileSync(enhancedPath, assetPath);
          console.log(`  [OK] Saved ${retailerId}.jpg (${(size1 / 1024).toFixed(0)} KB) → enhanced/ + assets/menu/`);
          ok = true;
          success++;
          break;
        } else {
          const textParts = response.candidates?.[0]?.content?.parts?.filter(p => p.text) || [];
          const feedback = textParts.map(p => p.text).join(' ').substring(0, 200);
          const reason = response.candidates?.[0]?.finishReason;
          console.log(`  [WARN] No image (attempt ${attempt}). Reason: ${reason || 'unknown'}. ${feedback || ''}`);
          if (attempt < 3) await sleep(5000);
        }
      } catch (err) {
        console.log(`  [ERR] Attempt ${attempt}: ${err.message.substring(0, 200)}`);
        if (attempt < 3) await sleep(10000);
      }
    }

    if (!ok) {
      console.log(`  [FAIL] Could not regenerate ${retailerId}`);
      failed++;
      errors.push(item);
    }

    // Rate limit: 7s between requests
    if (i < FLAGGED.length - 1) await sleep(7000);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Success: ${success}/${FLAGGED.length}`);
  console.log(`Failed: ${failed}`);
  if (errors.length > 0) {
    console.log(`\nFailed items:`);
    errors.forEach(e => console.log(`  - HE-${e.id} "${e.name}": ${e.issue}`));
  }
  console.log(`\nImages saved to both images/enhanced/ and assets/menu/`);
  console.log(`Next: deploy to Odoo POS with: node scripts/deploy-images.js`);
}

main().catch(console.error);
