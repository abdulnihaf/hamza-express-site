// KDS Brand Proxy — Cloudflare Pages Function
// Reverse-proxies the Odoo pos-order-tracking page and injects Hamza Express brand CSS
// Routes: /kds/* → ops.hamzahotel.com/* (production)
//         /kds/*?env=test → test.hamzahotel.com/* (test)
//         /kds/*?portrait=1 → portrait mode (CSS rotation for vertical TV, no brand overlay)
// Preserves 100% of KDS behaviour — only adds visual branding

const PROD_ORIGIN = 'https://ops.hamzahotel.com';
const TEST_ORIGIN = 'https://test.hamzahotel.com';

// ─── Portrait Rotation CSS ──────────────────────────────────────────────────────
// For vertically-mounted TVs: Fire Stick outputs 1920×1080 landscape HDMI
// CSS rotates content -90° so it appears upright on a TV mounted 90° CW
// Odoo's own QWeb branding is used (no proxy brand overlay to avoid double-branding)
const PORTRAIT_CSS = `
/* ═══════════════════════════════════════════════════════════════════════
   Portrait Mode — CSS rotation for vertically-mounted TV
   Fire Stick: 1920×1080 HDMI → TV mounted with LEFT edge up (90° CCW)
   Content rotated -90° to appear upright on the vertical display
   ═══════════════════════════════════════════════════════════════════════ */

html, body, body.o_web_client {
  width: 100vw !important;
  height: 100vh !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
  background: #110804 !important;
}

/* Rotate the main KDS container to portrait.
   Container stays at full viewport (100vh × 100vw = 1080 × 1920px) so Odoo
   layout renders naturally. scale(0.92) then shrinks the visual output uniformly,
   creating an exact 4% TV-safe margin on every edge:
     • Long edges (header/footer direction): (1920 − 1766.4) ÷ 2 = 76.8px (4.0%)
     • Short edges (left/right for viewer):  (1080 − 993.6)  ÷ 2 = 43.2px (4.0%)
   Header (element top) → HDMI left → viewer TOP → 76.8px margin.
   Handles up to 4% TV overscan without any content clipping. */
.o_tracking_display_main,
.o_tracking_display_main.vh-100,
.o_tracking_display_main.vh-100.text-bg-700 {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  width: 100vh !important;    /* 1080px — full viewport height (portrait width) */
  height: 100vw !important;   /* 1920px — full viewport width (portrait height) */
  max-height: none !important;
  transform: translate(-50%, -50%) rotate(-90deg) scale(0.92) !important;
  overflow: hidden !important;
  border-radius: 4px !important;
}

/* ── Override Bootstrap grid: 2 columns for portrait ── */
.o_tracking_display_main .row.row-cols-lg-4 > .col,
.o_tracking_display_main .row.row-cols-xxl-5 > .col {
  flex: 0 0 50% !important;
  max-width: 50% !important;
}

/* ── Cards: sized for portrait readability ── */
.o_tracking_display_main .o_tracking_display_number {
  font-size: clamp(32px, 5vmin, 64px) !important;
  padding: 16px 12px !important;
}

/* ── Hide Odoo watermark/footer ── */
.o_tracking_display_main .o_tracking_display_logo,
.o_tracking_display_main .o_tracking_display_fadeOut {
  display: none !important;
}
`;

// ─── Portrait-only URL rewriting script (no header rebuild) ─────────────────────
const PORTRAIT_OVERRIDE_SCRIPT = `<script>
(function(){
  var OO='__ODOO_ORIGIN__';
  function rw(u){if(typeof u!=='string')return u;if(u.indexOf(OO)===0)return'/kds'+u.substring(OO.length);if(u.charAt(0)==='/'&&u.indexOf('/kds/')!==0&&u.charAt(1)!=='/')return'/kds'+u;return u;}
  var _f=window.fetch;
  window.fetch=function(u,o){
    if(typeof u==='string'){u=rw(u);}
    else if(u instanceof Request){try{var nr=rw(u.url);if(nr!==u.url)u=new Request(nr,u);}catch(e){}}
    return _f.call(this,u,o);
  };
  var _x=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(){
    arguments[1]=rw(arguments[1]);
    return _x.apply(this,arguments);
  };
  var _ce=document.createElement.bind(document);
  document.createElement=function(tag){
    var el=_ce(tag);
    if(tag==='script'||tag==='link'||tag==='img'){
      var _sa=el.setAttribute.bind(el);
      el.setAttribute=function(n,v){
        if(n==='src'||n==='href')v=rw(v);
        return _sa(n,v);
      };
    }
    return el;
  };
  var _WS=window.WebSocket;
  window.WebSocket=function(url,protocols){
    if(typeof url==='string'){
      if(url.charAt(0)==='/'&&url.indexOf('/kds/')!==0&&url.charAt(1)!=='/'){url='/kds'+url;}
      else{try{var p=new URL(url);if(p.host===location.host&&!p.pathname.startsWith('/kds/')){p.pathname='/kds'+p.pathname;url=p.toString();}}catch(e){}}
    }
    return protocols?new _WS(url,protocols):new _WS(url);
  };
  window.WebSocket.prototype=_WS.prototype;
  window.WebSocket.CONNECTING=_WS.CONNECTING;
  window.WebSocket.OPEN=_WS.OPEN;
  window.WebSocket.CLOSING=_WS.CLOSING;
  window.WebSocket.CLOSED=_WS.CLOSED;
})();
</script>`;

// ─── Brand CSS ─────────────────────────────────────────────────────────────────
const BRAND_CSS = `
/* ═══════════════════════════════════════════════════════════════════════
   Hamza Express — KDS Brand Theme
   Font: Cinzel  |  Palette: Burgundy + Gold  |  Since 1918
   ═══════════════════════════════════════════════════════════════════════ */

/* ── CSS Variables ────────────────────────────────────────── */
:root {
  --he-bg-darkest:   #110804;
  --he-bg-dark:      #1A0A06;
  --he-burgundy:     #3D1610;
  --he-burgundy-mid: #5C2018;
  --he-burgundy-lt:  #7A3028;
  --he-gold-dk:      #8B6914;
  --he-gold:         #C9A96E;
  --he-gold-lt:      #D4A574;
  --he-gold-bright:  #E8C99B;
  --he-cream:        #F5E6D3;
  --he-white:        #FFF8F0;
  --he-green-dk:     #0F3D2B;
  --he-green:        #17694A;
  --he-green-lt:     #1FA564;
  --he-amber-dk:     #5C4000;
  --he-amber:        #A67C00;
  --he-amber-lt:     #D4A017;
}

/* ── Page Background ─────────────────────────────────────── */
html, body, body.o_web_client {
  background: var(--he-bg-darkest) !important;
  margin: 0 !important;
  overflow: hidden !important;
}

.o_tracking_display_main,
.o_tracking_display_main.vh-100,
.o_tracking_display_main.vh-100.text-bg-700 {
  background: linear-gradient(
    180deg,
    var(--he-bg-darkest) 0%,
    var(--he-burgundy) 8%,
    var(--he-burgundy) 92%,
    var(--he-bg-darkest) 100%
  ) !important;
  font-family: 'Cinzel', 'Georgia', 'Times New Roman', serif !important;
  color: var(--he-cream) !important;
  position: relative !important;
}

/* ── Gold Frame Border ───────────────────────────────────── */
.o_tracking_display_main::before {
  content: '' !important;
  position: fixed !important;
  inset: 6px !important;
  border: 2px solid rgba(201,169,110,0.22) !important;
  pointer-events: none !important;
  z-index: 9999 !important;
}
.o_tracking_display_main::after {
  content: '' !important;
  position: fixed !important;
  inset: 10px !important;
  border: 1px solid rgba(201,169,110,0.08) !important;
  pointer-events: none !important;
  z-index: 9999 !important;
}

/* ══════════════════════════════════════════════════════════════
   HEADER — Shared base styles (both Kitchen Pass & Bain Marie)
   Icon + "Hamza EXPRESS" text logo side by side, like the board
   ══════════════════════════════════════════════════════════════ */
#he-header-bar, #he-bm-header-bar {
  background: linear-gradient(180deg,
    rgba(17,8,4,0.97) 0%,
    rgba(42,14,8,0.95) 100%) !important;
  border-bottom: 2.5px solid var(--he-gold) !important;
  position: relative !important;
  z-index: 100 !important;
  box-shadow: 0 6px 30px rgba(0,0,0,0.6) !important;
  overflow: hidden !important;
}
/* subtle gold glow line under both headers */
#he-header-bar::after, #he-bm-header-bar::after {
  content: '' !important;
  position: absolute !important;
  bottom: -4px !important;
  left: 12% !important;
  right: 12% !important;
  height: 1px !important;
  background: linear-gradient(90deg, transparent, rgba(201,169,110,0.35), transparent) !important;
}

/* ══════════════════════════════════════════════════════════════
   HEADER — Kitchen Counter (landscape 1920×1080)
   Counter name stays CENTERED (Odoo's default absolute positioning).
   Brand group (icon+text) added to the LEFT CORNER alongside it.
   ══════════════════════════════════════════════════════════════ */
#he-header-bar {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  padding: 10px 36px !important;
  gap: 14px !important;
}
/* Kitchen Pass: hide the divider — title is centered independently */
#he-header-bar > .he-header-divider {
  display: none !important;
}

/* ══════════════════════════════════════════════════════════════
   HEADER — Bain Marie Counter (portrait 1080×1920)
   Brand group + divider + counter name in a LEFT-ALIGNED row.
   ══════════════════════════════════════════════════════════════ */
#he-bm-header-bar {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  padding: 14px 20px !important;
  gap: 16px !important;
}
/* Bain Marie: reset Odoo's absolute+transform centering on title */
#he-bm-header-bar > .he-bm-title {
  position: static !important;
  transform: none !important;
  left: auto !important;
}

/* ── Brand Group: icon + text logo container ─────────────── */
.he-brand-group {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 10px !important;
  flex-shrink: 0 !important;
}

/* ── Icon logo (circular emblem) ─────────────────────────── */
.he-logo-icon, .he-bm-logo-icon {
  object-fit: contain !important;
  border-radius: 50% !important;
  border: 2px solid var(--he-gold) !important;
  box-shadow:
    0 3px 16px rgba(0,0,0,0.45),
    0 0 20px rgba(201,169,110,0.15) !important;
  flex-shrink: 0 !important;
}
.he-logo-icon {
  height: 56px !important;
  width: 56px !important;
}
.he-bm-logo-icon {
  height: 56px !important;
  width: 56px !important;
}

/* ── Text logo — CSS mask-image with exact brand font + colors ── */
.he-logo-text, .he-bm-logo-text {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  gap: 2px !important;
  flex-shrink: 0 !important;
}
/* "Hamza" — Off-White #FAF3E3 via mask */
.he-text-hamza {
  background-color: #FAF3E3 !important;
  -webkit-mask-image: url(/assets/brand/he-text-hamza.png) !important;
  -webkit-mask-size: contain !important;
  -webkit-mask-repeat: no-repeat !important;
  mask-image: url(/assets/brand/he-text-hamza.png) !important;
  mask-size: contain !important;
  mask-repeat: no-repeat !important;
}
/* "EXPRESS" — Tan #D2B48C via mask */
.he-text-express {
  background-color: #D2B48C !important;
  -webkit-mask-image: url(/assets/brand/he-text-express.png) !important;
  -webkit-mask-size: contain !important;
  -webkit-mask-repeat: no-repeat !important;
  mask-image: url(/assets/brand/he-text-express.png) !important;
  mask-size: contain !important;
  mask-repeat: no-repeat !important;
}
/* Kitchen Pass sizes — same ratio as Bain Marie */
.he-logo-text .he-text-hamza {
  width: 80px !important;
  height: 19px !important;
}
.he-logo-text .he-text-express {
  width: 80px !important;
  height: 9px !important;
}
/* Bain Marie sizes — subtle, counter name is the hero */
.he-bm-logo-text .he-text-hamza {
  width: 80px !important;
  height: 19px !important;
}
.he-bm-logo-text .he-text-express {
  width: 80px !important;
  height: 9px !important;
}

/* ── Divider between brand group and counter name ────────── */
.he-header-divider {
  width: 1.5px !important;
  height: 40px !important;
  background: linear-gradient(180deg, transparent, var(--he-gold), transparent) !important;
  opacity: 0.5 !important;
  flex-shrink: 0 !important;
  margin: 0 8px !important;
}

/* ── Counter Name (MUST STAND OUT) ────────────────────────── */
.he-title, .he-bm-title {
  font-family: 'Cinzel', serif !important;
  font-weight: 700 !important;
  color: var(--he-gold-lt) !important;
  text-transform: uppercase !important;
  text-shadow:
    0 0 25px rgba(212,165,116,0.25),
    0 2px 4px rgba(0,0,0,0.6) !important;
  white-space: nowrap !important;
  flex-shrink: 0 !important;
}
.he-title {
  font-size: clamp(18px, 2.4vw, 36px) !important;
  letter-spacing: 5px !important;
}
.he-bm-title {
  font-size: clamp(18px, 2.8vw, 36px) !important;
  letter-spacing: 5px !important;
}

/* ── Est. 1918 — hidden now; counter name is enough ──────── */
.he-tagline, .he-bm-est {
  display: none !important;
}

/* ══════════════════════════════════════════════════════════════
   SECTION CONTAINERS
   ══════════════════════════════════════════════════════════════ */
.o_tracking_display_main > .container-fluid {
  padding: 14px 22px 8px !important;
}

/* ── Section Headers: READY / PREPARING ───────────────────── */
.o_tracking_display_main .container-fluid > .mb-2.fw-bolder,
.o_tracking_display_main .container-fluid > div.mb-2.fs-6.fw-bolder {
  font-family: 'Cinzel', serif !important;
  font-weight: 700 !important;
  font-size: clamp(14px, 1.2vw, 22px) !important;
  letter-spacing: 4px !important;
  padding: 8px 20px !important;
  border-radius: 5px !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 10px !important;
  margin-bottom: 14px !important;
  text-transform: uppercase !important;
}

/* READY header — emerald bar  (.mb-5 = READY section in Odoo DOM) */
.o_tracking_display_main > .container-fluid.mb-5 > .mb-2.fw-bolder,
.o_tracking_display_main > .container-fluid.mb-5 > div.mb-2.fs-6.fw-bolder {
  background: linear-gradient(90deg, var(--he-green-dk), var(--he-green), var(--he-green-dk)) !important;
  color: #d4f5e2 !important;
  border-left: 4px solid var(--he-gold) !important;
  box-shadow: 0 2px 12px rgba(23,105,74,0.25) !important;
}

/* PREPARING header — amber bar  (no .mb-5 = PREPARING section in Odoo DOM) */
.o_tracking_display_main > .container-fluid:not(.mb-5) > .mb-2.fw-bolder,
.o_tracking_display_main > .container-fluid:not(.mb-5) > div.mb-2.fs-6.fw-bolder {
  background: linear-gradient(90deg, var(--he-amber-dk), var(--he-amber), var(--he-amber-dk)) !important;
  color: #fff5d4 !important;
  border-left: 4px solid var(--he-gold) !important;
  box-shadow: 0 2px 12px rgba(166,124,0,0.25) !important;
}

/* ══════════════════════════════════════════════════════════════
   ORDER CARDS
   ══════════════════════════════════════════════════════════════ */
.o_tracking_display_number,
.o_tracking_display_number.p-3,
.o_tracking_display_number.p-3.rounded.fs-4.fw-bolder {
  font-family: 'Cinzel', serif !important;
  font-weight: 800 !important;
  border-radius: 10px !important;
  padding: 14px 10px !important;
  margin-bottom: 10px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  position: relative !important;
  overflow: hidden !important;
  transition: transform 0.35s ease, box-shadow 0.35s ease !important;
  animation: heCardIn 0.5s ease both !important;
}

/* READY cards — deep emerald */
.o_tracking_display_number.text-bg-700 {
  background: linear-gradient(150deg, #0F3D2B 0%, #17694A 100%) !important;
  color: #FFFFFF !important;
  font-size: clamp(28px, 3.5vw, 72px) !important;
  border: 2px solid rgba(201,169,110,0.45) !important;
  box-shadow:
    0 4px 20px rgba(0,0,0,0.35),
    0 0 20px rgba(23,105,74,0.12),
    inset 0 1px 0 rgba(255,255,255,0.05) !important;
}
/* gold accent stripe on top */
.o_tracking_display_number.text-bg-700::before {
  content: '' !important;
  position: absolute !important;
  top: 0; left: 0; right: 0 !important;
  height: 3px !important;
  background: linear-gradient(90deg, transparent 10%, var(--he-green-lt) 50%, transparent 90%) !important;
}

/* PREPARING cards — deep amber/gold */
.o_tracking_display_number.text-bg-600 {
  background: linear-gradient(150deg, var(--he-amber-dk) 0%, #7D5A00 100%) !important;
  color: #FFFFFF !important;
  font-size: clamp(28px, 3.5vw, 72px) !important;
  border: 2px solid rgba(201,169,110,0.35) !important;
  box-shadow:
    0 4px 20px rgba(0,0,0,0.35),
    0 0 20px rgba(166,124,0,0.1),
    inset 0 1px 0 rgba(255,255,255,0.05) !important;
}
.o_tracking_display_number.text-bg-600::before {
  content: '' !important;
  position: absolute !important;
  top: 0; left: 0; right: 0 !important;
  height: 3px !important;
  background: linear-gradient(90deg, transparent 10%, var(--he-amber-lt) 50%, transparent 90%) !important;
}

/* Source labels inside cards (WhatsApp, Counter, etc.) */
.o_tracking_display_number > div,
.o_tracking_display_number div[style] {
  font-family: 'Cinzel', serif !important;
  font-weight: 500 !important;
  font-size: 0.32em !important;
  color: rgba(255,255,255,0.55) !important;
  letter-spacing: 1.5px !important;
  margin-top: 2px !important;
  text-transform: uppercase !important;
}

/* ══════════════════════════════════════════════════════════════
   KITCHEN PASS — LANDSCAPE LAYOUT (1920×1080 viewport)
   43" TV horizontal • 37.5" × 21.1" frame
   NO SCROLLING — entire display fills fixed 1920×1080 exactly
   ══════════════════════════════════════════════════════════════ */
/* KP: fill viewport, no scroll, sections auto-size by content */
.he-kp-layout {
  height: 100vh !important;
  max-height: 100vh !important;
  overflow: hidden !important;
}
/* Hide footer elements — reclaim space for cards */
.he-kp-layout .o_tracking_display_logo,
.he-kp-layout .o_tracking_display_fadeOut {
  display: none !important;
}

/* ══════════════════════════════════════════════════════════════
   BAIN MARIE — PORTRAIT LAYOUT (1080×1920 viewport)
   43" TV mounted vertically • 21.1" wide × 37.5" tall
   Fire Stick outputs 1920×1080 → CSS-rotated via kds-portrait.html
   Effective iframe viewport: exactly 1080px × 1920px
   NO SCROLLING — entire display fills fixed space exactly
   ══════════════════════════════════════════════════════════════ */

/* BM: fill viewport, no scroll, sections auto-size by content */
.he-bm-layout {
  height: 100vh !important;
  max-height: 100vh !important;
  overflow: hidden !important;
  padding: 0 !important;
}

/* ── BM Header — portrait-specific overrides for 1080×1920 ─── */
.he-bm-layout > #he-bm-header-bar {
  padding: 30px 36px !important;
  gap: 22px !important;
}
.he-bm-layout .he-bm-logo-icon {
  height: 90px !important;
  width: 90px !important;
  border-width: 3px !important;
}
.he-bm-layout .he-bm-logo-text .he-text-hamza {
  width: 140px !important;
  height: 33px !important;
}
.he-bm-layout .he-bm-logo-text .he-text-express {
  width: 140px !important;
  height: 15px !important;
}
.he-bm-layout .he-header-divider {
  height: 70px !important;
}
.he-bm-layout .he-bm-title {
  font-size: 56px !important;
  font-weight: 700 !important;
  letter-spacing: 6px !important;
}

/* ── BM Section headers — scaled for portrait frame ──────── */
.he-bm-layout .container-fluid > .mb-2.fw-bolder,
.he-bm-layout .container-fluid > div.mb-2.fs-6.fw-bolder {
  font-size: 22px !important;
  padding: 12px 28px !important;
  letter-spacing: 5px !important;
  margin-bottom: 14px !important;
}

/* ── BM Card grid — wider gaps for portrait ──────── */
.he-bm-layout .container-fluid > .row {
  --bs-gutter-x: 18px !important;
  --bs-gutter-y: 18px !important;
}

/* ── BM Cards — large order numbers for distance reading ── */
.he-bm-layout .o_tracking_display_number.text-bg-700,
.he-bm-layout .o_tracking_display_number.text-bg-600 {
  font-size: 90px !important;
  padding: 24px 16px !important;
  border-radius: 16px !important;
  min-height: 100px !important;
  border-width: 3px !important;
}
.he-bm-layout .o_tracking_display_number > div,
.he-bm-layout .o_tracking_display_number div[style] {
  font-size: 22px !important;
  letter-spacing: 2px !important;
}

/* ── BM Hide footer/watermark — reclaim precious space ─── */
.he-bm-layout .o_tracking_display_logo,
.he-bm-layout .o_tracking_display_fadeOut {
  display: none !important;
}

/* ── Card entrance animation ──────────────────────────────── */
@keyframes heCardIn {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Footer Logo & Fade ──────────────────────────────────── */
.o_tracking_display_logo {
  opacity: 0.1 !important;
  filter: grayscale(0.6) brightness(0.8) !important;
}
.o_tracking_display_fadeOut {
  background: linear-gradient(to bottom, transparent, var(--he-bg-darkest)) !important;
}

/* ── Scrollbar ────────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px !important; }
::-webkit-scrollbar-track { background: var(--he-bg-dark) !important; }
::-webkit-scrollbar-thumb {
  background: var(--he-gold) !important;
  border-radius: 3px !important;
}

/* ── Grid gap refinement ──────────────────────────────────── */
.o_tracking_display_main .row {
  --bs-gutter-x: 10px !important;
  --bs-gutter-y: 10px !important;
}

/* ── Hide any Odoo branding/watermarks ────────────────────── */
.o_tracking_display_main .text-muted,
.o_tracking_display_main footer {
  display: none !important;
}

/* ── Smooth transition for dynamic updates ────────────────── */
.o_tracking_display_main .col {
  transition: all 0.3s ease !important;
}
`;

// ─── Fetch / XHR Override Script ───────────────────────────────────────────────
// Rewrites all root-relative URLs (e.g. /web/assets/...) to go through the proxy
const OVERRIDE_SCRIPT = `<script>
(function(){
  var OO='__ODOO_ORIGIN__';
  function rw(u){if(typeof u!=='string')return u;if(u.indexOf(OO)===0)return'/kds'+u.substring(OO.length);if(u.charAt(0)==='/'&&u.indexOf('/kds/')!==0&&u.charAt(1)!=='/')return'/kds'+u;return u;}
  // Override fetch()
  var _f=window.fetch;
  window.fetch=function(u,o){
    if(typeof u==='string'){u=rw(u);}
    else if(u instanceof Request){try{var nr=rw(u.url);if(nr!==u.url)u=new Request(nr,u);}catch(e){}}
    return _f.call(this,u,o);
  };
  // Override XMLHttpRequest.open()
  var _x=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(){
    arguments[1]=rw(arguments[1]);
    return _x.apply(this,arguments);
  };
  // Override dynamic script/link creation
  var _ce=document.createElement.bind(document);
  document.createElement=function(tag){
    var el=_ce(tag);
    if(tag==='script'||tag==='link'||tag==='img'){
      var _sa=el.setAttribute.bind(el);
      el.setAttribute=function(n,v){
        if(n==='src'||n==='href')v=rw(v);
        return _sa(n,v);
      };
    }
    return el;
  };
  // Override WebSocket to route through proxy (preserves session cookies)
  var _WS=window.WebSocket;
  window.WebSocket=function(url,protocols){
    if(typeof url==='string'){
      // Bare paths: /websocket → /kds/websocket
      if(url.charAt(0)==='/'&&url.indexOf('/kds/')!==0&&url.charAt(1)!=='/'){url='/kds'+url;}
      // Full URLs on same host: wss://hamzaexpress.in/websocket → wss://hamzaexpress.in/kds/websocket
      else{try{var p=new URL(url);if(p.host===location.host&&!p.pathname.startsWith('/kds/')){p.pathname='/kds'+p.pathname;url=p.toString();}}catch(e){}}
    }
    return protocols?new _WS(url,protocols):new _WS(url);
  };
  window.WebSocket.prototype=_WS.prototype;
  window.WebSocket.CONNECTING=_WS.CONNECTING;
  window.WebSocket.OPEN=_WS.OPEN;
  window.WebSocket.CLOSING=_WS.CLOSING;
  window.WebSocket.CLOSED=_WS.CLOSED;
  // Rebuild header with icon + text logo side by side (like the restaurant board)
  function rebuildHeader(){
    var main=document.querySelector('.o_tracking_display_main');
    // Kitchen Pass header
    var kh=document.getElementById('he-header-bar');
    if(kh && !kh.dataset.rebuilt){
      kh.dataset.rebuilt='1';
      // Move header inside main & add layout class for CSS targeting
      if(main && kh.parentElement!==main) main.insertBefore(kh,main.firstChild);
      if(main) main.classList.add('he-kp-layout');
      // Find existing elements
      var logoWrap=kh.querySelector('.he-logo-wrap');
      var title=kh.querySelector('.he-title');
      var tagline=kh.querySelector('.he-tagline');
      // Remove old logo wrap and tagline
      if(logoWrap) logoWrap.remove();
      if(tagline) tagline.remove();
      // Create brand group: icon + text
      var bg=document.createElement('div');
      bg.className='he-brand-group';
      var icon=document.createElement('img');
      icon.className='he-logo-icon';
      icon.src='/assets/brand/he-icon.png';
      icon.alt='Hamza Express';
      var txt=document.createElement('div');
      txt.className='he-logo-text';
      var th=document.createElement('div');th.className='he-text-hamza';
      var te=document.createElement('div');te.className='he-text-express';
      txt.appendChild(th);txt.appendChild(te);
      bg.appendChild(icon);
      bg.appendChild(txt);
      // Create divider
      var div=document.createElement('div');
      div.className='he-header-divider';
      // Insert brand group + divider before title
      if(title){
        kh.insertBefore(bg,title);
        kh.insertBefore(div,title);
      } else {
        kh.appendChild(bg);
      }
    }
    // Bain Marie header
    var bh=document.getElementById('he-bm-header-bar');
    if(bh && !bh.dataset.rebuilt){
      bh.dataset.rebuilt='1';
      // Move header inside main & add layout class for CSS targeting
      if(main && bh.parentElement!==main) main.insertBefore(bh,main.firstChild);
      if(main) main.classList.add('he-bm-layout');
      var logoWrap2=bh.querySelector('.he-bm-logo-wrap');
      var title2=bh.querySelector('.he-bm-title');
      var est=bh.querySelector('.he-bm-est');
      if(logoWrap2) logoWrap2.remove();
      if(est) est.remove();
      // Shorten long Odoo name to just "BAIN MARIE"
      if(title2) title2.textContent='BAIN MARIE';
      var bg2=document.createElement('div');
      bg2.className='he-brand-group';
      var icon2=document.createElement('img');
      icon2.className='he-bm-logo-icon';
      icon2.src='/assets/brand/he-icon.png';
      icon2.alt='Hamza Express';
      var txt2=document.createElement('div');
      txt2.className='he-bm-logo-text';
      var th2=document.createElement('div');th2.className='he-text-hamza';
      var te2=document.createElement('div');te2.className='he-text-express';
      txt2.appendChild(th2);txt2.appendChild(te2);
      bg2.appendChild(icon2);
      bg2.appendChild(txt2);
      var div2=document.createElement('div');
      div2.className='he-header-divider';
      if(title2){
        bh.insertBefore(bg2,title2);
        bh.insertBefore(div2,title2);
      } else {
        bh.appendChild(bg2);
      }
    }
  }
  document.addEventListener('DOMContentLoaded',function(){
    rebuildHeader();
    new MutationObserver(rebuildHeader).observe(document.documentElement,{childList:true,subtree:true});
  });
})();
</script>`;

// ─── Font preload tags ─────────────────────────────────────────────────────────
const FONT_TAGS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`;

// ─── Helper: should this URL be rewritten? ─────────────────────────────────────
function shouldRewrite(url) {
  return url && url.charAt(0) === '/' && !url.startsWith('/kds/') && url.charAt(1) !== '/';
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Determine target Odoo origin (production vs test)
  const isTest = url.searchParams.get('env') === 'test';
  const odooOrigin = isTest ? TEST_ORIGIN : PROD_ORIGIN;
  // Portrait mode: CSS rotation for vertically-mounted TV (no brand overlay)
  const isPortrait = url.searchParams.get('portrait') === '1';

  // Strip /kds prefix to reconstruct the Odoo path
  const odooPath = url.pathname.replace(/^\/kds/, '') || '/';
  const odooUrl = new URL(odooPath, odooOrigin);
  odooUrl.search = url.search;
  // Remove our custom params so they don't leak to Odoo
  odooUrl.searchParams.delete('env');
  odooUrl.searchParams.delete('portrait');

  // ── Handle WebSocket upgrade — proxy transparently to Odoo ──
  // Cloudflare Workers natively support WebSocket proxying via fetch()
  if (context.request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    const wsHeaders = new Headers(context.request.headers);
    wsHeaders.set('Host', odooUrl.host);
    wsHeaders.set('Origin', odooOrigin);
    for (const h of ['cf-connecting-ip','cf-ray','cf-visitor','cf-ipcountry','cdn-loop','cf-worker']) {
      wsHeaders.delete(h);
    }
    return fetch(odooUrl.toString(), { headers: wsHeaders });
  }

  // Build request headers — forward most, fix Host
  const reqHeaders = new Headers(context.request.headers);
  reqHeaders.set('Host', odooUrl.host);
  reqHeaders.set('Origin', odooOrigin);
  reqHeaders.set('Referer', odooUrl.toString());
  // Remove CF-specific headers
  for (const h of ['cf-connecting-ip','cf-ray','cf-visitor','cf-ipcountry','cdn-loop','cf-worker']) {
    reqHeaders.delete(h);
  }

  // Forward the request to Odoo
  const fetchOpts = {
    method: context.request.method,
    headers: reqHeaders,
    redirect: 'manual',
  };
  if (!['GET','HEAD'].includes(context.request.method)) {
    fetchOpts.body = context.request.body;
  }

  let odooResp;
  try {
    odooResp = await fetch(odooUrl.toString(), fetchOpts);
  } catch (err) {
    return new Response(`<html><body style="background:#1A0A06;color:#D4A574;font-family:Cinzel,serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>Connection Error</h1><p>${err.message}</p></div></body></html>`, {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // ── Handle redirects — rewrite Location to stay in proxy ──
  if ([301,302,303,307,308].includes(odooResp.status)) {
    const loc = odooResp.headers.get('location');
    if (loc) {
      try {
        const redir = new URL(loc, odooUrl);
        if (redir.host === odooUrl.host) {
          const newLoc = '/kds' + redir.pathname + redir.search;
          const redirHeaders = new Headers({ 'Location': newLoc });
          // Forward cookies from redirect response (strip Domain for proxy)
          for (const c of (odooResp.headers.getAll('set-cookie') || [])) {
            redirHeaders.append('set-cookie', c.replace(/;\s*domain=[^;]*/gi, ''));
          }
          return new Response(null, {
            status: odooResp.status,
            headers: redirHeaders,
          });
        }
      } catch (e) { /* fall through */ }
    }
    return odooResp;
  }

  // ── Clean response headers ──
  const respHeaders = new Headers(odooResp.headers);
  respHeaders.delete('content-security-policy');
  respHeaders.delete('content-security-policy-report-only');
  respHeaders.delete('x-frame-options');
  // Allow embedding in portrait wrapper iframe
  respHeaders.set('X-Frame-Options', 'SAMEORIGIN');
  // Set permissive CORS for same-site XHR
  respHeaders.set('Access-Control-Allow-Origin', '*');
  respHeaders.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  respHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
  // Rewrite Set-Cookie — strip Domain so browser stores for proxy domain (hamzaexpress.in)
  const setCookies = respHeaders.getAll('set-cookie');
  if (setCookies.length) {
    respHeaders.delete('set-cookie');
    for (const c of setCookies) {
      respHeaders.append('set-cookie', c.replace(/;\s*domain=[^;]*/gi, ''));
    }
  }

  // ── Handle OPTIONS (CORS preflight) ──
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: respHeaders });
  }

  const contentType = odooResp.headers.get('content-type') || '';

  // ── HTML response: inject brand CSS + URL rewriting ──
  if (contentType.includes('text/html')) {
    let headInjected = false;
    const rewriter = new HTMLRewriter()
      // Inject scripts + CSS at START/END of <head> (only the first one)
      .on('head', {
        element(el) {
          if (headInjected) return;  // Odoo HTML has 2 <head> tags — only inject once
          headInjected = true;
          if (isPortrait) {
            // Portrait mode: URL rewriting only (no brand fonts/header rebuild)
            // Odoo QWeb provides its own branding — avoids double-branding
            el.prepend(PORTRAIT_OVERRIDE_SCRIPT.replace('__ODOO_ORIGIN__', odooOrigin), { html: true });
            el.append(`<style id="he-portrait-css">${PORTRAIT_CSS}</style>`, { html: true });
          } else {
            // Standard mode: full brand overlay with fonts + header rebuild
            el.prepend(FONT_TAGS + OVERRIDE_SCRIPT.replace('__ODOO_ORIGIN__', odooOrigin), { html: true });
            el.append(`<style id="he-brand-css">${BRAND_CSS}</style>`, { html: true });
          }
        }
      })
      // Portrait: also inject CSS at END of body (overrides Odoo QWeb inline styles)
      .on('body', {
        element(el) {
          if (isPortrait) {
            el.append(`<style id="he-portrait-final">${PORTRAIT_CSS}</style>`, { html: true });
          }
        }
      })
      // Rewrite <script src="/..."> → <script src="/kds/...">
      .on('script[src]', {
        element(el) {
          const src = el.getAttribute('src');
          if (shouldRewrite(src)) el.setAttribute('src', '/kds' + src);
        }
      })
      // Rewrite <link href="/...">
      .on('link[href]', {
        element(el) {
          const href = el.getAttribute('href');
          if (shouldRewrite(href)) el.setAttribute('href', '/kds' + href);
        }
      })
      // Rewrite <img src="/...">
      .on('img[src]', {
        element(el) {
          const src = el.getAttribute('src');
          if (shouldRewrite(src)) el.setAttribute('src', '/kds' + src);
        }
      })
      // Rewrite <a href="/...">
      .on('a[href]', {
        element(el) {
          const href = el.getAttribute('href');
          if (shouldRewrite(href)) el.setAttribute('href', '/kds' + href);
        }
      })
      // Rewrite <form action="/...">
      .on('form[action]', {
        element(el) {
          const action = el.getAttribute('action');
          if (shouldRewrite(action)) el.setAttribute('action', '/kds' + action);
        }
      });

    // Remove content-length since we're modifying the body
    respHeaders.delete('content-length');
    respHeaders.delete('content-encoding');

    return rewriter.transform(new Response(odooResp.body, {
      status: odooResp.status,
      headers: respHeaders,
    }));
  }

  // ── Non-HTML (JS, CSS, images, JSON): pass through ──
  return new Response(odooResp.body, {
    status: odooResp.status,
    headers: respHeaders,
  });
}
