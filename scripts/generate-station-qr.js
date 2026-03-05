// Generate Station QR codes for Hamza Express counter ordering
// Each QR points to /go/{slug} redirect — pre-fill text is managed in D1 via admin UI
// QR codes never need reprinting since the redirect target is editable

const QRCode = require('qrcode');
const path = require('path');

const DOMAIN = 'https://hamzaexpress.in';
const OUTPUT_DIR = '/Users/nihaf/Desktop/HE-Station-QR';

const STATIONS = [
  { slug: 'bm',       filename: 'QR-BainMarie.png' },
  { slug: 'juice',    filename: 'QR-Juice.png' },
  { slug: 'shawarma', filename: 'QR-Shawarma.png' },
  { slug: 'grill',    filename: 'QR-Grill.png' },
  { slug: 'sheek',    filename: 'QR-SheekKabab.png' },
];

async function generate() {
  for (const station of STATIONS) {
    const url = `${DOMAIN}/go/${station.slug}`;
    const outPath = path.join(OUTPUT_DIR, station.filename);

    await QRCode.toFile(outPath, url, {
      width: 1024,
      margin: 2,
      color: { dark: '#3D1610', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    });

    console.log(`✓ ${station.filename} → ${url}`);
  }
  console.log(`\nAll QR codes saved to ${OUTPUT_DIR}`);
}

generate().catch(console.error);
