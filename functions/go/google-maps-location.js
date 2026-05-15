const MAPS_URL = 'https://www.google.com/maps/place/Hamza+Express/@12.9868521,77.6018339,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae1771b42304f9:0xb86ab64920519df9!8m2!3d12.9868469!4d77.6044088!16s%2Fg%2F11z0yk3x5g';

export async function onRequest() {
  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hamza Express Directions</title>
<style>
:root{color-scheme:dark;--bg:#090d12;--card:#151c25;--line:#2a3544;--text:#f8fafc;--muted:#a7b0bd;--green:#22c55e;--gold:#f5b84b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh;display:grid;place-items:center;padding:18px}
main{width:min(460px,100%);background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.kicker{font-size:12px;color:var(--gold);font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}
h1{font-size:26px;line-height:1.12;margin:0 0 8px}p{color:var(--muted);font-size:15px;line-height:1.55;margin:0 0 16px}
.proof{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}.proof div{border:1px solid var(--line);border-radius:8px;padding:10px;font-size:13px;color:var(--muted)}.proof strong{display:block;color:var(--text);font-size:15px;margin-bottom:2px}
.actions{display:grid;gap:10px;margin-top:16px}a{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:8px;text-decoration:none;font-weight:800}
.primary{background:var(--green);color:#06130b}.secondary{border:1px solid var(--line);color:var(--text);background:#0f151d}.fine{font-size:12px;color:var(--muted);text-align:center;margin-top:14px}
</style>
</head>
<body>
<main>
  <div class="kicker">Google Maps directions</div>
  <h1>Hamza Express, HKP Road</h1>
  <p>This is the correct Hamza Express pin for biryani, kabab, ghee rice, dine-in and parcel.</p>
  <div class="proof">
    <div><strong>Location</strong>HKP Road, Shivajinagar</div>
    <div><strong>Pin</strong>12.9868469, 77.6044088</div>
    <div><strong>Action</strong>Open Google Maps</div>
    <div><strong>Food</strong>Biryani + Kabab</div>
  </div>
  <div class="actions">
    <a class="primary" href="${MAPS_URL}">Open Google Maps</a>
    <a class="secondary" href="/go/google-brand-search">Hamza Express Details</a>
    <a class="secondary" href="/menu/">View Menu</a>
  </div>
  <div class="fine">The ad lands on hamzaexpress.in first to keep Google Ads destination policy clean.</div>
</main>
</body>
</html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
