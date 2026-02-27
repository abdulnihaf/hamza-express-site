// KDS Brand Proxy — Cloudflare Pages Function
// Reverse-proxies the Odoo pos-order-tracking page and injects Hamza Express brand CSS
// Routes: /kds/* → ops.hamzahotel.com/* (production)
//         /kds/*?env=test → test.hamzahotel.com/* (test)
// Preserves 100% of KDS behaviour — only adds visual branding

const PROD_ORIGIN = 'https://ops.hamzahotel.com';
const TEST_ORIGIN = 'https://test.hamzahotel.com';

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
   HEADER — Kitchen Counter (landscape)
   ══════════════════════════════════════════════════════════════ */
#he-header-bar {
  background: linear-gradient(180deg,
    rgba(17,8,4,0.97) 0%,
    rgba(42,14,8,0.95) 100%) !important;
  border-bottom: 2.5px solid var(--he-gold) !important;
  padding: 10px 36px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 28px !important;
  position: relative !important;
  z-index: 100 !important;
  box-shadow: 0 6px 30px rgba(0,0,0,0.6) !important;
}
/* subtle gold glow line */
#he-header-bar::after {
  content: '' !important;
  position: absolute !important;
  bottom: -4px !important;
  left: 12% !important;
  right: 12% !important;
  height: 1px !important;
  background: linear-gradient(90deg, transparent, rgba(201,169,110,0.35), transparent) !important;
}

/* ══════════════════════════════════════════════════════════════
   HEADER — Bain Marie Counter (portrait / vertical TV)
   ══════════════════════════════════════════════════════════════ */
#he-bm-header-bar {
  background: linear-gradient(180deg,
    rgba(17,8,4,0.97) 0%,
    rgba(42,14,8,0.95) 100%) !important;
  border-bottom: 2.5px solid var(--he-gold) !important;
  padding: 14px 20px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  position: relative !important;
  z-index: 100 !important;
  box-shadow: 0 6px 30px rgba(0,0,0,0.6) !important;
}
#he-bm-header-bar::after {
  content: '' !important;
  position: absolute !important;
  bottom: -4px !important;
  left: 15% !important;
  right: 15% !important;
  height: 1px !important;
  background: linear-gradient(90deg, transparent, rgba(201,169,110,0.35), transparent) !important;
}

/* ── Logo ─────────────────────────────────────────────────── */
.he-logo-wrap, .he-bm-logo-wrap {
  display: flex !important;
  align-items: center !important;
  flex-shrink: 0 !important;
}
.he-logo {
  height: 52px !important;
  width: 52px !important;
  object-fit: cover !important;
  border-radius: 50% !important;
  border: 2px solid var(--he-gold) !important;
  box-shadow: 0 0 18px rgba(201,169,110,0.25) !important;
}
.he-bm-logo {
  height: 46px !important;
  width: 46px !important;
  object-fit: cover !important;
  border-radius: 50% !important;
  border: 2px solid var(--he-gold) !important;
  box-shadow: 0 0 18px rgba(201,169,110,0.25) !important;
}

/* ── Counter Name (MUST STAND OUT) ────────────────────────── */
.he-title {
  font-family: 'Cinzel', serif !important;
  font-weight: 700 !important;
  font-size: clamp(28px, 2.8vw, 56px) !important;
  color: var(--he-gold-lt) !important;
  text-transform: uppercase !important;
  letter-spacing: 6px !important;
  text-shadow:
    0 0 25px rgba(212,165,116,0.25),
    0 2px 4px rgba(0,0,0,0.6) !important;
  white-space: nowrap !important;
}
.he-bm-title {
  font-family: 'Cinzel', serif !important;
  font-weight: 700 !important;
  font-size: clamp(22px, 3.2vw, 42px) !important;
  color: var(--he-gold-lt) !important;
  text-transform: uppercase !important;
  letter-spacing: 5px !important;
  text-shadow:
    0 0 25px rgba(212,165,116,0.25),
    0 2px 4px rgba(0,0,0,0.6) !important;
}

/* ── Est. 1918 ────────────────────────────────────────────── */
.he-tagline, .he-bm-est {
  font-family: 'Cinzel', serif !important;
  font-weight: 400 !important;
  font-size: clamp(10px, 0.85vw, 16px) !important;
  color: var(--he-gold) !important;
  letter-spacing: 3px !important;
  opacity: 0.65 !important;
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

/* READY header — emerald bar */
.o_tracking_display_main > .container-fluid:not(.mb-5) > .mb-2.fw-bolder,
.o_tracking_display_main > .container-fluid:not(.mb-5) > div.mb-2.fs-6.fw-bolder {
  background: linear-gradient(90deg, var(--he-green-dk), var(--he-green), var(--he-green-dk)) !important;
  color: #d4f5e2 !important;
  border-left: 4px solid var(--he-gold) !important;
  box-shadow: 0 2px 12px rgba(23,105,74,0.25) !important;
}

/* PREPARING header — amber bar */
.o_tracking_display_main > .container-fluid.mb-5 > .mb-2.fw-bolder,
.o_tracking_display_main > .container-fluid.mb-5 > div.mb-2.fs-6.fw-bolder {
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

/* ── Bain Marie: larger cards for portrait layout ─────────── */
/* Uses :has() for modern browsers, with media-query fallback */
.o_tracking_display_main:has(#he-bm-header-bar) .o_tracking_display_number.text-bg-700,
.o_tracking_display_main:has(#he-bm-header-bar) .o_tracking_display_number.text-bg-600 {
  font-size: clamp(36px, 7vw, 100px) !important;
  padding: 20px 12px !important;
  border-radius: 14px !important;
  min-height: 90px !important;
}
.o_tracking_display_main:has(#he-bm-header-bar) .o_tracking_display_number > div,
.o_tracking_display_main:has(#he-bm-header-bar) .o_tracking_display_number div[style] {
  font-size: 0.25em !important;
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
  // Override fetch()
  var _f=window.fetch;
  window.fetch=function(u,o){
    if(typeof u==='string'&&u.charAt(0)==='/'&&u.indexOf('/kds/')!==0&&u.charAt(1)!=='/'){u='/kds'+u;}
    else if(u instanceof Request){try{var p=new URL(u.url);if(p.origin===location.origin&&p.pathname.charAt(0)==='/'&&p.pathname.indexOf('/kds/')!==0){u=new Request('/kds'+p.pathname+p.search+p.hash,u);}}catch(e){}}
    return _f.call(this,u,o);
  };
  // Override XMLHttpRequest.open()
  var _x=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(){
    var u=arguments[1];
    if(typeof u==='string'&&u.charAt(0)==='/'&&u.indexOf('/kds/')!==0&&u.charAt(1)!=='/'){arguments[1]='/kds'+u;}
    return _x.apply(this,arguments);
  };
  // Override dynamic script/link creation
  var _ce=document.createElement.bind(document);
  document.createElement=function(tag){
    var el=_ce(tag);
    if(tag==='script'||tag==='link'||tag==='img'){
      var _sa=el.setAttribute.bind(el);
      el.setAttribute=function(n,v){
        if((n==='src'||n==='href')&&typeof v==='string'&&v.charAt(0)==='/'&&v.indexOf('/kds/')!==0&&v.charAt(1)!=='/'){v='/kds'+v;}
        return _sa(n,v);
      };
    }
    return el;
  };
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

  // Strip /kds prefix to reconstruct the Odoo path
  const odooPath = url.pathname.replace(/^\/kds/, '') || '/';
  const odooUrl = new URL(odooPath, odooOrigin);
  odooUrl.search = url.search;
  // Remove our custom params so they don't leak to Odoo
  odooUrl.searchParams.delete('env');

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
          return new Response(null, {
            status: odooResp.status,
            headers: { 'Location': newLoc },
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

  // ── Handle OPTIONS (CORS preflight) ──
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: respHeaders });
  }

  const contentType = odooResp.headers.get('content-type') || '';

  // ── HTML response: inject brand CSS + URL rewriting ──
  if (contentType.includes('text/html')) {
    const rewriter = new HTMLRewriter()
      // Inject font + override script at START of <head>
      .on('head', {
        element(el) {
          el.prepend(FONT_TAGS + OVERRIDE_SCRIPT, { html: true });
          // Inject brand CSS at END of <head> (wins cascade priority)
          el.append(`<style id="he-brand-css">${BRAND_CSS}</style>`, { html: true });
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
