# Hamza Express — Cashier Deployment Architecture

**Status:** Strategy / pre-implementation
**Target:** `hamzaexpress.in/ops/v2/` (proposed)
**Author:** Claude (architected per Nihaf's brief)
**Date:** 2026-04-23

---

## TL;DR — The Architecture in One Paragraph

Build `hamzaexpress.in/ops/v2/` as a bespoke HE cashier deployment that mirrors NCH v2's proven patterns but drops the runner/token machinery HE doesn't need. Two POS flows matter: **Counter POS (config 5)** handles walk-ins, **Captain POS (config 6)** handles dine-in — captain cash is continuously settled to counter so there's no runner-style accumulation. Settlement happens once per shift at the counter, comparing Odoo's reported totals (per payment method, per POS) against three physical counters: **cash drawer count** (entered by cashier), **UPI/Paytm total** (reconciled via a tiered CSV+manual strategy since Paytm has no merchant API today), and **card total** (Odoo only — no external API to cross-check). Expense entry is embedded directly in `/ops/v2/` and dual-writes to D1 + `hnhotels.in/api/spend` exactly like NCH v2 does — reusing the central 14-category + product-required + vendor-required discipline. A shift wizard at close-of-day produces one reconciled settlement row per POS + one expense ledger tied to that shift, both written to Odoo (hr.expense / cash.move) and mirrored to D1 for fast reads.

---

## 1. The Three Deployments — One Mental Model

| | **NCH v2** (existing) | **HN Central** (existing) | **HE v2** (proposed) |
|---|---|---|---|
| URL | `nawabichaihouse.com/ops/v2/` | `hnhotels.in/ops/purchase/` + `/ops/expense/` | `hamzaexpress.in/ops/v2/` |
| User | Cashier (Kesmat/Nafees), Runners | Zoya (purchase), Naveen (CFO), Nihaf (admin) | Cashier (Noor), Captains |
| Odoo instance | `ops.hamzahotel.com` (NCH co_id=10) | `odoo.hnhotels.in` (HE=2, NCH=3, HQ=1) | `test.hamzahotel.com` (HE co_id=2) |
| POS configs | 27 (Counter) + 28 (Runner) | — | 5 (Counter) + 6 (Captain) |
| Live data | Yes — runner settlement | No — daily review | **No — shift settlement only** |
| UPI provider | Razorpay (7 QRs) | — | **Paytm** (migrating from Razorpay) |
| Settlement unit | Per runner + per counter | — | Per POS (counter + captain pool) |

**Key insight:** The three deployments form a **layered system**, not separate apps:

- **HN Central** owns the purchase + expense *taxonomy* (categories, products, vendors, approval) — source of truth.
- **Brand deployments** (NCH v2, HE v2) own the *daily cashier workflow* — reconciliation, shift close, petty cash entry.
- Brand deployments **dual-write** expenses to local D1 (shift reconciliation) AND to HN central (`hnhotels.in/api/spend`) — that's the pattern that makes NCH v2 work and HE v2 must replicate.

---

## 2. HE-Specific Reality — What Makes It Different

### 2.1 Captain cash flows continuously to counter
Unlike NCH where runners accumulate cash and settle once-per-shift, HE captains **hand over cash to the counter after every table settles** (or in micro-batches). This collapses the runner-settlement complexity:
- No per-captain cash drawer
- No per-captain UPI QR reconciliation (captains already share PM 52)
- **Settlement is per-POS, not per-captain** — but variance attribution can still be per-captain for accountability

### 2.2 No token system
NCH's Token Issue (PM 48) tracks chai issued to runners against customer tokens. HE has no equivalent — a dine-in order is paid at the table (captain) or at counter (counter). So:
- No "Token" payment method, no ledger circulation, no PM-40-without-runner D4 error class
- Validation framework is simpler: only 4 valid (PM, POS) pairs instead of 15 tuples

### 2.3 Paytm instead of Razorpay, but no Paytm merchant API
This is the hard part. Razorpay's QR API makes NCH's UPI reconciliation trivial (`GET /v1/payments/qr_codes/{qr_id}/payments`). Paytm's merchant API:
- **Requires Business Dashboard API enablement** — via `dashboard.paytm.com/next/apikeys`. Not on by default.
- Even with keys, UPI transaction listing typically needs `Order Status API` calls per-order, not bulk fetch.
- **MVP assumption: No Paytm API**. Architect a fallback-first strategy; upgrade when API is available.

### 2.4 Live data is not needed
NCH polls shift badge every 60s. HE doesn't need that — reconciliation happens once at end-of-shift. This **simplifies the UI** (no WebSocket, no polling except optional manual refresh) and **reduces Cloudflare request volume** significantly.

### 2.5 Existing HE ops is already rich
HE already has 28 ops pages. The new `/ops/v2/` should:
- **Not replace** `captain/`, `waiter/`, `kitchen-intel/`, `sales/` — those have distinct user personas
- **Consolidate and replace** `settlement/`, `counter-audit/`, `captain-settle/`, `captain-audit/` — these are fragmentary settlement UIs
- **Add** the missing expense-entry flow and the shift wizard

---

## 3. The Settlement Layer — End-to-End

### 3.1 Shift lifecycle (proposed)

```
┌──────────┐    ┌───────────┐    ┌─────────────┐    ┌──────────┐
│  OPEN    │───▶│  LIVE     │───▶│  RECONCILE  │───▶│  CLOSED  │
│  shift   │    │  shift    │    │  (wizard)   │    │          │
└──────────┘    └───────────┘    └─────────────┘    └──────────┘
  |               |                  |                 |
  drawer_float    normal ops         cashier enters    written to
  opening_ts      (Odoo captures     physical counts   shifts table
                   orders/pmts)      reviews variance  + settlements
                                     submits           (per POS)
```

### 3.2 What's reconciled at shift close

For each POS (Counter config=5, Captain config=6), reconcile four streams:

| Stream | Odoo source | Physical counter source | Variance action |
|---|---|---|---|
| **Cash** | sum(pos.payment where pm in [11, 19]) during shift window | Cashier enters ₹ count from drawer | If \|variance\| > ₹20 → flag for manager |
| **UPI (Paytm)** | sum(pos.payment where pm in [14, 52, 59-62]) | Paytm statement (CSV / dashboard screenshot / manual total) | Any variance → block close until resolved |
| **Card** | sum(pos.payment where pm = 12) | Card machine batch total (manual entry — no API) | \|variance\| > ₹50 → flag |
| **Comp** | sum(pos.payment where pm = 57) | None — informational | Log for audit |

**Captain variance attribution:** Because captain cash is continuously handed over, captain-level variance only becomes evident if counter-received captain cash ≠ sum of pos.order totals attributed to that captain. Log at captain level but reconcile at POS level.

### 3.3 Drawer formula (inherited from NCH)

```
expected_cash_in_drawer =
    opening_float
  + cash_orders_received      // PM 11 + PM 19
  + captain_cash_handovers    // tracked via in-UI "Captain handed ₹X"
  - cash_expenses_paid        // from embedded expense module
  - cash_collections          // manager/owner cash pickups
```

Cashier enters `actual_cash_in_drawer`. Variance = actual − expected. Written to `shifts` table.

---

## 4. Paytm Reconciliation — The Tiered Strategy

**Design principle:** the settlement UI must work end-to-end today without any Paytm API. API integration later is a **swap of the data source**, not a rewrite of the flow.

### Tier 1: CSV import (MVP — ships day one)

**UX:**
1. At shift close, UI shows: *"UPI Expected (Odoo): ₹X,XXX from Y transactions"*
2. Button: **"Upload Paytm statement"**
3. Cashier opens Paytm Business app → exports today's transaction list → downloads CSV
4. Uploads CSV in the wizard
5. Worker parses CSV, matches transactions to Odoo pos.payment rows by **amount + timestamp** (within ±2 min window)
6. UI shows three buckets:
   - ✅ **Matched** (green count)
   - ⚠️ **In Odoo, missing from Paytm** (likely pending / refund)
   - ⚠️ **In Paytm, missing from Odoo** (likely unbilled or wrong POS)
7. Cashier resolves flagged items or submits with explanatory note

**Why CSV first:**
- Paytm Business Dashboard exports transaction CSV today — no API access needed
- Cashier skill level matches (Kesmat/Noor both handle CSV-ish exports elsewhere)
- Reconciliation logic is the same as future API path — so we're building the right thing

### Tier 2: Screenshot + manual total (fallback when CSV unavailable)

**UX:**
1. Cashier enters *total* Paytm amount + transaction count from dashboard screen
2. Optional: upload screenshot of Paytm summary page for audit trail
3. System compares entered totals vs Odoo expected
4. If match within ₹1 → pass. If variance → flag for manager.

**Why this matters:** internet is flaky at the counter; sometimes CSV download fails on mobile. Manual entry is the degrade path.

### Tier 3: Paytm API (future — when dashboard.paytm.com/next/apikeys is provisioned)

**UX:** same as Tier 1 but the CSV upload button becomes *"Fetch from Paytm"* — worker calls Paytm's `merchantTransactionList` API directly. **Same reconciliation code path runs.**

**Recommendation: provision Paytm API keys now** via `dashboard.paytm.com/next/apikeys` so that swapping from CSV to API is one env var flip. No code change on day of switchover.

### 4.1 Using Claude MCP to bootstrap

The user mentioned `dashboard.paytm.com/next/apikeys` and Claude-in-Chrome MCP. Practical use:

- **At setup time:** use Claude-in-Chrome to navigate the Paytm dashboard, screenshot the CSV export format, extract sample data — build the parser off real data, not documentation guesswork.
- **During development:** MCP can log into staging Paytm, pull live statement, feed to the reconciliation worker for testing — don't need Paytm sandbox.
- **Not at runtime:** Claude MCP should not be in the production request path. It's a development accelerator.

---

## 5. The Expense Layer — Same Discipline as NCH

### 5.1 What ships in HE v2 (mirrors NCH v2 exactly)

Embed the expense-entry UI in `/ops/v2/` as a screen (same as NCH v2's `S-EXPENSE`). It consumes the central `hnhotels.in/api/spend` endpoint. No new API, no new category taxonomy — **reuse HN central**.

Visible categories for HE cashier (Noor, PIN `15`):
```
CASHIER_CATS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
```
Excluded: Cat 1 (RM purchase — Zoya's flow) and Cat 15 (bill-from-PO — CFO's flow). This is already configured in `spend.js:35-62`.

### 5.2 No-orphan enforcement (inherited, not re-implemented)

The central `/api/spend` already enforces:
- `product_id` required (cats 1-13) — `spend.js:837`
- `vendor_id` required (cats 2, 5-12, 14) — `spend.js:973, 1044`
- Payroll cats (3, 4) require `payroll_period` + `payroll_intent`
- D1 mirror on every Odoo write

HE v2 just wraps this with HE-specific UI (dark theme, HE branding, outlet-locked brand=HE). Zero duplication of backend logic.

### 5.3 Bill photos → Drive + D1 (inherited)

Same filename convention: `YYYY-MM-DD_Cat_HE_Product_Amount_User.jpg`. Same Drive folder structure. Same D1 `bill_attachments` table. This is all in `spend.js` already.

### 5.4 Connection to shift

New for HE v2: every expense records `shift_id` (from active shift context) so at shift close, the cash-expense total is auto-deducted from drawer expected. Schema addition:

```sql
-- one-line change to business_expenses mirror: already exists in D1 as "brand+location+date+user"
-- just add a shift_id column in D1 for HE-specific rollup
ALTER TABLE he_shifts_expenses ADD COLUMN shift_id INTEGER;
```

Or keep it purely read-side: at shift close, query `business_expenses WHERE brand='HE' AND location='he_kormangla' AND date=TODAY AND paid_via='cash'` — no schema change needed.

---

## 6. Directory Structure (Proposed)

```
hamza-express-site/
├── ops/
│   ├── v2/                                # NEW — bespoke cashier
│   │   ├── index.html                     # single-file dashboard
│   │   ├── manifest.json                  # PWA for offline cash counting
│   │   └── icons/
│   ├── captain/                           # EXISTING — floor captain (keep)
│   ├── waiter/                            # EXISTING — waiter (keep)
│   ├── settlement/                        # DEPRECATE → redirect to /ops/v2/
│   ├── captain-settle/                    # DEPRECATE → merged into v2
│   ├── captain-audit/                     # KEEP as read-only audit view
│   ├── counter-audit/                     # KEEP
│   ├── sales/                             # KEEP — analytics (different user)
│   └── ... (25 other pages unchanged)
├── functions/api/
│   ├── v2-shifts.js                       # NEW — shift lifecycle
│   ├── v2-settle.js                       # NEW — reconciliation wizard
│   ├── v2-paytm-ingest.js                 # NEW — CSV + future API
│   ├── settlement.js                      # KEEP during migration, deprecate after
│   ├── sales-insights.js                  # KEEP
│   └── ...
└── schema-v2.sql                          # NEW — he_shifts, he_settlements, paytm_statements
```

---

## 7. Data Model (D1)

```sql
-- Active shifts (one row per open shift)
CREATE TABLE he_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cashier_pin TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  opened_at TEXT NOT NULL,                  -- ISO IST (no Z)
  opened_float REAL NOT NULL DEFAULT 0,
  closed_at TEXT,
  closed_by TEXT,
  state TEXT NOT NULL DEFAULT 'open',       -- open | reconciling | closed
  notes TEXT
);

-- Per-POS reconciliation row (2 rows per closed shift: counter + captain pool)
CREATE TABLE he_shift_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  pos_config_id INTEGER NOT NULL,           -- 5 or 6
  pos_label TEXT NOT NULL,                  -- 'Counter' or 'Captain'
  odoo_cash REAL NOT NULL,                  -- sum from pos.payment
  odoo_upi REAL NOT NULL,
  odoo_card REAL NOT NULL,
  odoo_comp REAL NOT NULL,
  physical_cash REAL,                       -- cashier entry
  paytm_reported REAL,                      -- Paytm actual
  card_reported REAL,
  variance_cash REAL,                       -- derived
  variance_upi REAL,
  variance_card REAL,
  state TEXT DEFAULT 'draft',               -- draft | submitted | approved
  submitted_at TEXT,
  FOREIGN KEY (shift_id) REFERENCES he_shifts(id)
);

-- Paytm statement uploads (audit trail + reconciliation source)
CREATE TABLE paytm_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  source TEXT NOT NULL,                     -- 'csv' | 'manual_total' | 'api'
  total_amount REAL NOT NULL,
  total_count INTEGER NOT NULL,
  raw_csv TEXT,                             -- full CSV for audit
  raw_manual_note TEXT,
  FOREIGN KEY (shift_id) REFERENCES he_shifts(id)
);

-- Matched / unmatched Paytm transactions against Odoo pos.payment
CREATE TABLE paytm_reconciliation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_id INTEGER NOT NULL,
  paytm_txn_id TEXT,
  paytm_amount REAL NOT NULL,
  paytm_ts TEXT NOT NULL,
  odoo_payment_id INTEGER,                  -- null if unmatched
  match_type TEXT NOT NULL,                 -- 'exact' | 'fuzzy' | 'unmatched_paytm' | 'unmatched_odoo'
  resolved_by TEXT,
  resolution_note TEXT,
  FOREIGN KEY (statement_id) REFERENCES paytm_statements(id)
);
```

**Odoo writes at shift close:**
- `account.move` rows for cash expenses (via central `/api/spend`)
- `pos.order.write` — no changes, Odoo is SSOT for orders
- **No custom x_ fields on pos.order** — avoid tight coupling to Odoo schema
- Settlement data stays in D1 (source of truth for reconciliation state)

---

## 8. Implementation Plan (Phased)

### Phase 0 — Foundation (1 day)
- [ ] Copy vanilla-JS skeleton from NCH v2 (`/ops/v2/index.html` structure, CSS vars, PIN gate)
- [ ] Extract HE-specific payment method map + Paytm PM IDs into config
- [ ] Create `schema-v2.sql` and apply via wrangler D1 migrate
- [ ] Stub `/api/v2-shifts` with open/close endpoints

### Phase 1 — Shift lifecycle (2 days)
- [ ] **Open shift:** cashier PIN → enter opening float → write `he_shifts` row
- [ ] **Live view:** poll Odoo every 60s for shift-window totals (or manual refresh)
- [ ] **Capture captain handover:** simple button "Captain handed ₹X" → logs to D1 as inbound cash event
- [ ] **Close shift (step 1):** pull Odoo PM totals for window, compute expected drawer

### Phase 2 — Reconciliation wizard (3 days)
- [ ] 4-step wizard: Cash count → UPI (Paytm) → Card → Comp review
- [ ] Cash count: drawer formula shown, cashier enters physical, variance calculated
- [ ] UPI: **Tier 1+2 Paytm flows** (CSV upload + manual total fallback)
- [ ] CSV parser + matcher: match by amount+timestamp±2min
- [ ] Card: manual total entry
- [ ] Comp: review only
- [ ] Submit: writes 2 rows to `he_shift_settlements`, marks shift closed

### Phase 3 — Embedded expense flow (2 days)
- [ ] Embed NCH v2's expense screen pattern
- [ ] PIN '15' (Noor) auto-scopes to HE, CASHIER_CATS
- [ ] Dual-write to D1 local + `hnhotels.in/api/spend`
- [ ] Tie each expense to current `shift_id`
- [ ] Display shift-to-date expenses on cash reconciliation screen

### Phase 4 — Deprecation of legacy UIs (1 day)
- [ ] Redirect `/ops/settlement/` → `/ops/v2/` with banner
- [ ] Redirect `/ops/captain-settle/` → `/ops/v2/`
- [ ] Keep `/ops/counter-audit/` + `/ops/captain-audit/` as read-only history

### Phase 5 — Paytm API upgrade path (1 day, deferred)
- [ ] When Paytm API keys provisioned: write `fetchPaytmMerchantTransactions(date)` in `/api/v2-paytm-ingest.js`
- [ ] UI "Upload Paytm statement" button swaps to "Fetch from Paytm"
- [ ] CSV parser becomes API response parser (same match logic)

**Total: ~9 engineer-days, or 4-5 focused days with Claude Code pair-coding.**

---

## 9. Authentication + Role Matrix (HE v2)

| PIN | Name | Role | /ops/v2 capability |
|---|---|---|---|
| `5882` / `0305` | Nihaf | admin | All — open shift, close shift, expenses, audit override, paytm resolve |
| `3754` | Naveen | cfo | Read-only shift history, override expenses |
| `15` | Noor | cashier | Open/close own shift, enter expenses, reconcile UPI |
| `6890` | Tanveer | gm | Read shifts, approve variance, override |
| (new) | Captain 01-05 | captain | Log handover of cash to counter (write-only event) |

PIN verification uses the existing `/api/rectify?action=verify-staff` pattern (NCH) or the central `/api/spend?action=verify-pin` pattern (HN Central). **Recommendation: use HN central** since expense flow already depends on it — one source of PIN truth.

---

## 10. Ambiguities & Open Questions

These need decisions before Phase 1 starts:

### 10.1 Paytm migration status 🔴 **CRITICAL**
HE's current `settlement.js:25` has `UPI_PROVIDER = 'razorpay'` with 6 active Razorpay QRs. Paytm code is stubbed, inactive. **Question:** Is HE *transitioning* Razorpay → Paytm (both active during transition), or has Paytm *already* replaced Razorpay (Razorpay QRs retired)? The reconciliation logic differs:
- **Transition:** Two UPI streams, both must reconcile → more complex wizard
- **Replacement:** Single UPI stream (Paytm) → simpler flow as documented above

### 10.2 Per-captain accountability
NCH: every cash variance traces to a specific runner. HE: captains share PM 19 (cash) and PM 52 (UPI). Current `settlement.js` uses captain employee IDs (69-73) but all cash is pooled.
**Question:** Do you want per-captain variance attribution (requires each captain to log handover with captain ID) or is POS-level variance enough (simpler)?
**Recommendation:** Start with POS-level (Phase 1-4), add per-captain handover log (Phase 2+) only if variance investigation actually needs it.

### 10.3 Shift granularity
**Question:** One shift per day, or multiple shifts if lunch+dinner cashiers change?
**Recommendation:** Support multiple shifts from day one — schema already allows it. Simple UI: "Close & handover" button creates new shift seeded with outgoing drawer balance.

### 10.4 Card reconciliation
Card machine has no API integration in either HE or NCH code today. Cashier types batch total manually.
**Question:** Is this acceptable long-term, or do you want to integrate Razorpay's card API (if card machine is Razorpay) or whatever HE's POS terminal uses?
**Recommendation:** Acceptable for MVP. Card typically ≤10% of HE revenue — manual entry is fine. Revisit if card > 25%.

### 10.5 HE's POS running directly on Odoo
HE currently has NO custom POS UI — Odoo POS is used directly. Custom cashier = new layer above Odoo.
**Question:** Is the plan to (a) keep Odoo POS as the order-entry surface and just add `/ops/v2/` for settlement/expense, OR (b) replace Odoo POS with a custom order-entry UI over time?
**Recommendation:** **(a) for now.** Custom POS replacement is a separate large project — out of scope for this architecture. This doc assumes Odoo POS is the source of pos.order.

### 10.6 Where does HE v2 run?
HE v2 is in the `hamza-express-site` repo. HE central expense backend is in `HN-Hotels-Site` repo.
**Confirmation:** Cross-origin POST from `hamzaexpress.in/ops/v2/` to `hnhotels.in/api/spend` works today (CORS in `spend.js` is `Access-Control-Allow-Origin: *`). No blockers.

### 10.7 Deprecation of existing /ops/settlement/
`settlement.js` is 997 lines of working code. The HE v2 wizard supersedes it but there's historical data.
**Question:** Read-only archive of old data, or migrate into new schema?
**Recommendation:** Read-only. Historical settlements stay in old D1 tables, queryable via old endpoints for 90 days, then archived. No migration — cost >> benefit.

---

## 11. What This Architecture Explicitly Does NOT Do

To keep Phase 1 shippable, the following are **explicitly out of scope**:

- ❌ Live push / WebSocket / SSE — manual refresh + shift-close wizard is enough
- ❌ Per-captain cash drawer — captain cash flows to counter continuously
- ❌ Token / credit ledger — HE has no token system
- ❌ Replacing Odoo POS UI — Odoo POS stays as order-entry surface
- ❌ Card machine API integration — manual entry is acceptable
- ❌ Replace /ops/captain/, /ops/waiter/, /ops/kitchen-intel/ — those are different personas
- ❌ Cross-brand expense submission — HE v2 is HE-only, mirrors NCH pattern

These can ship in Phase 6+ if business need emerges.

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Paytm CSV format changes | Medium | Medium | Versioned parser, fallback to manual total |
| CSV download fails on cashier's phone | Medium | Low | Tier 2 manual-total path is always available |
| Odoo RPC timeout on shift close | Low | High | Cache totals in D1 during shift, retry on close |
| Captain cash variance undetected | Low | Medium | Optional handover logging in Phase 2 |
| Paytm settles t+1 (next-day) | **High** | **High** | Match by day-of-transaction, not settlement-date. Design for "pending" states. |
| Cashier closes shift without CSV | Medium | Medium | Warn but allow with note; manager resolves day after |
| Legacy /ops/settlement/ regression | Low | Low | Redirect with deprecation banner, keep endpoint live 90 days |

---

## 13. Decision Request

Before I start building Phase 0, I need:

1. **Paytm status clarification** (§10.1) — transition or replacement?
2. **Per-captain accountability?** (§10.2) — yes/no for MVP
3. **Paytm API keys** — provision now via `dashboard.paytm.com/next/apikeys`? If yes, can you share the keys to put in `PAYTM_API_KEY` / `PAYTM_API_SECRET` CF secrets?
4. **Approve the URL** `hamzaexpress.in/ops/v2/`? Or prefer `/ops/cashier/`?
5. **Approve deprecation** of `/ops/settlement/`, `/ops/captain-settle/`?

Once these five are answered, Phase 0 ships in half a day.

---

*End of document.*
