# Hamza Express Site — Project Guide

## Overview
Cloudflare Pages application for Hamza Express restaurant (Bangalore, since 1918). Integrates Odoo 19 Enterprise POS, Razorpay payments, WhatsApp Cloud API, and D1 database to power ordering, kitchen display, settlements, inventory, and operational dashboards.

**Domain:** hamzaexpress.in
**Odoo:** test.hamzahotel.com (production operational server), DB=main, UID=2

## Tech Stack
- **Hosting:** Cloudflare Pages (static + serverless functions)
- **Database:** Cloudflare D1 (`he-whatsapp`, ID: `679aeb00-5afa-42a3-b24a-66821db05360`)
- **POS/ERP:** Odoo 19 Enterprise at `test.hamzahotel.com/jsonrpc`
- **Payments:** Razorpay (UPI QR codes per collection point)
- **Messaging:** WhatsApp Cloud API (Meta)
- **Frontend:** Vanilla JS/HTML/CSS, dark theme, zero dependencies

## Secrets (Cloudflare Pages, set via `wrangler pages secret put`)
```
ODOO_API_KEY, WA_ACCESS_TOKEN, WA_PHONE_ID, WA_VERIFY_TOKEN,
RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
DASHBOARD_API_KEY, KDS_WEBHOOK_SECRET
```

## Project Structure
```
functions/
  api/
    whatsapp.js        — WhatsApp ordering (3389 lines): message→catalog→Razorpay→Odoo→KDS
    sales-insights.js  — Sales reporting API (GET ?from=IST&to=IST)
    settlement.js      — Cash settlement API (PIN-gated, 4 points, Odoo+Razorpay)
    inventory.js       — Stock management API (transfers, receipts, Odoo locations)
  kds/[[path]].js      — Production KDS reverse-proxy (ops.hamzahotel.com)
  kds-test/[[path]].js — Test KDS reverse-proxy (test.hamzahotel.com)
ops/
  sales/               — Sales Insights dashboard
  settlement/          — Cash settlement dashboard (Counter + 3 Captains)
  item-counter/        — Item count tracker (mobile-friendly, categories)
  captain/             — Captain floor operations
  waiter/              — Waiter floor operations
  inventory/           — Inventory management
  receive/             — Receiving & stock
schemas/
  schema-whatsapp.sql  — WhatsApp orders (wa_users, wa_orders)
  schema-settlement.sql — Settlements (settlements, counter_expenses, cash_collections)
  schema-floor.sql     — Floor operations (floor_staff, floor_orders)
```

## Odoo Configuration (test.hamzahotel.com)
### POS Config IDs
- **5** — Cash Counter
- **6** — Captain POS

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
| qr_SFifkGfaapvPPX | HE-COUNTER | Cash Counter UPI |
| qr_SL2rAHSeQnXo4V | HE-CAP-001 | Captain 1 UPI |
| qr_SL2rKjxXhp4T5s | HE-CAP-002 | Captain 2 UPI |
| qr_SFifqWG1QRnmoj | HE-CAP-03 | Captain 3 UPI |

### POS Categories (top-level)
Indian, Biryani, Tandoor, Chinese, Fried Chicken, Bane Marie

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

## Settlement System
- **PINs:** 5882=Admin, 1001=Staff 1, 1002=Staff 2, 0305=Nihaf (collector), 3754=Naveen (collector)
- **Points:** counter, captain_1, captain_2, captain_3
- **Flow:** Staff logs in → selects point → sees Odoo data + Razorpay UPI → enters physical cash → settle
- **Collectors** (Nihaf, Naveen): can access Collect tab to take cash from counter, track discrepancy

## Timezone Handling
- Frontend sends IST timestamps (no Z suffix): `YYYY-MM-DDTHH:mm:ss`
- Backend converts IST→UTC for Odoo queries (subtract 5.5h)
- Backend returns IST times WITHOUT Z suffix (`.toISOString().slice(0,19)`)
- This prevents browsers from double-converting (IST value tagged as UTC + browser adds +5:30)

## KDS (Kitchen Display System)
- Reverse-proxy to Odoo `pos-order-tracking` module
- Production: `/kds/*` → ops.hamzahotel.com
- Test: `/kds-test/*` → test.hamzahotel.com, also `/kds/*?env=test`
- Portrait mode: `/kds/*?portrait=1` (CSS -90deg rotation for vertical TVs)
- Brand: Hamza Express theme (burgundy #3D1610, gold #C9A96E, Cinzel font)
- WebSocket keepalive: 30s pings to prevent Cloudflare 100s idle timeout

## Product Names
Products in Odoo have `[HE-XXXX]` prefix that gets stripped in dashboards via `cleanProductName()`.
Portion variants use patterns: "Name — Size" (em dash), "Name (Size)", "Name 500ml".

## Key Patterns
- All APIs use `onRequest(context)` export pattern for Cloudflare Pages Functions
- Odoo JSON-RPC helper: `rpc(url, db, uid, apiKey, model, method, args, kwargs)`
- CORS headers on all API responses
- Dark theme UI: `--bg:#0a0f1a, --card:#1a2234, --orange:#f97316`
- PIN-gated staff access across settlement and floor ops
- Auto-refresh: 30 second intervals for live dashboards

## Development
```bash
# Local dev
npx wrangler pages dev . --port 8799

# Needs .dev.vars file (not committed) with:
# ODOO_API_KEY=...
# RAZORPAY_KEY_ID=...
# RAZORPAY_KEY_SECRET=...

# Deploy: push to main branch → Cloudflare Pages auto-deploys
# D1 migrations: wrangler d1 execute he-whatsapp --file=schema-*.sql
```
