# Hamza Express Site — Project Guide

## Overview
Full-stack restaurant operations platform for **Hamza Express** (Hamza Hotel, est. 1918) — a legendary Dakhni biryani restaurant in Bangalore. Built on Cloudflare Pages with serverless edge functions. Integrates Odoo 19 Enterprise POS, Razorpay payments, WhatsApp Cloud API, and D1 databases.

**Domain:** hamzaexpress.in
**Production Odoo:** ops.hamzahotel.com (DB=main, UID=2)
**Test Odoo:** test.hamzahotel.com

## Tech Stack
- **Hosting:** Cloudflare Pages (static files + serverless functions, auto-deploy on push to main)
- **Database:** Cloudflare D1 (SQLite at edge)
  - `he-whatsapp` (ID: `679aeb00-5afa-42a3-b24a-66821db05360`) — binding: `DB`
  - `hn-hiring` (ID: `a0107321-790a-4d46-ac3c-a54a676c6bcb`) — binding: `HIRING_DB`
- **POS/ERP:** Odoo 19 Enterprise at `ops.hamzahotel.com/jsonrpc`
- **Payments:** Razorpay (live UPI QR codes per collection point)
- **Messaging:** WhatsApp Cloud API (Meta, catalog ordering)
- **Frontend:** Vanilla JS/HTML/CSS, dark theme, zero npm dependencies
- **Fonts:** Plus Jakarta Sans (UI), JetBrains Mono (data), Cinzel (KDS branding)

## Secrets (set via `wrangler pages secret put`)
```
ODOO_API_KEY, WA_ACCESS_TOKEN, WA_PHONE_ID, WA_VERIFY_TOKEN,
RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
DASHBOARD_API_KEY, KDS_WEBHOOK_SECRET
```

---

## Project Structure
```
hamza-express-site/
├── index.html                    # Customer-facing brand website (76KB)
├── kds-portrait.html             # KDS wrapper for vertical TV mounts
├── wrangler.toml                 # Cloudflare Pages config + D1 bindings
│
├── functions/                    # Cloudflare Pages Functions (serverless API)
│   ├── api/
│   │   ├── whatsapp.js           # WhatsApp ordering engine (3500+ lines)
│   │   ├── settlement.js         # Cash settlement API (PIN-gated, 4 points)
│   │   ├── sales-insights.js     # Sales analytics/reporting API
│   │   └── inventory.js          # Stock management API (Odoo locations)
│   ├── kds/[[path]].js           # KDS reverse-proxy → ops.hamzahotel.com
│   └── kds-test/[[path]].js      # KDS reverse-proxy → test.hamzahotel.com
│
├── ops/                          # Operational dashboards (PIN-gated staff UIs)
│   ├── captain/index.html        # Floor captain POS dashboard (34KB)
│   ├── waiter/index.html         # Waiter floor operations (26KB)
│   ├── settlement/index.html     # Cash settlement + collector dashboard (29KB)
│   ├── sales/index.html          # Sales insights dashboard (21KB)
│   ├── item-counter/index.html   # Mobile item count tracker (21KB)
│   ├── inventory/index.html      # Stock management UI (25KB)
│   ├── receive/index.html        # Stock receiving & RGP (32KB)
│   └── kp-printer/index.html     # Kitchen printer config (21KB)
│
├── assets/                       # Brand assets (logo variants, menu photos)
│   ├── brand/                    # Logo: emblem, icon, text (SVG + PNG)
│   └── menu/                     # Product images (130+ HE-XXXX.jpg)
├── public/assets/menu/           # CDN-served menu images
│
├── schema-whatsapp.sql           # D1: wa_users, wa_orders, wa_sessions
├── schema-settlement.sql         # D1: settlements, counter_expenses, cash_collections
├── schema-floor.sql              # D1: floor_staff, floor_orders, floor_items, pickup_trips
├── schema-kp-print.sql           # D1: kp_print_jobs (browser-polled print queue)
│
├── scripts/                      # Admin/setup scripts (59 files)
│   ├── fix-*.js                  # Production firefighting
│   ├── extract-*.js              # Data migration utilities
│   ├── create-*.js               # Odoo setup scripts
│   └── deploy-*.js               # Deployment helpers
│
└── config/                       # Backups (WABA config, etc.)
```

---

## API Functions (functions/api/)

### whatsapp.js — WhatsApp Ordering Engine (~3500 lines)
- **Webhook:** `POST /api/whatsapp` — ingests WhatsApp messages (text, buttons, order events)
- **State machine:** idle → browse_category → view_product → add_to_cart → checkout → payment_pending → payment_success
- **Flow:** WhatsApp catalog → cart → GST calc (5% on excl. prices) → Razorpay payment link → Odoo POS order → KDS routing
- **Features:** 100+ products, 22 KDS prep line categories, auto-refresh cart, hiring dashboard webhook forwarding
- **Hiring filter:** Candidates from HN Hotels hiring campaign skip the ordering bot

### settlement.js — Cash Settlement API
- **Auth:** PIN-verified staff access
- **Endpoints:** `GET /api/settlement?point=counter` | `POST /api/settlement`
- **Flow:** Staff logs in → selects point (counter/captain_1/2/3) → sees Odoo cash + Razorpay UPI → enters physical cash → settle
- **Collector workflow:** Nihaf/Naveen collect cash from counter, track discrepancy
- **Data:** Queries Odoo cash payment method balances + Razorpay QR payment totals

### sales-insights.js — Sales Analytics API
- **Endpoint:** `GET /api/sales-insights?from=IST&to=IST` (no Z suffix!)
- **Returns:** total_sales, breakdown by payment method (cash/upi/card/comp), by category, by counter, hourly trends
- **Data source:** Odoo sales orders (filtered by date, converted IST↔UTC)

### inventory.js — Stock Management API
- **Endpoints:** `GET /api/inventory` | `POST /api/inventory/transfer` | `POST /api/inventory/receipt`
- **Odoo integration:** stock.move + stock.location models
- **Locations:** Vendors(1), Stock(5), Main Storage(47), Cold Storage(48), Kitchen(49), Wastage(50)
- **Picking types:** take-to-kitchen(30), take-from-cold(31), return-to-storage(32), wastage(33)

---

## KDS (Kitchen Display System)

Reverse-proxy to Odoo's `pos-order-tracking` module with custom branding.

- **Production:** `/kds/*` → `ops.hamzahotel.com`
- **Test:** `/kds-test/*` → `test.hamzahotel.com` (also `/kds/*?env=test`)
- **Portrait mode:** `/kds/*?portrait=1` — CSS -90deg rotation for vertical TVs (left-edge-up)
- **Brand theme:** Burgundy #3D1610, gold #C9A96E, Cinzel font, Hamza Express emblem
- **WebSocket keepalive:** 30-second pings (prevents Cloudflare 100s idle timeout)
- **Portrait wrapper:** `kds-portrait.html` — iframe with TV-safe zone `scale(0.92)`
- **Response modification:** Strips/overrides Odoo QWeb styles, injects brand CSS

---

## Operational Dashboards (ops/)

All dashboards use dark theme (`--bg:#0a0f1a, --card:#1a2234, --orange:#f97316`) and PIN-gated auth (stored in `floor_staff` table). Auto-refresh at 30-second intervals.

### Captain Dashboard (ops/captain/)
- **Users:** Floor captains (dine-in hospitality)
- **Features:** Shift management (clock in/out), table assignment, item status tracking (Cooking → Ready → Picked → Delivered), batch pickup trips
- **Data:** floor_orders + floor_items from D1, polls Odoo for new Captain POS orders

### Waiter Dashboard (ops/waiter/)
- **Users:** Floor waiters
- **Features:** Auto-assigned orders, table card view (table number + items + status), counter pickup status, delivery confirmation
- **Session:** 8-hour shift expiry

### Settlement Dashboard (ops/settlement/)
- **Users:** Settlement staff + collectors (Nihaf, Naveen)
- **Tabs:** Settlement (record per point), Collect (cash pickup from counter), Expenses (petty cash), Reports (daily/weekly)
- **Features:** Odoo cash PM balance fetch, Razorpay QR verification, discrepancy alerts

### Sales Dashboard (ops/sales/)
- **Users:** Managers
- **Features:** Date range picker (IST), sales breakdown by method/category/counter, hourly trends
- **Auth:** API key only (no PIN required)

### Item Counter (ops/item-counter/)
- **Users:** Kitchen/floor staff (mobile)
- **Features:** Category picker, tap-to-increment count, real-time sync
- **Categories:** Indian, Biryani, Tandoor, Chinese, Fried Chicken, Bain Marie, Juices, Shawarma, Grill

### Inventory (ops/inventory/)
- **Users:** Inventory managers (PIN-gated)
- **Features:** Stock levels by location, transfers between locations, low stock alerts

### Receiving (ops/receive/)
- **Users:** Stock receiving staff (PIN-gated)
- **Features:** Receive goods from vendors, create RGP (receipt picking lists), multi-location receiving

### KP Printer (ops/kp-printer/)
- **Users:** Counter staff
- **Features:** Kitchen Pass packing slip printing, browser-polled print queue (D1 `kp_print_jobs` table), Epson printer config
- **Architecture:** Edge worker queues print jobs → browser tab on local network polls → sends to Epson printer

---

## D1 Database Schemas

### schema-whatsapp.sql — Customer Ordering
- `wa_users` — Customer profiles (wa_id, name, phone, total_orders, total_spent)
- `wa_orders` — Order records (order_code, items, payment status, razorpay_payment_id, odoo_order_id)
- `wa_sessions` — Active sessions (state machine state, cart, cart_total)

### schema-settlement.sql — Cash Reconciliation
- `settlements` — Per-point settlement records (cash expected/collected/variance, UPI odoo/razorpay/variance)
- `counter_expenses` — Petty cash expenses (amount, reason)
- `cash_collections` — Collector pickups (amount, petty_cash, expected, discrepancy)

### schema-floor.sql — Floor Operations (Captain-Waiter Coordination)
- `floor_staff` — Staff roster (pin, name, role, can_captain, can_waiter, session_token, current_load)
- `floor_orders` — Dine-in orders from Captain POS config 6 (table_number, waiter_id, items_ready/delivered)
- `floor_items` — Per-item tracking (prep_line_id, counter, status: cooking→ready→picked→delivered)
- `pickup_trips` — Batch pickup records (waiter_id, counters, tables_served, item_count)
- `floor_poll_state` — KDS polling cursor

### schema-kp-print.sql — Kitchen Print Queue
- `kp_print_jobs` — Print job queue (odoo_order_id, tracking_number, items JSON, status: pending→claimed→printed)

---

## Odoo Configuration (ops.hamzahotel.com)

### POS Config IDs
- **5** — Cash Counter (takeaway/counter orders)
- **6** — Captain POS (dine-in floor operations)

### Payment Method IDs
| ID | Name | Type |
|----|------|------|
| 11 | Cash Counter | cash |
| 19 | Cash Captain | cash (shared across captains) |
| 14 | UPI Counter | bank |
| 52 | Captain 01 UPI | bank |
| 53 | Captain 02 UPI | bank |
| 54 | Captain 03 UPI | bank |
| 55 | Captain 04 UPI | bank |
| 56 | Captain 05 UPI | bank |
| 12 | Card | bank |
| 57 | Complimentary | pay_later |

### Razorpay QR Codes
| QR ID | Name | Maps To |
|-------|------|---------|
| qr_SFifkGfaapvPPX | HE-COUNTER | Cash Counter UPI (PM 14) |
| qr_SL2rAHSeQnXo4V | HE-CAP-001 | Captain 1 UPI (PM 52) |
| qr_SL2rKjxXhp4T5s | HE-CAP-002 | Captain 2 UPI (PM 53) |
| qr_SFifqWG1QRnmoj | HE-CAP-03 | Captain 3 UPI (PM 54) |

### POS Categories (KDS routing, top-level)
Indian(22), Biryani(23), Tandoor(25), Chinese(24), Fried Chicken(26), Bain Marie(28), Juices(27), Shawarma(29), Grill(30)

### Odoo Inventory Locations
| ID | Name |
|----|------|
| 1 | Vendors |
| 5 | Stock |
| 47 | Main Storage |
| 48 | Cold Storage |
| 49 | Kitchen |
| 50 | Wastage |

### Picking Types
| ID | Name |
|----|------|
| 30 | take-to-kitchen |
| 31 | take-from-cold |
| 32 | return-to-storage |
| 33 | wastage |

---

## Staff PINs
| PIN | Name | Role |
|-----|------|------|
| 5882 | Admin | Full access |
| 1001 | Staff 1 | Settlement + floor |
| 1002 | Staff 2 | Settlement + floor |
| 0305 | Nihaf | Collector (cash pickup) |
| 3754 | Naveen | Collector (cash pickup) |

---

## Timezone Handling (Critical)
- **Frontend sends:** IST timestamps without Z suffix (`YYYY-MM-DDTHH:mm:ss`)
- **Backend converts:** IST→UTC for Odoo queries (subtract 5.5 hours)
- **Backend returns:** IST times WITHOUT Z suffix (`.toISOString().slice(0,19)`)
- **Why no Z:** Prevents browsers from double-converting (if IST value tagged as UTC, browser adds +5:30 again)

---

## Product Naming
- Products in Odoo have `[HE-XXXX]` prefix, stripped in dashboards via `cleanProductName()`
- Portion variants: "Name — Size" (em dash), "Name (Size)", "Name 500ml"
- 100+ products across 9 categories, 130+ product images in assets/menu/

---

## Customer Website (index.html)
- 76KB single-file brand showcase + ordering entry points
- Sections: Hero → Legacy (1918 founder story) → Heritage Pillars → Menu → Stats → Order (Swiggy/Zomato/WhatsApp) → Location → Footer
- Brand colors: Burnt Sienna (#713520), Tan (#D2B48C), Off-White (#FAF3E3), Dark Sienna (#4A2315)
- Typography: Times New Roman (fallbacks: Playfair Display, Crimson Text, Georgia)
- Features: Scroll-triggered animations, aromatic steam SVG animation, paper texture overlay, lazy-loaded images

---

## Key Patterns & Conventions
- **API pattern:** All functions use `onRequest(context)` export for Cloudflare Pages Functions
- **Odoo RPC:** Helper function `rpc(url, db, uid, apiKey, model, method, args, kwargs)` for JSON-RPC calls
- **CORS:** Headers on all API responses
- **Dashboard theme:** Dark UI with `--bg:#0a0f1a, --card:#1a2234, --orange:#f97316`
- **Auth:** PIN-gated staff access across settlement, captain, waiter, inventory dashboards
- **Auto-refresh:** 30-second polling intervals for live dashboards
- **Single-file dashboards:** Each ops/ dashboard is a self-contained HTML file (no build step, no imports)
- **No npm/build:** Pure Cloudflare Pages — push to main branch auto-deploys everything

---

## Active Work Areas

### In Progress (uncommitted changes)
- **Station QR Ordering** — WhatsApp station-level ordering with tier-adaptive UX (see below)
- **Captain dashboard** — UI/UX improvements, shift management enhancements
- **Waiter dashboard** — Workflow refinements, table card improvements
- **Settlement API** — Extended functionality

### Recently Completed
- **HN Hotels Hiring Integration** — Forward webhook events to hiring dashboard, skip ordering bot for candidates
- **Item Counter** — Mobile-friendly item count tracker by category
- **Settlement System** — Cash Counter + 3 Captains settlement with Odoo/Razorpay reconciliation
- **Sales Insights** — Analytics dashboard with IST timezone handling
- **KDS Branding** — 20+ commits on portrait mode, brand theme injection, WebSocket keepalive
- **Captain-Waiter Floor System** — Auto-assign orders, shift management, counter-initiated pickup
- **KP Printer** — Browser-polled print queue bridging edge worker to local Epson printer
- **Fried Chicken Station** — 26 new Krispy Eats products + AI-generated menu images

### Architecture Decisions
- **Serverless-first:** All backend logic runs on Cloudflare edge (no servers to manage)
- **Zero-dependency frontend:** Vanilla JS/HTML/CSS avoids build complexity
- **D1 for coordination:** WhatsApp sessions, floor state, settlements, print queue all in D1
- **Odoo as source of truth:** POS orders, products, inventory, payments live in Odoo
- **Razorpay for UPI:** Separate QR codes per collection point for reconciliation

---

## Development

```bash
# Local dev
npx wrangler pages dev . --port 8799
# Requires .dev.vars with: ODOO_API_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, etc.

# D1 migrations
wrangler d1 execute he-whatsapp --remote --file=schema-settlement.sql

# Deploy: push to main → Cloudflare Pages auto-deploys
git push origin main
```

---

## Station QR Ordering (WhatsApp)

### Concept
Crowd distribution within the outlet — each food station has a QR code. Customer scans QR → sees only that station's items in WhatsApp → orders → pays via UPI → collects at the counter. The convenience IS the marketing.

### Stations
| Station | QR Text | Counter Key | catId | KDS |
|---------|---------|-------------|-------|-----|
| Bain Marie | "BM Counter" | bm_counter | 28 | KDS 17 BM |
| Juice | "Juice Counter" | juice_counter | 27 | KDS 16 Juice |
| Shawarma | "Shawarma Counter" | shawarma_counter | 29 | KDS 18 Shawarma |
| Grill | "Grill Counter" | grill_counter | 30 | KDS 19 Grill |
| Sheek Kabab | "Sheek Kabab" | sheek_counter | 30 | KDS 19 Grill (shared) |

Grill and Sheek Kabab share catId 30 and same KDS — separate QR codes, counters are adjacent.

### UX Flow (Station QR)
1. Customer scans QR (wa.me link with pre-filled text, e.g. "BM Counter")
2. WhatsApp opens → customer taps Send (required by WhatsApp)
3. Bot detects counter keyword → sends station-specific MPM (tier-adaptive greeting)
4. Customer adds items to cart → taps Send
5. Bot receives native cart → skips "Pay Now" confirmation → sends order_details payment directly
6. Customer taps "Review and Pay" → UPI payment → order confirmed

**New customers: 6 interactions | Regular re-order: 5 interactions**

### Customer Tiers (adaptive messaging)
- **new** (0 orders): Full welcome + guidance ("Welcome to Hamza Express! Est. 1918...")
- **learning** (1-2): Moderate guidance ("Hi {name}! Add items below...")
- **familiar** (3-9): Concise ("Hey {name}!")
- **regular** (10+): Quick re-order prompt if recent order at same counter within 7 days

### Session States
- `idle` → Entry point
- `awaiting_name` → Collecting customer name (skipped for station QR orders)
- `awaiting_menu` → MPM shown, waiting for cart
- `awaiting_payment` → "Pay Now" confirmation shown (general orders only)
- `awaiting_reorder` → Re-order prompt shown to regular customer (station QR only)
- `awaiting_upi_payment` → order_details payment sent, waiting for UPI completion

### Key Design Decisions
- Station QR orders skip name collection (use WhatsApp profile name silently)
- Station QR orders skip "Pay Now" confirmation (order_details card IS the review step)
- `counter_source` column in wa_sessions tracks which station QR the customer scanned
- `counter_source` is cleared when session resets to idle
- Re-order uses last paid order at the same counter within 7 days

### Test Environment
- **Odoo:** ops.hamzahotel.com / HN Hotels company (Company ID: 1)
- **POS Config:** 10 (HE-WABA)
- **Payment Method:** 17 (WABA General UPI)
- **Catalog ID:** 1639757440737691
- **Payment Config:** Hamza_Express_Payments
- Test products use placeholder IDs (HE-J001, HE-S001, HE-G001, HE-K001 series, odooId 9001-9034)

### Schema Migration
```sql
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-session-update.sql
ALTER TABLE wa_sessions ADD COLUMN counter_source TEXT;
```

---

## Related Projects (same Cloudflare account)
- **hn-hiring** — HN Hotels hiring campaign dashboard (separate D1 database)
