# Combo Products Migration — ops → test.hamzahotel.com

## For: Yash (Tech Lead)
## Context: Claude execution on ops.hamzahotel.com that needs to be replicated on test.hamzahotel.com (production POS)

---

## WHAT WAS DONE

15 combo products were created in **ops.hamzahotel.com** Odoo POS. These are 5 meal combos, each with 3 serving sizes (For You / For Two / For Three). They're used by the WhatsApp ordering bot (WABA) and will also be visible on Cash Counter (Config 5) and Captain (Config 6) POS screens.

**These combos are NOT for Swiggy/Zomato.**

---

## THE 15 PRODUCTS CREATED ON OPS

All products were created via `product.product` → `create()` JSON-RPC.

| Code | Name (as in Odoo) | Menu Price (incl GST) | Base Price (list_price) | ops odooId |
|------|--------------------|-----------------------|------------------------|------------|
| HE-CM01-1 | [HE-CM01-1] CM1 For You — Rice+Roti+Kabab+BC | ₹299 | 284.76 | 1475 |
| HE-CM01-2 | [HE-CM01-2] CM1 For Two — Rice+Roti+Kabab+BC | ₹629 | 599.05 | 1476 |
| HE-CM01-3 | [HE-CM01-3] CM1 For Three — Rice+Roti+Kabab+BC | ₹829 | 789.52 | 1477 |
| HE-CM02-1 | [HE-CM02-1] CM2 For You — Rice+Dal+Brain+Kulcha | ₹349 | 332.38 | 1478 |
| HE-CM02-2 | [HE-CM02-2] CM2 For Two — Rice+Dal+Brain+Kulcha | ₹669 | 637.14 | 1479 |
| HE-CM02-3 | [HE-CM02-3] CM2 For Three — Rice+Dal+Brain+Kulcha | ₹989 | 941.90 | 1480 |
| HE-CM03-1 | [HE-CM03-1] CM3 For You — Rice+Dal | ₹139 | 132.38 | 1481 |
| HE-CM03-2 | [HE-CM03-2] CM3 For Two — Rice+Dal | ₹259 | 246.67 | 1482 |
| HE-CM03-3 | [HE-CM03-3] CM3 For Three — Rice+Dal | ₹359 | 341.90 | 1483 |
| HE-CM04-1 | [HE-CM04-1] CM4 For You — Brain+Naan | ₹199 | 189.52 | 1484 |
| HE-CM04-2 | [HE-CM04-2] CM4 For Two — Brain+Naan | ₹379 | 360.95 | 1485 |
| HE-CM04-3 | [HE-CM04-3] CM4 For Three — Brain+Naan | ₹559 | 532.38 | 1486 |
| HE-CM05-1 | [HE-CM05-1] CM5 For You — Rice+BC+Naan | ₹189 | 180.00 | 1487 |
| HE-CM05-2 | [HE-CM05-2] CM5 For Two — Rice+BC+Naan | ₹359 | 341.90 | 1488 |
| HE-CM05-3 | [HE-CM05-3] CM5 For Three — Rice+BC+Naan | ₹529 | 503.81 | 1489 |

---

## EXACT FIELDS SET PER PRODUCT

```python
{
    "name": "[HE-CM01-1] CM1 For You — Rice+Roti+Kabab+BC",  # display on KDS
    "default_code": "HE-CM01-1",                              # retailer ID / SKU
    "list_price": 284.76,                                      # GST-exclusive base
    "type": "consu",                                           # consumable
    "available_in_pos": True,
    "pos_categ_ids": [[6, 0, [22]]],                          # Indian category
    "taxes_id": [[6, 0, [31]]],                               # 5% GST tax
    "company_id": 1                                            # HN Hotels
}
```

### Critical: What Each Field Maps To

| Field | ops Value | What to check on test |
|-------|-----------|----------------------|
| `pos_categ_ids: [22]` | Indian category | **Find the equivalent Indian POS category ID on test.** It may NOT be 22. Search `pos.category` for name containing "Indian" |
| `taxes_id: [31]` | 5% GST (Tax ID 31) | **Find the 5% GST tax ID on test.** Search `account.tax` for `amount=5, type_tax_use='sale'` |
| `company_id: 1` | HN Hotels | Should be the same on test (Company 1) |

---

## POS CONFIG VISIBILITY

On ops, these products are visible because **category 22 (Indian)** is in the `iface_available_categ_ids` of:

| Config | Name | Has Cat 22? |
|--------|------|------------|
| 5 | Cash Counter | ✅ |
| 6 | Captain | ✅ |
| 10 | HE - WABA | ✅ |
| 7 | HE - Delivery | ✅ (but combos are NOT for Swiggy/Zomato) |

**On test:** Verify that the Indian category is in the allowed categories for the equivalent Cash Counter and Captain POS configs. If not, add it.

---

## WHAT YASH NEEDS TO DO ON test.hamzahotel.com

### Step 1: Identify Equivalent IDs on test

Before creating products, find these IDs on test.hamzahotel.com:

```
1. POS Category "Indian" → ID on test = ???  (ops = 22)
2. Tax "5% GST" (sale) → ID on test = ???    (ops = 31)
3. Company → ID on test = ???                 (ops = 1)
4. Cash Counter POS Config → ID on test = ??? (ops = 5)
5. Captain POS Config → ID on test = ???      (ops = 6)
6. WABA POS Config → ID on test = ???         (ops = 10)
```

**How to find them:**
```python
# Find Indian POS category
pos.category → search_read([('name', 'ilike', 'Indian')], fields=['id', 'name'])

# Find 5% GST tax
account.tax → search_read([('amount', '=', 5), ('type_tax_use', '=', 'sale')], fields=['id', 'name'])

# Find POS configs
pos.config → search_read([], fields=['id', 'name', 'iface_available_categ_ids'])
```

### Step 2: Create 15 Products

Use the script or create manually via Odoo UI. If using the script:

```bash
# Edit scripts/create-combo-products-v2.js:
# Change line 11: ODOO_URL = 'https://test.hamzahotel.com/jsonrpc'
# Change line 13: ODOO_UID = <test UID>
# Update pos_categ_ids if Indian cat ID is different on test
# Update taxes_id if GST tax ID is different on test

ODOO_API_KEY=<test-api-key> node scripts/create-combo-products-v2.js
```

**Record the 15 new product IDs** — they will be different from ops IDs (1475-1489).

### Step 3: Verify POS Visibility

After creating products, check:
1. Open Cash Counter POS → search for "CM1" → should appear
2. Open Captain POS → search for "CM1" → should appear
3. Products should show under the "Indian" category in the POS product list

### Step 4: Update whatsapp.js PRODUCTS Constant

The PRODUCTS constant in `functions/api/whatsapp.js` has hardcoded Odoo product IDs. After creating on test, the `odooId` values need to be updated:

```javascript
// Current (ops IDs):
'HE-CM01-1': { name: 'CM1 For You — Rice+Roti+Kabab+BC', price: 285, odooId: 1475, catId: 22 },

// Update to test IDs:
'HE-CM01-1': { name: 'CM1 For You — Rice+Roti+Kabab+BC', price: 285, odooId: ????, catId: 22 },
```

**All 15 entries need their `odooId` updated.** The `catId` may also need updating if test's Indian category has a different ID.

Location in code: `functions/api/whatsapp.js` around line 249-263.

### Step 5: Update Odoo URL in whatsapp.js

The bot currently points to ops:
```javascript
// Line 323:
const ODOO_URL = 'https://ops.hamzahotel.com/jsonrpc';
```

For production, this should point to test:
```javascript
const ODOO_URL = 'https://test.hamzahotel.com/jsonrpc';
```

**⚠️ WARNING:** This change affects ALL WABA orders, not just combos. Only do this when the full WABA system is ready on test.

### Step 6: Verify KDS Routing

On ops, category 22 routes to these KDS displays:
- KDS 11 (Indian Kitchen) — stage 31
- KDS 15 (Kitchen Pass Master) — stage 75
- KDS 21 (Kitchen Pass TV) — stage 67
- KDS 28 (Assembly) — stage 94

**On test, verify:**
```python
pos.prep.display → search_read(
    [('pos_config_ids', 'in', [<WABA config ID on test>])],
    fields=['id', 'name', 'stage_ids', 'categ_ids']
)
```

The `KDS_INITIAL_STAGES` constant in whatsapp.js (line 279) will need to be updated if test has different stage IDs:

```javascript
const KDS_INITIAL_STAGES = {
  22: [31, 75, 67, 94],  // These are ops stage IDs — find equivalents on test
  // ...
};
```

---

## WHAT DOES NOT NEED TO CHANGE ON TEST

| Component | Why |
|-----------|-----|
| Meta Commerce Catalog | Catalog is tied to Meta/WhatsApp, not Odoo. Same catalog works regardless of which Odoo instance |
| WhatsApp Bot Flow | The conversational logic stays the same |
| D1 Database | Cloudflare D1 is independent of Odoo |
| Razorpay Payments | Payment processing is independent of Odoo |
| Booking System | WhatsApp Flows + D1, not Odoo |
| Dashboards | Read from D1, not from Odoo directly |

---

## EDGE CASES TO WATCH

1. **POS Session must be open:** WABA orders require an active POS session on config 10 (or equivalent on test). If no session is open, orders fail silently. Check: `pos.session` → `search_read([('config_id', '=', <WABA config>), ('state', '=', 'opened')])`

2. **Pricelist ID:** ops uses pricelist 5. Test may have a different default pricelist. Check `PRICELIST_ID` constant (line 328).

3. **Payment Method ID:** ops uses PM 17 (WABA General UPI). Test needs an equivalent UPI payment method on the WABA POS config. Check `PAYMENT_METHOD_UPI` constant (line 329).

4. **Product name prefix:** All combo names start with `[HE-CM0X-Y]` which gets stripped by `cleanProductName()` in the dashboards. Keep this naming convention.

5. **Existing products:** The script checks for existing `default_code` starting with `HE-CM` before creating. If products already exist on test with these codes, it will skip them.

6. **GST calculation:** Prices in PRODUCTS are GST-exclusive. The bot multiplies by 1.05 for customer-facing prices. Odoo's tax engine also applies 5% GST. Make sure the tax is configured the same way (inclusive vs exclusive) on test.

---

## THE COMBO DETAILS (for reference)

| # | Combo Name | What's Included | FREE with every plate |
|---|-----------|-----------------|----------------------|
| 1 | Ghee Rice + Tandoor Roti + Kabab + Butter Chicken | Ghee Rice + 1 Tandoor Roti + 3pc Kabab + 250g Butter Chicken | Dal + Gravy + Onion Salad |
| 2 | Ghee Rice + Dal Fry + Brain Dry Fry + Kulcha | Ghee Rice + 300g Dal Fry + Quarter Brain Dry Fry + 2 Kulcha | Dal + Gravy + Onion Salad |
| 3 | Ghee Rice + Dal Fry | Ghee Rice + 300g Dal Fry | Dal + Gravy + Onion Salad |
| 4 | Brain Dry Fry + Butter Naan | Quarter Brain Dry Fry + 2 Butter Naan | Dal + Gravy + Onion Salad |
| 5 | Ghee Rice + Butter Chicken + Butter Naan | Ghee Rice + 300g Butter Chicken + 1 Butter Naan | Dal + Gravy + Onion Salad |

---

## SCRIPT LOCATION

All scripts are in the repo (Yash has git access):

```
hamza-express-site/
├── scripts/create-combo-products-v2.js    ← Creates 15 products in Odoo
├── scripts/create-combo-catalog-v2.js     ← Adds to Meta catalog (already done, don't re-run)
└── functions/api/whatsapp.js              ← Bot code with PRODUCTS + COMBO_MPM
```

**To run on test:**
```bash
# 1. Edit create-combo-products-v2.js — change ODOO_URL to test.hamzahotel.com
# 2. Run:
ODOO_API_KEY=<test-api-key> node scripts/create-combo-products-v2.js
# 3. Copy the output product IDs
# 4. Update odooId values in whatsapp.js PRODUCTS constant
# 5. Commit and push (auto-deploys on Cloudflare Pages)
```

---

## SUMMARY CHECKLIST FOR YASH

- [ ] Find Indian POS category ID on test
- [ ] Find 5% GST tax ID on test
- [ ] Find/create WABA POS config on test (equivalent of config 10)
- [ ] Ensure WABA POS config has Indian category in allowed categories
- [ ] Edit `create-combo-products-v2.js` → point to test + update IDs if different
- [ ] Run script → create 15 products
- [ ] Record new product IDs
- [ ] Update `whatsapp.js` PRODUCTS constant with test odooId values
- [ ] Update `whatsapp.js` ODOO_URL to test.hamzahotel.com (when ready for full cutover)
- [ ] Update KDS_INITIAL_STAGES if stage IDs differ on test
- [ ] Update PRICELIST_ID if different on test
- [ ] Update PAYMENT_METHOD_UPI if different on test
- [ ] Verify POS session is open on WABA config
- [ ] Test: search "CM1" in Cash Counter POS → visible
- [ ] Test: search "CM1" in Captain POS → visible
- [ ] Test: send "combos" to WhatsApp bot → MPM appears with variant picker
