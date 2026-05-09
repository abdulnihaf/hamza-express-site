#!/usr/bin/env node
// Generate photorealistic food images for Krispy Eats (FC) menu items
// Uses Gemini 2.5 Flash Image API for high-quality food photography
// Output: 1024x1024 JPEG images, < 500KB each
// Usage: GEMINI_API_KEY=your_key node scripts/generate-fc-images.js

const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Set GEMINI_API_KEY env var first');
  console.error('Get one at: https://aistudio.google.com/apikey');
  process.exit(1);
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;

const OUTPUT_DIR = path.join(__dirname, '..', 'images', 'enhanced');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'assets', 'menu');

// Ensure output directories exist
for (const dir of [OUTPUT_DIR, PUBLIC_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Krispy Eats menu items to generate images for
const FC_ITEMS = [
  { id: 'HE-1366', name: '1 Pc Fried Chicken',               detail: 'A single piece of golden crispy fried chicken, bone-in, with a thick crunchy coating seasoned with spices. Served on a small paper-lined tray.' },
  { id: 'HE-1367', name: '2 Pcs Fried Chicken',              detail: '2 pieces of golden crispy fried chicken (drumstick and thigh), bone-in, with thick crunchy breaded coating. Served on a paper-lined tray.' },
  { id: 'HE-1368', name: '4 Pcs Fried Chicken',              detail: '4 pieces of golden crispy fried chicken (2 drumsticks, 1 thigh, 1 breast), bone-in, with thick crunchy coating. Served in a branded bucket-style container.' },
  { id: 'HE-1369', name: 'Duet Combo',                       detail: '2 pieces crispy fried chicken, a portion of golden french fries, a soft bun, small mayo cup, and a cola soft drink with ice. All arranged on a branded tray.' },
  { id: 'HE-1370', name: 'Regular Combo',                    detail: '4 pieces crispy fried chicken, a generous portion of golden french fries, 2 soft buns, mayo cup, and 2 cola soft drinks. Arranged on a large branded tray.' },
  { id: 'HE-1371', name: 'Family Combo',                     detail: '8 pieces of crispy fried chicken in a large bucket, a huge portion of french fries, 4 soft buns, mayo cups, and soft drinks. Family-size feast spread on a table.' },
  { id: 'HE-1372', name: 'Party Combo',                      detail: '12 pieces of crispy fried chicken overflowing from a large party bucket, massive fries portion, 6 buns, mayo cups, multiple soft drinks. Party-size spread.' },
  { id: 'HE-1373', name: 'Cheesy Fries',                     detail: 'A generous serving of golden french fries topped with melted cheese sauce dripping over the sides. Served in a red and white paper container.' },
  { id: 'HE-1374', name: 'Loaded Fries',                     detail: 'Golden french fries loaded with melted cheese, crispy chicken pieces, jalapenos, and drizzled with spicy mayo and ketchup. Served in a paper container.' },
  { id: 'HE-1375', name: 'Krispy Popcorn (S)',               detail: 'A small cup of bite-sized crispy chicken popcorn pieces, golden brown with a crunchy coating, piled up. Served with a small dipping sauce on the side.' },
  { id: 'HE-1376', name: 'Krispy Popcorn (M)',               detail: 'A medium-sized container of crispy chicken popcorn bites, golden and crunchy, generously filled. With dipping sauce on the side.' },
  { id: 'HE-1377', name: 'Krispy Popcorn (L)',               detail: 'A large bucket of crispy golden chicken popcorn pieces overflowing, with a crunchy breaded coating. With dipping sauces.' },
  { id: 'HE-1378', name: 'Krispy Shrimps with Mayo (10pcs)', detail: '10 crispy golden fried shrimps with a light, crunchy tempura-style coating, arranged on a plate with a bowl of creamy mayonnaise dip.' },
  { id: 'HE-1379', name: 'Krispy Wings with Mayo (6pcs)',    detail: '6 crispy fried chicken wings, golden brown with a spicy seasoned coating, arranged on a plate with a bowl of creamy mayo dip on the side.' },
  { id: 'HE-1380', name: 'Krispy Lollipop with Mayo (6pcs)', detail: '6 chicken lollipops (drumettes shaped into lollipop form) with a crispy golden coating, standing up on a plate, with a mayo dip bowl.' },
  { id: 'HE-1381', name: 'Chicken Zinger Burger',            detail: 'A crispy chicken zinger burger with a thick breaded chicken fillet, fresh lettuce, mayo, in a toasted sesame bun. Served with golden fries on the side.' },
  { id: 'HE-1382', name: 'Classic Chicken Burger',           detail: 'A classic chicken burger with a breaded chicken patty, lettuce, tomato, mayo, in a soft toasted bun. Served with fries on the side.' },
  { id: 'HE-1383', name: 'Chicken Zinger Roll',              detail: 'A chicken zinger roll — crispy breaded chicken strip, lettuce, onion, mayo wrapped tightly in a soft flour tortilla/wrap, cut in half showing the filling.' },
  { id: 'HE-1384', name: 'Mutton Sheekh Roll',               detail: 'A mutton seekh kebab roll — grilled minced mutton seekh kebab with onions, mint chutney, wrapped in a thin paratha/roti, cut in half showing filling.' },
  { id: 'HE-1385', name: 'Shawarma Roll',                    detail: 'A chicken shawarma roll — shaved grilled chicken with pickled vegetables, garlic sauce, wrapped in a thin pita/tortilla, cut in half to show layers.' },
  { id: 'HE-1386', name: 'Chicken Popcorn Salad',            detail: 'A fresh salad bowl with mixed greens, cherry tomatoes, cucumber, onion rings, topped with crispy golden chicken popcorn pieces and drizzled dressing.' },
  { id: 'HE-1387', name: 'Chicken Doner Salad',              detail: 'A fresh salad bowl with mixed greens, cherry tomatoes, red onion, cucumber, topped with sliced grilled chicken doner meat and yogurt dressing.' },
  { id: 'HE-1388', name: 'Rice with Chicken Popcorn',        detail: 'A plate of steamed white basmati rice served alongside a generous portion of crispy golden chicken popcorn bites, with a small salad on the side.' },
  { id: 'HE-1389', name: 'Extra Bun',                        detail: 'A single soft, round, golden-topped burger bun on a clean white surface, fresh and fluffy.' },
  { id: 'HE-1390', name: 'Extra Mayo',                       detail: 'A small transparent dipping cup filled with creamy white mayonnaise, with a smooth swirl on top.' },
  { id: 'HE-1391', name: 'Soft Drink',                       detail: 'A chilled glass bottle of cola soft drink with condensation droplets, next to a glass filled with cola and ice cubes, with a red straw.' },
];

const GENERATION_PROMPT = (itemName, itemDetail) => `Generate a photorealistic food photograph of "${itemName}" for a premium fried chicken restaurant called "Krispy Eats by Hamza".

The dish: ${itemDetail}

CRITICAL REQUIREMENTS:
- Shot from a 30-45 degree overhead angle
- Dark matte black or dark wooden table surface as background
- Professional restaurant photography lighting: warm golden side-lighting from the left, soft fill light from the right
- Rich, vibrant colors — deep golden browns on the fried chicken, bright colors on vegetables
- Food fills approximately 70-80% of the frame, centered
- Must look COMPLETELY REAL and AUTHENTIC — as if photographed with a Canon EOS R5 in a professional food studio
- NO text, logos, watermarks, or any written content on the image
- NO AI artifacts — no uncanny smoothness, no unnatural glow, no impossible reflections
- Warm color grading with slightly desaturated shadows
- Shallow depth of field — slight blur on background elements
- The food should look freshly prepared, with steam visible if applicable
- Square 1:1 composition for menu display
- Image must be suitable for a WhatsApp product catalog and restaurant POS system

STYLE REFERENCE:
- Think KFC or Popeyes style promotional photography but for an Indian restaurant context
- Rustic, warm, inviting, premium fast food aesthetic
- Natural imperfections in the food (drips, uneven coating) make it look more real`;

async function generateImage(item) {
  const prompt = GENERATION_PROMPT(item.name, item.detail);

  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();

  // Extract image from response
  const candidates = data.candidates || [];
  if (candidates.length === 0) {
    throw new Error('No candidates in response');
  }

  const parts = candidates[0].content?.parts || [];
  const imagePart = parts.find(p => p.inlineData);

  if (!imagePart) {
    const textPart = parts.find(p => p.text);
    throw new Error(`No image in response. Text: ${textPart?.text?.substring(0, 100) || 'none'}`);
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function saveImage(buffer, itemId) {
  const enhancedPath = path.join(OUTPUT_DIR, `${itemId}.jpg`);
  const publicPath = path.join(PUBLIC_DIR, `${itemId}.jpg`);

  // Save as JPEG (the API returns PNG, we need to keep as-is or convert)
  // For now, save the raw image data
  fs.writeFileSync(enhancedPath, buffer);

  // Also copy to public directory for serving
  fs.writeFileSync(publicPath, buffer);

  const sizeKB = Math.round(buffer.length / 1024);
  return { enhancedPath, publicPath, sizeKB };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Generating ${FC_ITEMS.length} Krispy Eats food images via Gemini...`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Public: ${PUBLIC_DIR}`);
  console.log('');

  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < FC_ITEMS.length; i++) {
    const item = FC_ITEMS[i];
    const progress = `[${i + 1}/${FC_ITEMS.length}]`;

    // Check if image already exists (skip if already generated)
    const existingPath = path.join(OUTPUT_DIR, `${item.id}.jpg`);
    if (fs.existsSync(existingPath)) {
      const stat = fs.statSync(existingPath);
      if (stat.size > 10000) { // More than 10KB = probably valid
        console.log(`${progress} SKIP ${item.id}: ${item.name} (already exists, ${Math.round(stat.size / 1024)}KB)`);
        success++;
        continue;
      }
    }

    try {
      process.stdout.write(`${progress} Generating ${item.id}: ${item.name}... `);

      const imageBuffer = await generateImage(item);
      const { sizeKB } = await saveImage(imageBuffer, item.id);
      success++;
      console.log(`✓ ${sizeKB}KB`);

      // Rate limiting: Gemini free tier = 10 RPM
      // Wait 7 seconds between requests to stay under limit
      if (i < FC_ITEMS.length - 1) {
        process.stdout.write(`   (waiting 7s for rate limit...)\r`);
        await sleep(7000);
      }
    } catch (err) {
      failed++;
      console.log(`✗ ${err.message}`);
      errors.push({ id: item.id, name: item.name, error: err.message });

      // If rate limited (429), wait longer
      if (err.message.includes('429') || err.message.includes('RATE')) {
        console.log('   Rate limited! Waiting 60 seconds...');
        await sleep(60000);
      } else {
        // Brief pause even on other errors
        await sleep(3000);
      }
    }
  }

  console.log(`\nDone! Generated: ${success}, Failed: ${failed}`);

  if (errors.length > 0) {
    console.log('\nFailed items (re-run script to retry):');
    for (const e of errors) {
      console.log(`  ${e.id}: ${e.name} — ${e.error}`);
    }
  }

  // List generated images
  console.log('\nGenerated images:');
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('HE-'));
  for (const f of files) {
    const stat = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`  ${f} — ${Math.round(stat.size / 1024)}KB`);
  }
}

main().catch(console.error);
