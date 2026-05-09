#!/usr/bin/env node
// Phase 1+2: Extract Swiggy images + Map to HE products
// Usage: node scripts/extract-and-map.js

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const BASE_DIR = path.join(__dirname, '..');
const SOURCE_DIR = path.join(BASE_DIR, 'images', 'source');
const MANIFEST_PATH = path.join(BASE_DIR, 'images', 'manifest.json');

// ── Swiggy images extracted from browser (59 food items) ──
const CDN = 'https://media-assets.swiggy.com/swiggy/image/upload/f_auto,q_100,w_1200,h_1200,c_limit/';
const SWIGGY_IMAGES = [
  // Batch 0-9
  { name: "Chicken Kebab", url: CDN + "TopPicks2024/6804486B.png" },
  { name: "Tandoori Chicken", url: CDN + "TopPicks2024/6804500B.png" },
  { name: "Mutton Rogan Josh (4 Pcs)", url: CDN + "avplcviazclsj1rccni7" },
  { name: "Mutton Hamza Special", url: CDN + "bdfqjptgpkeem9lfdcwn" },
  { name: "Mutton Masala", url: CDN + "1af8cb53539e46e0488d47f3a12b1caa" },
  { name: "Kadai Mutton", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/29/1891f28f-55ab-4927-9fc3-343ddd7daebe_23e7eb95-cdde-49b2-9956-63012a0c0b14.JPG" },
  { name: "Mutton Chatpata", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/28/9d014176-ad96-432c-9259-1d2f215ae246_d4ef0b20-54a9-4c26-bd90-115579e64eb8.JPG" },
  { name: "Methi Mutton", url: CDN + "wsaq8pz3jauyxhuxw85w" },
  { name: "Mutton Achari", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/29/9275ff1e-e91c-4746-a0fa-4502cb44f2ca_0d5bc82b-1d6a-4248-ac31-155f607d55bb.JPG" },
  { name: "Mutton Hyderabadi", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/28/2f6be392-3c24-42ed-8701-9545d5422254_fea9e886-e7f3-4180-9d6d-414bb6c49364.JPG" },
  // Batch 10-19
  { name: "Mutton Kassa", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/27/56f7231d-0b42-4dbd-8df5-0c4c36389d41_5b56b032-dcda-46fb-b587-0b1fa9dfec0f.JPG" },
  { name: "Pudina Mutton", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/29/f2056d3d-0056-4b54-b001-4de12a48f62e_297dfc47-403b-4199-b989-100f49a3bc70.JPG" },
  { name: "Mutton Kolhapuri", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/29/7a80b3f6-ff44-4bcc-8a54-44a4e8c31ac1_5732e0fa-1b2c-43fb-8a6d-3ec6f60de262.JPG" },
  { name: "Mutton Pepper Roast (semi-gravy)", url: CDN + "krw0o2mophqzj3gyk02x" },
  { name: "Mutton Baaji Gosh", url: CDN + "s4goto1bqc8qeeydc7nb" },
  { name: "Butter chicken", url: CDN + "v5d1zhaxp9beosxjsch0" },
  { name: "Tandoori Chicken Masala", url: CDN + "svjqnjmsmliha31zljjq" },
  { name: "Punjabi Chicken", url: CDN + "q8s0byjakniqdmjyvqw9" },
  { name: "Methi Chicken", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2025/1/18/d8992239-75c3-4cc5-a9fd-31be660712c8_911e3e7a-af7c-4e19-9300-8fd744b18b4a.JPG" },
  { name: "Mughlai Chicken", url: CDN + "rmfyptffgyp0ubgcijez" },
  // Batch 20-29
  { name: "Chicken Chatpata", url: CDN + "owpn7offpcqlcmerjlt0" },
  { name: "Chicken Do Pyaza", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/28/24215d73-c61d-442b-9067-0c615921c5ee_44363deb-262e-402e-8299-f1897994d752.JPG" },
  { name: "Chicken Fried Rice", url: CDN + "lgkuxb6ykyrfkn9gnofh" },
  { name: "Mixed Fried Rice", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/27/4c8a41de-5e6c-462c-9405-c886813f4ebc_af1a4794-a4b7-4923-92f4-be86973dad4d.JPG" },
  { name: "Mutton Fried Rice", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/27/32f371f9-879f-4bd8-8767-72a75fe2f446_2b265c69-a094-4230-a9c0-fc56882fcf9b.JPG" },
  { name: "Chicken Schezwan Fried Rice", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/28/a6cb2fd4-6fc3-43b1-a6f3-1ad4c3e248b9_c1bc4ca7-833d-4495-b11a-2f0c70aa252e.JPG" },
  { name: "Prawns Fried Rice", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/28/828c26e4-dcd8-4075-a0af-9eb1bf9fba3c_0b6ba6c5-8e8d-4bc9-9b8a-4fb49b65a608.JPG" },
  { name: "Chicken Kebab (Chinese)", url: CDN + "mengxverne5dsoq7vu1n" },
  { name: "Boneless Chicken Singapore", url: CDN + "vfpq0ydcnspzmfhkyolk" },
  { name: "Boneless Chicken Pepper Dry", url: CDN + "wbbntf1eraqua7fxjomz" },
  // Batch 30-39
  { name: "Boneless Chilli Chicken", url: CDN + "dc11d8e451722b050c04369c3036e0ed" },
  { name: "Chicken Hong Kong", url: CDN + "bda74b6d5ac0f12d00c7b4d7c1cf887f" },
  { name: "Boneless Garlic Chicken", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/28/aea2b6d5-22f0-409c-af6b-15e1fe8e4e0d_6ec0c9e4-4b5e-4836-b754-252585db50f0.JPG" },
  { name: "Boneless Chicken Manchurian", url: CDN + "kz6nxe24ujdeqobifidq" },
  { name: "Boneless Chicken 65", url: CDN + "zx9r2mqmahluwyga6ajl" },
  { name: "Boneless Lemon Chicken", url: CDN + "bgs8mxy2qisnh8av3yfp" },
  { name: "Tandoori Chicken (Full)", url: CDN + "lfmddrm3nvwwyxcooc6y" },
  { name: "Chicken Alfahaam", url: CDN + "5c147fa01388451828b8caa917eca597" },
  { name: "Chicken Malai Kebab", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/27/038dac09-5365-472c-bef7-1e78295e3ba5_c123b828-3817-41e7-88d5-09d73205d4c1.JPG" },
  { name: "Haryali Chicken Tikka", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/29/1e1adce2-6e88-4c41-af0b-567974c55068_ed4d9dbd-447b-40d5-9ea1-48b3ee327408.JPG" },
  // Batch 40-49
  { name: "Chicken Kalmi Kebab", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/29/4d027b08-c178-44fe-9baf-c9cfdb38a917_2bdedbb4-f8d9-4209-b2ef-f66333d0ea04.JPG" },
  { name: "Grilled Chicken", url: CDN + "1a92a1a79f267b12d3d1cdc85fbf5390" },
  { name: "Chicken Tikka", url: CDN + "atmqi1fz10dwxbzklaeb" },
  { name: "Mutton Pepper Dry", url: CDN + "mjjgg1u9o9cahulbe5dc" },
  { name: "Mutton Gurda Dry", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/7/25/a9a0e688-e885-434b-8a85-2f7cb786f76e_6b62d256-4e19-4413-ad2a-004057a6ef9f.jpg" },
  { name: "Mutton Seekh", url: CDN + "v773to1ersoxxhqw1ukm" },
  { name: "Mutton Brain Dry", url: CDN + "rkuqyg3oslsdgtbtiznj" },
  { name: "Thethar Pepper Dry", url: CDN + "hoowmmew4bktc4hc4t6t" },
  { name: "Theethar Kabab", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/27/dd03da6c-d0f9-441a-88c2-82532b93ffd1_5a2a17e0-d4ed-4092-9811-d716a72bdba9.JPG" },
  { name: "Thethar Pepper Roast", url: CDN + "nrf26biexz8xvwzuqgqm" },
  // Batch 50-58
  { name: "Hyderabadii Chicken", url: CDN + "slpihrxydq6ptjqemgcd" },
  { name: "Kadai Chicken", url: CDN + "rwmnockbeglb3hohyyzr" },
  { name: "Chicken Masala", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/8/28/7841b243-2dd2-4318-bcf1-bb5bce3f926c_b33b4f99-e907-4c46-ae84-987cf3345116.JPG" },
  { name: "Chicken Kalii Mirch", url: CDN + "ii3yy68q7xecc15qjinv" },
  { name: "Biryani Rice", url: CDN + "gcvcu4mngzje5cnv13kw" },
  { name: "Mutton Biryani", url: CDN + "pwq2kwezt5fdnu1ut73j" },
  { name: "Chicken Biryani", url: CDN + "vxiyynxv5vugyoyjexqp" },
  { name: "Theethar Biryani", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2024/9/10/a0040600-dfb5-4565-99e4-675dd3953c1d_3b28da3a-c9db-4d3d-be12-684d8a4f6129.JPG" },
  { name: "Egg Biryani", url: CDN + "FOOD_CATALOG/IMAGES/CMS/2025/1/24/37fd7c80-261c-49c4-8f7b-526e61230f4f_854e57fc-b02c-4109-b54a-1d6dc05181df.jpg" },
];

// ── HE Products from whatsapp.js ──
const HE_PRODUCTS = {
  'HE-1134': { name: 'Grill Chicken', odooId: 1134, catId: 25 },
  'HE-1135': { name: 'Tandoori Chicken', odooId: 1135, catId: 25 },
  'HE-1136': { name: 'Barbique Chicken (Boona)', odooId: 1136, catId: 25 },
  'HE-1137': { name: 'Chicken Tikka', odooId: 1137, catId: 25 },
  'HE-1138': { name: 'Kalmi Kabab', odooId: 1138, catId: 25 },
  'HE-1139': { name: 'Chicken Chops', odooId: 1139, catId: 25 },
  'HE-1140': { name: 'American Chops', odooId: 1140, catId: 25 },
  'HE-1141': { name: 'Haryali Tikka', odooId: 1141, catId: 25 },
  'HE-1142': { name: 'Malai Tikka', odooId: 1142, catId: 25 },
  'HE-1143': { name: 'Andra Tikka', odooId: 1143, catId: 25 },
  'HE-1144': { name: 'Pepper Barbique', odooId: 1144, catId: 25 },
  'HE-1145': { name: 'Pahadi Kabab', odooId: 1145, catId: 25 },
  'HE-1146': { name: 'Mughlai Chicken', odooId: 1146, catId: 22 },
  'HE-1147': { name: 'Chicken Dopiyaza', odooId: 1147, catId: 22 },
  'HE-1148': { name: 'Hyderabadi Chicken', odooId: 1148, catId: 22 },
  'HE-1149': { name: 'Butter Chicken', odooId: 1149, catId: 22 },
  'HE-1150': { name: 'Punjabi Chicken', odooId: 1150, catId: 22 },
  'HE-1151': { name: 'Chicken Kali Mirch', odooId: 1151, catId: 22 },
  'HE-1152': { name: 'Chicken Burtha', odooId: 1152, catId: 22 },
  'HE-1153': { name: 'Chicken Masala', odooId: 1153, catId: 22 },
  'HE-1154': { name: 'Methi Chicken', odooId: 1154, catId: 22 },
  'HE-1155': { name: 'Kadai Chicken', odooId: 1155, catId: 22 },
  'HE-1156': { name: 'Chicken Chatpat', odooId: 1156, catId: 22 },
  'HE-1157': { name: 'Chicken Sagwala', odooId: 1157, catId: 22 },
  'HE-1158': { name: 'Tandoori Chicken Masala', odooId: 1158, catId: 22 },
  'HE-1159': { name: 'Theethar Pepper Roast', odooId: 1159, catId: 22 },
  'HE-1160': { name: 'Chicken Hamza Special', odooId: 1160, catId: 22 },
  'HE-1161': { name: 'Chicken Tikka Masala', odooId: 1161, catId: 22 },
  'HE-1162': { name: 'Kolapuri Chicken', odooId: 1162, catId: 22 },
  'HE-1163': { name: 'Chicken Kabab', odooId: 1163, catId: 24 },
  'HE-1164': { name: 'Chilly Chicken', odooId: 1164, catId: 24 },
  'HE-1165': { name: 'Chicken Manchurian', odooId: 1165, catId: 24 },
  'HE-1166': { name: 'Chicken 65', odooId: 1166, catId: 24 },
  'HE-1167': { name: 'Chicken Singapore', odooId: 1167, catId: 24 },
  'HE-1168': { name: 'Lemon Chicken', odooId: 1168, catId: 24 },
  'HE-1169': { name: 'Chicken Pepper Dry', odooId: 1169, catId: 24 },
  'HE-1170': { name: 'Garlic Chicken', odooId: 1170, catId: 24 },
  'HE-1171': { name: 'Chicken Jalfrize', odooId: 1171, catId: 24 },
  'HE-1172': { name: 'Lollipop', odooId: 1172, catId: 24 },
  'HE-1173': { name: 'Theethar Pepper Dry', odooId: 1173, catId: 24 },
  'HE-1174': { name: 'Hongkong Chicken', odooId: 1174, catId: 24 },
  'HE-1175': { name: 'Chicken Hot & Sour Wings', odooId: 1175, catId: 24 },
  'HE-1176': { name: 'Honey Chicken', odooId: 1176, catId: 24 },
  'HE-1177': { name: 'Mutton Rogan Josh', odooId: 1177, catId: 22 },
  'HE-1178': { name: 'Methi Mutton', odooId: 1178, catId: 22 },
  'HE-1179': { name: 'Mutton Achari', odooId: 1179, catId: 22 },
  'HE-1180': { name: 'Kadai Mutton', odooId: 1180, catId: 22 },
  'HE-1181': { name: 'Mutton Chatpat', odooId: 1181, catId: 22 },
  'HE-1182': { name: 'Mutton Punjabi', odooId: 1182, catId: 22 },
  'HE-1183': { name: 'Mutton Sagwala', odooId: 1183, catId: 22 },
  'HE-1184': { name: 'Mutton Hyderabadi', odooId: 1184, catId: 22 },
  'HE-1185': { name: 'Mutton Masala', odooId: 1185, catId: 22 },
  'HE-1186': { name: 'Mutton Kolapuri', odooId: 1186, catId: 22 },
  'HE-1187': { name: 'Mutton Pepper Roast', odooId: 1187, catId: 22 },
  'HE-1188': { name: 'Mutton Kassa', odooId: 1188, catId: 22 },
  'HE-1189': { name: 'Mutton Tadka', odooId: 1189, catId: 22 },
  'HE-1190': { name: 'Mutton Hamza Special', odooId: 1190, catId: 22 },
  'HE-1191': { name: 'Mutton Pepper Dry', odooId: 1191, catId: 24 },
  'HE-1192': { name: 'Mutton Brain Dry', odooId: 1192, catId: 24 },
  'HE-1193': { name: 'Mutton Jalfrize', odooId: 1193, catId: 24 },
  'HE-1194': { name: 'Mutton Gurda Dry', odooId: 1194, catId: 24 },
  'HE-1195': { name: 'Mutton Sheek Kabab', odooId: 1195, catId: 24 },
  'HE-1196': { name: 'Mutton Paya', odooId: 1196, catId: 22 },
  'HE-1197': { name: 'Mutton Khima', odooId: 1197, catId: 22 },
  'HE-1198': { name: 'Mutton Brain', odooId: 1198, catId: 22 },
  'HE-1199': { name: 'Mutton Chops', odooId: 1199, catId: 22 },
  'HE-1200': { name: 'Mutton Biryani', odooId: 1200, catId: 23 },
  'HE-1201': { name: 'Chicken Biryani', odooId: 1201, catId: 23 },
  'HE-1202': { name: 'Theethar Biryani', odooId: 1202, catId: 23 },
  'HE-1203': { name: 'Biryani Rice', odooId: 1203, catId: 23 },
  'HE-1204': { name: 'Egg Biryani', odooId: 1204, catId: 23 },
  'HE-1205': { name: 'Ghee Rice', odooId: 1205, catId: 23 },
  'HE-1206': { name: 'Jeera Rice', odooId: 1206, catId: 23 },
  'HE-1207': { name: 'Plain Rice', odooId: 1207, catId: 23 },
  'HE-1208': { name: 'Chicken Roll', odooId: 1208, catId: 25 },
  'HE-1209': { name: 'Egg Roll', odooId: 1209, catId: 25 },
  'HE-1210': { name: 'Veg Roll', odooId: 1210, catId: 25 },
  'HE-1211': { name: 'Mutton Sheek Roll', odooId: 1211, catId: 25 },
  'HE-1212': { name: 'Kerala Paratha', odooId: 1212, catId: 25 },
  'HE-1213': { name: 'Ceylon Paratha', odooId: 1213, catId: 25 },
  'HE-1214': { name: 'Coin Paratha', odooId: 1214, catId: 25 },
  'HE-1215': { name: 'Irani Paratha', odooId: 1215, catId: 25 },
  'HE-1216': { name: 'Wheat Paratha', odooId: 1216, catId: 25 },
  'HE-1217': { name: 'Chapathi', odooId: 1217, catId: 25 },
  'HE-1218': { name: 'Roomali Roti', odooId: 1218, catId: 25 },
  'HE-1219': { name: 'Naan', odooId: 1219, catId: 25 },
  'HE-1220': { name: 'Butter Naan', odooId: 1220, catId: 25 },
  'HE-1221': { name: 'Kulcha', odooId: 1221, catId: 25 },
  'HE-1222': { name: 'Garlic Naan', odooId: 1222, catId: 25 },
  'HE-1223': { name: 'Tandoori Paratha', odooId: 1223, catId: 25 },
  'HE-1224': { name: 'Pathla Roti', odooId: 1224, catId: 25 },
  'HE-1225': { name: 'Dal Fry', odooId: 1225, catId: 22 },
  'HE-1226': { name: 'Paneer Butter Masala', odooId: 1226, catId: 22 },
  'HE-1227': { name: 'Kadai Paneer', odooId: 1227, catId: 22 },
  'HE-1228': { name: 'Palak Paneer', odooId: 1228, catId: 22 },
  'HE-1229': { name: 'Paneer Mutter Masala', odooId: 1229, catId: 22 },
  'HE-1230': { name: 'Aloo Gobi', odooId: 1230, catId: 22 },
  'HE-1231': { name: 'Mixed Veg Curry', odooId: 1231, catId: 22 },
  'HE-1232': { name: 'Gobi Masala', odooId: 1232, catId: 22 },
  'HE-1233': { name: 'Dal Tadka', odooId: 1233, catId: 22 },
  'HE-1234': { name: 'Mushroom Masala', odooId: 1234, catId: 22 },
  'HE-1235': { name: 'Chicken Fried Rice', odooId: 1235, catId: 24 },
  'HE-1236': { name: 'Chicken Noodles', odooId: 1236, catId: 24 },
  'HE-1237': { name: 'Mutton Fried Rice', odooId: 1237, catId: 24 },
  'HE-1238': { name: 'Mutton Noodles', odooId: 1238, catId: 24 },
  'HE-1239': { name: 'Egg Fried Rice', odooId: 1239, catId: 24 },
  'HE-1240': { name: 'Egg Noodles', odooId: 1240, catId: 24 },
  'HE-1241': { name: 'Prawns Fried Rice', odooId: 1241, catId: 24 },
  'HE-1242': { name: 'Prawns Noodles', odooId: 1242, catId: 24 },
  'HE-1243': { name: 'Mix Fried Rice', odooId: 1243, catId: 24 },
  'HE-1244': { name: 'Mix Noodles', odooId: 1244, catId: 24 },
  'HE-1245': { name: 'Chicken Schezwan Fried Rice', odooId: 1245, catId: 24 },
  'HE-1246': { name: 'Chicken Schezwan Noodles', odooId: 1246, catId: 24 },
  'HE-1247': { name: 'Veg Fried Rice', odooId: 1247, catId: 24 },
  'HE-1248': { name: 'Veg Noodles', odooId: 1248, catId: 24 },
  'HE-1249': { name: 'Green Salad', odooId: 1249, catId: 28 },
  'HE-1250': { name: 'Cucumber Salad', odooId: 1250, catId: 28 },
  'HE-1251': { name: 'Pineapple Raitha', odooId: 1251, catId: 28 },
  'HE-1252': { name: 'Mix Raitha', odooId: 1252, catId: 28 },
  'HE-1253': { name: 'Fried Fish', odooId: 1253, catId: 24 },
  'HE-1254': { name: 'Fish Masala', odooId: 1254, catId: 24 },
  'HE-1255': { name: 'Chilly Fish', odooId: 1255, catId: 24 },
  'HE-1256': { name: 'Fish Manchurian', odooId: 1256, catId: 24 },
  'HE-1257': { name: 'Kadai Prawns', odooId: 1257, catId: 24 },
  'HE-1258': { name: 'Prawns Chilly Manchurian', odooId: 1258, catId: 24 },
  'HE-1259': { name: 'Prawns Pepper Fry', odooId: 1259, catId: 24 },
};

// ── Manual overrides for known mismatches ──
// Maps HE product names to the exact Swiggy image name they should use
const MANUAL_MAP = {
  'Chicken Dopiyaza': 'Chicken Do Pyaza',
  'Hyderabadi Chicken': 'Hyderabadii Chicken',
  'Hongkong Chicken': 'Chicken Hong Kong',
  'Chilly Chicken': 'Boneless Chilli Chicken',
  'Chicken Kabab': 'Chicken Kebab (Chinese)',
  'Kolapuri Chicken': null, // no match on Swiggy — different from Mutton Kolhapuri
  'Mutton Kolapuri': 'Mutton Kolhapuri',
  'Mutton Hamza Special': 'Mutton Hamza Special',
  'Mutton Sheek Kabab': 'Mutton Seekh',
  'Mix Fried Rice': 'Mixed Fried Rice',
  'Chicken Alfahaam': 'Chicken Alfahaam',
  'Egg Fried Rice': null, // no egg fried rice on Swiggy
  'Malai Tikka': 'Chicken Malai Kebab', // similar enough tandoor item
  'Chicken Tikka Masala': null, // different from Chicken Tikka
};

// ── Protein type extraction for safety ──
const PROTEINS = ['chicken', 'mutton', 'theethar', 'thethar', 'egg', 'prawns', 'fish', 'paneer', 'veg', 'dal'];
function getProtein(name) {
  const lower = name.toLowerCase();
  for (const p of PROTEINS) {
    if (lower.includes(p)) return p === 'thethar' ? 'theethar' : p;
  }
  return null;
}

// ── Fuzzy matching ──
function normalize(s) {
  return s.toLowerCase()
    .replace(/\(.*?\)/g, '') // remove parentheses
    .replace(/boneless\s*/gi, '')
    .replace(/\bsemi[-\s]?gravy\b/gi, '')
    .replace(/\b(ii|i)\b/g, 'i') // normalize double i
    .replace(/kebab/g, 'kabab')
    .replace(/seekh/g, 'sheek')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const wordsA = na.split(' ');
  const wordsB = nb.split(' ');
  const common = wordsA.filter(w => wordsB.includes(w));
  const score = (2 * common.length) / (wordsA.length + wordsB.length);
  return score;
}

function findBestMatch(heName, swiggyImages) {
  // Check manual map first
  if (heName in MANUAL_MAP) {
    if (MANUAL_MAP[heName] === null) return null; // explicitly no match
    const manual = swiggyImages.find(img => img.name === MANUAL_MAP[heName]);
    if (manual) return { ...manual, score: 1.0 };
  }

  const heProtein = getProtein(heName);

  let bestScore = 0;
  let bestMatch = null;
  for (const img of swiggyImages) {
    const score = similarity(heName, img.name);
    if (score > bestScore) {
      // Protein safety: if both have a detectable protein, they must match
      const swiggyProtein = getProtein(img.name);
      if (heProtein && swiggyProtein && heProtein !== swiggyProtein) continue;
      bestScore = score;
      bestMatch = img;
    }
  }
  return bestScore >= 0.6 ? { ...bestMatch, score: bestScore } : null;
}

// ── Download helper ──
function download(url, filepath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, filepath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const stream = fs.createWriteStream(filepath);
      res.pipe(stream);
      stream.on('finish', () => { stream.close(); resolve(filepath); });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Main ──
async function main() {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });

  console.log('=== Phase 1: Downloading Swiggy images ===\n');

  // Download all Swiggy images
  let downloaded = 0;
  let failed = 0;
  for (const img of SWIGGY_IMAGES) {
    const filename = `${slugify(img.name)}.jpg`;
    const filepath = path.join(SOURCE_DIR, filename);
    img.localFile = filename;

    if (fs.existsSync(filepath)) {
      console.log(`  [SKIP] ${filename} (already exists)`);
      downloaded++;
      continue;
    }

    try {
      await download(img.url, filepath);
      const stat = fs.statSync(filepath);
      console.log(`  [OK]   ${filename} (${(stat.size/1024).toFixed(0)} KB)`);
      downloaded++;
    } catch (err) {
      console.log(`  [FAIL] ${filename}: ${err.message}`);
      failed++;
    }
  }
  console.log(`\nDownloaded: ${downloaded}, Failed: ${failed}\n`);

  console.log('=== Phase 2: Mapping to HE products ===\n');

  const mapping = {};
  let matched = 0;
  let needGenerate = 0;
  const usedSwiggy = new Set();

  for (const [retailerId, product] of Object.entries(HE_PRODUCTS)) {
    const match = findBestMatch(product.name, SWIGGY_IMAGES.filter(s => !usedSwiggy.has(s.name)));

    if (match) {
      usedSwiggy.add(match.name);
      mapping[retailerId] = {
        name: product.name,
        odooId: product.odooId,
        catId: product.catId,
        source: 'swiggy',
        sourceFile: match.localFile || `${slugify(match.name)}.jpg`,
        swiggyName: match.name,
        matchScore: match.score,
        sourceUrl: match.url,
      };
      matched++;
      console.log(`  [MATCH] ${retailerId} "${product.name}" ← Swiggy "${match.name}" (${(match.score*100).toFixed(0)}%)`);
    } else {
      mapping[retailerId] = {
        name: product.name,
        odooId: product.odooId,
        catId: product.catId,
        source: 'generate',
        sourceFile: null,
        swiggyName: null,
        matchScore: 0,
      };
      needGenerate++;
      console.log(`  [MISS]  ${retailerId} "${product.name}" → will generate`);
    }
  }

  console.log(`\nMatched: ${matched}, Need generation: ${needGenerate}\n`);

  // Save manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(mapping, null, 2));
  console.log(`Manifest saved to: ${MANIFEST_PATH}`);
}

main().catch(console.error);
