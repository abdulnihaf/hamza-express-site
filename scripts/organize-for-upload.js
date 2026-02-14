#!/usr/bin/env node
// Phase 4D: Organize images for Swiggy/Zomato manual upload
// Creates CSV mapping and category-organized folders
// Output: images/upload/ directory with per-category folders + CSV

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');
const ENHANCED_DIR = path.join(BASE_DIR, 'images', 'enhanced');
const UPLOAD_DIR = path.join(BASE_DIR, 'images', 'upload');
const MANIFEST_PATH = path.join(BASE_DIR, 'images', 'manifest.json');

// Category names matching Swiggy/Zomato menu structure
const CATEGORIES = {
  25: 'Tandoori',
  22: 'Indian Gravy',
  24: 'Chinese & Dry',
  23: 'Biryani & Rice',
  28: 'Salad & Raitha',
};

// Subcategory mapping from whatsapp.js comments
const SUBCATEGORIES = {
  'HE-1134': 'Tandoori Dishes', 'HE-1135': 'Tandoori Dishes', 'HE-1136': 'Tandoori Dishes',
  'HE-1137': 'Tandoori Dishes', 'HE-1138': 'Tandoori Dishes', 'HE-1139': 'Tandoori Dishes',
  'HE-1140': 'Tandoori Dishes', 'HE-1141': 'Tandoori Dishes', 'HE-1142': 'Tandoori Dishes',
  'HE-1143': 'Tandoori Dishes', 'HE-1144': 'Tandoori Dishes', 'HE-1145': 'Tandoori Dishes',

  'HE-1146': 'Chicken Gravy', 'HE-1147': 'Chicken Gravy', 'HE-1148': 'Chicken Gravy',
  'HE-1149': 'Chicken Gravy', 'HE-1150': 'Chicken Gravy', 'HE-1151': 'Chicken Gravy',
  'HE-1152': 'Chicken Gravy', 'HE-1153': 'Chicken Gravy', 'HE-1154': 'Chicken Gravy',
  'HE-1155': 'Chicken Gravy', 'HE-1156': 'Chicken Gravy', 'HE-1157': 'Chicken Gravy',
  'HE-1158': 'Chicken Gravy', 'HE-1159': 'Chicken Gravy', 'HE-1160': 'Chicken Gravy',
  'HE-1161': 'Chicken Gravy', 'HE-1162': 'Chicken Gravy',

  'HE-1163': 'Chinese Chicken', 'HE-1164': 'Chinese Chicken', 'HE-1165': 'Chinese Chicken',
  'HE-1166': 'Chinese Chicken', 'HE-1167': 'Chinese Chicken', 'HE-1168': 'Chinese Chicken',
  'HE-1169': 'Chinese Chicken', 'HE-1170': 'Chinese Chicken', 'HE-1171': 'Chinese Chicken',
  'HE-1172': 'Chinese Chicken', 'HE-1173': 'Chinese Chicken', 'HE-1174': 'Chinese Chicken',
  'HE-1175': 'Chinese Chicken', 'HE-1176': 'Chinese Chicken',

  'HE-1177': 'Mutton Gravy', 'HE-1178': 'Mutton Gravy', 'HE-1179': 'Mutton Gravy',
  'HE-1180': 'Mutton Gravy', 'HE-1181': 'Mutton Gravy', 'HE-1182': 'Mutton Gravy',
  'HE-1183': 'Mutton Gravy', 'HE-1184': 'Mutton Gravy', 'HE-1185': 'Mutton Gravy',
  'HE-1186': 'Mutton Gravy', 'HE-1187': 'Mutton Gravy', 'HE-1188': 'Mutton Gravy',
  'HE-1189': 'Mutton Gravy', 'HE-1190': 'Mutton Gravy',

  'HE-1191': 'Mutton Dry', 'HE-1192': 'Mutton Dry', 'HE-1193': 'Mutton Dry',
  'HE-1194': 'Mutton Dry', 'HE-1195': 'Mutton Dry',

  'HE-1196': 'Breakfast Special', 'HE-1197': 'Breakfast Special',
  'HE-1198': 'Breakfast Special', 'HE-1199': 'Breakfast Special',

  'HE-1200': 'Biryani', 'HE-1201': 'Biryani', 'HE-1202': 'Biryani',
  'HE-1203': 'Biryani', 'HE-1204': 'Biryani',

  'HE-1205': 'Rice', 'HE-1206': 'Rice', 'HE-1207': 'Rice',

  'HE-1208': 'Rolls', 'HE-1209': 'Rolls', 'HE-1210': 'Rolls', 'HE-1211': 'Rolls',

  'HE-1212': 'Roti & Parathas', 'HE-1213': 'Roti & Parathas', 'HE-1214': 'Roti & Parathas',
  'HE-1215': 'Roti & Parathas', 'HE-1216': 'Roti & Parathas', 'HE-1217': 'Roti & Parathas',
  'HE-1218': 'Roti & Parathas', 'HE-1219': 'Roti & Parathas', 'HE-1220': 'Roti & Parathas',
  'HE-1221': 'Roti & Parathas', 'HE-1222': 'Roti & Parathas', 'HE-1223': 'Roti & Parathas',
  'HE-1224': 'Roti & Parathas',

  'HE-1225': 'Indian Veg', 'HE-1226': 'Indian Veg', 'HE-1227': 'Indian Veg',
  'HE-1228': 'Indian Veg', 'HE-1229': 'Indian Veg', 'HE-1230': 'Indian Veg',
  'HE-1231': 'Indian Veg', 'HE-1232': 'Indian Veg', 'HE-1233': 'Indian Veg',
  'HE-1234': 'Indian Veg',

  'HE-1235': 'Fried Rice & Noodles', 'HE-1236': 'Fried Rice & Noodles',
  'HE-1237': 'Fried Rice & Noodles', 'HE-1238': 'Fried Rice & Noodles',
  'HE-1239': 'Fried Rice & Noodles', 'HE-1240': 'Fried Rice & Noodles',
  'HE-1241': 'Fried Rice & Noodles', 'HE-1242': 'Fried Rice & Noodles',
  'HE-1243': 'Fried Rice & Noodles', 'HE-1244': 'Fried Rice & Noodles',
  'HE-1245': 'Fried Rice & Noodles', 'HE-1246': 'Fried Rice & Noodles',
  'HE-1247': 'Fried Rice & Noodles', 'HE-1248': 'Fried Rice & Noodles',

  'HE-1249': 'Salad & Raitha', 'HE-1250': 'Salad & Raitha',
  'HE-1251': 'Salad & Raitha', 'HE-1252': 'Salad & Raitha',

  'HE-1253': 'Fish & Seafood', 'HE-1254': 'Fish & Seafood', 'HE-1255': 'Fish & Seafood',
  'HE-1256': 'Fish & Seafood', 'HE-1257': 'Fish & Seafood', 'HE-1258': 'Fish & Seafood',
  'HE-1259': 'Fish & Seafood',
};

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('manifest.json not found.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const entries = Object.entries(manifest);

  // Clean and create upload directory
  if (fs.existsSync(UPLOAD_DIR)) {
    fs.rmSync(UPLOAD_DIR, { recursive: true });
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // CSV header
  const csvRows = ['retailer_id,dish_name,category,subcategory,image_file,image_size_kb'];

  let copied = 0;
  for (const [retailerId, product] of entries) {
    const srcPath = path.join(ENHANCED_DIR, `${retailerId}.jpg`);
    if (!fs.existsSync(srcPath)) continue;

    const subcat = SUBCATEGORIES[retailerId] || 'Other';
    const safeName = subcat.replace(/[^a-zA-Z0-9_& -]/g, '');

    // Create subcategory folder
    const catDir = path.join(UPLOAD_DIR, safeName);
    fs.mkdirSync(catDir, { recursive: true });

    // Copy with readable filename: "Butter Chicken.jpg"
    const safeDishName = product.name.replace(/[\/\\:*?"<>|]/g, '-');
    const destFile = `${safeDishName}.jpg`;
    const destPath = path.join(catDir, destFile);
    fs.copyFileSync(srcPath, destPath);

    const sizeKb = (fs.statSync(srcPath).size / 1024).toFixed(0);
    csvRows.push(`${retailerId},"${product.name}","${safeName}","${subcat}","${destFile}",${sizeKb}`);
    copied++;
  }

  // Write CSV
  const csvPath = path.join(UPLOAD_DIR, 'swiggy-zomato-mapping.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n'));

  console.log(`\n=== Phase 4D: Organized for Swiggy/Zomato Upload ===`);
  console.log(`Images organized: ${copied}`);
  console.log(`CSV mapping: ${csvPath}`);
  console.log(`Upload directory: ${UPLOAD_DIR}`);
  console.log(`\nFolders:`);

  // List folders with counts
  const folders = fs.readdirSync(UPLOAD_DIR).filter(f => fs.statSync(path.join(UPLOAD_DIR, f)).isDirectory());
  folders.sort();
  for (const folder of folders) {
    const count = fs.readdirSync(path.join(UPLOAD_DIR, folder)).length;
    console.log(`  ${folder}: ${count} images`);
  }

  console.log(`\nTo upload to Swiggy: partner.swiggy.com → Menu → Item Photos → Upload`);
  console.log(`To upload to Zomato: zomato.com/partners → Menu → Photos → Upload`);
}

main();
