// Hamza Express Inventory API - Cloudflare Worker
// Handles: pending receipts, receipt validation, stock transfers, live status
// Adapted from NCH inventory system for HE (Company 1)

export async function onRequest(context) {
  const corsHeaders = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json'};
  if (context.request.method === 'OPTIONS') return new Response(null, {headers: corsHeaders});

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action');

  const ODOO_URL = context.env.ODOO_URL || 'https://ops.hamzahotel.com/jsonrpc';
  const ODOO_DB = context.env.ODOO_DB || 'main';
  const ODOO_UID = parseInt(context.env.ODOO_UID || '2');
  const ODOO_API_KEY = context.env.ODOO_API_KEY;

  // HE Location IDs (Company 1)
  const LOC = {VENDORS: 1, STOCK: 5, MAIN_STORAGE: 47, COLD_STORAGE: 48, KITCHEN: 49, WASTAGE: 50};

  // HE Picking Type IDs
  const PICKING_TYPES = {
    'take-to-kitchen':   30,
    'take-from-cold':    31,
    'return-to-storage': 32,
    'wastage':           33,
  };

  // Transfer source/dest config
  const TRANSFER_CONFIG = {
    'take-to-kitchen':   {srcLoc: LOC.MAIN_STORAGE, destLoc: LOC.KITCHEN},
    'take-from-cold':    {srcLoc: LOC.COLD_STORAGE, destLoc: LOC.KITCHEN},
    'return-to-storage': {srcLoc: LOC.KITCHEN,      destLoc: LOC.MAIN_STORAGE},
    'wastage':           {srcLoc: LOC.KITCHEN,      destLoc: LOC.WASTAGE},
  };

  // PIN verification — matches Odoo POS employee PINs
  const PINS = {'0305': 'Nihaf', '2026': 'Zoya', '3697': 'Yashwant', '3754': 'Naveen', '8241': 'Nafees'};

  // HE Raw Materials reference (Odoo IDs 1260-1330)
  const RAW_MATERIALS = {
    1260: {name: 'Green Cardamom (Elaichi)', code: 'HE-RM-001', uom: 'kg'},
    1261: {name: 'Black Cardamom (Badi Elaichi)', code: 'HE-RM-002', uom: 'kg'},
    1262: {name: 'Cinnamon Sticks (Dalchini)', code: 'HE-RM-003', uom: 'kg'},
    1263: {name: 'Mace (Javitri)', code: 'HE-RM-004', uom: 'kg'},
    1264: {name: 'Nutmeg (Jaiphal)', code: 'HE-RM-005', uom: 'kg'},
    1265: {name: 'Star Anise', code: 'HE-RM-006', uom: 'kg'},
    1266: {name: 'Bay Leaves (Tej Patta)', code: 'HE-RM-007', uom: 'kg'},
    1267: {name: 'Cloves (Laung)', code: 'HE-RM-008', uom: 'kg'},
    1268: {name: 'Fennel Seeds (Saunf)', code: 'HE-RM-009', uom: 'kg'},
    1269: {name: 'Cumin Seeds (Jeera)', code: 'HE-RM-010', uom: 'kg'},
    1270: {name: 'Whole Red Chilli (Dried)', code: 'HE-RM-011', uom: 'kg'},
    1271: {name: 'Whole Black Pepper', code: 'HE-RM-012', uom: 'kg'},
    1272: {name: 'Mustard Seeds (Rai)', code: 'HE-RM-013', uom: 'kg'},
    1273: {name: 'Sesame Seeds (Til)', code: 'HE-RM-014', uom: 'kg'},
    1274: {name: 'Kasuri Methi (Dried Fenugreek)', code: 'HE-RM-015', uom: 'kg'},
    1275: {name: 'Curry Leaves (Kadi Patta)', code: 'HE-RM-016', uom: 'kg'},
    1276: {name: 'Red Chilli Powder', code: 'HE-RM-017', uom: 'kg'},
    1277: {name: 'Cumin Powder (Jeera)', code: 'HE-RM-018', uom: 'kg'},
    1278: {name: 'Coriander Powder (Dhania)', code: 'HE-RM-019', uom: 'kg'},
    1279: {name: 'Turmeric Powder (Haldi)', code: 'HE-RM-020', uom: 'kg'},
    1280: {name: 'Kitchen King Masala', code: 'HE-RM-021', uom: 'kg'},
    1281: {name: 'Kashmiri Red Chilli Powder', code: 'HE-RM-022', uom: 'kg'},
    1282: {name: 'Chaat Masala', code: 'HE-RM-023', uom: 'kg'},
    1283: {name: 'Amchur Powder (Dry Mango)', code: 'HE-RM-024', uom: 'kg'},
    1284: {name: 'Desiccated Coconut Powder', code: 'HE-RM-025', uom: 'kg'},
    1285: {name: 'White Pepper Powder', code: 'HE-RM-026', uom: 'kg'},
    1286: {name: 'Salt', code: 'HE-RM-027', uom: 'kg'},
    1287: {name: 'Black Salt (Kala Namak)', code: 'HE-RM-028', uom: 'kg'},
    1288: {name: 'Sugar', code: 'HE-RM-029', uom: 'kg'},
    1289: {name: 'Basmati Rice', code: 'HE-RM-030', uom: 'kg'},
    1290: {name: 'Toor Dal (Arhar)', code: 'HE-RM-031', uom: 'kg'},
    1291: {name: 'Wheat Flour (Atta)', code: 'HE-RM-032', uom: 'kg'},
    1292: {name: 'All-Purpose Flour (Maida)', code: 'HE-RM-033', uom: 'kg'},
    1293: {name: 'Corn Flour (Corn Starch)', code: 'HE-RM-034', uom: 'kg'},
    1294: {name: 'Instant Noodles (Hakka)', code: 'HE-RM-035', uom: 'kg'},
    1295: {name: 'Cashew Nuts (Kaju)', code: 'HE-RM-036', uom: 'kg'},
    1296: {name: 'Cashew Paste (Magaz)', code: 'HE-RM-037', uom: 'kg'},
    1297: {name: 'Whole Cashews', code: 'HE-RM-038', uom: 'kg'},
    1298: {name: 'Chana Dal (Split Bengal Gram)', code: 'HE-RM-039', uom: 'kg'},
    1299: {name: 'Ajinomoto (MSG)', code: 'HE-RM-040', uom: 'kg'},
    1300: {name: 'Mustard Oil', code: 'HE-RM-041', uom: 'L'},
    1301: {name: 'Refined Oil (Soybean/Sunflower)', code: 'HE-RM-042', uom: 'L'},
    1302: {name: 'Salato Oil (Blended)', code: 'HE-RM-043', uom: 'L'},
    1303: {name: 'Vanaspati Ghee (Dalda)', code: 'HE-RM-044', uom: 'kg'},
    1304: {name: 'Cow Ghee (Desi)', code: 'HE-RM-045', uom: 'kg'},
    1305: {name: 'Amul Butter', code: 'HE-RM-046', uom: 'kg'},
    1306: {name: 'Amul Fresh Cream', code: 'HE-RM-047', uom: 'L'},
    1307: {name: 'Amul Cheese (Block)', code: 'HE-RM-048', uom: 'kg'},
    1308: {name: 'Tomato Ketchup', code: 'HE-RM-049', uom: 'kg'},
    1309: {name: 'Soya Sauce', code: 'HE-RM-050', uom: 'L'},
    1310: {name: 'Red Chilli Sauce', code: 'HE-RM-051', uom: 'L'},
    1311: {name: 'Vinegar', code: 'HE-RM-052', uom: 'L'},
    1312: {name: 'Capsicum Sauce (Green Chilli)', code: 'HE-RM-053', uom: 'L'},
    1313: {name: '88 Sauce (Maggi Hot & Sweet)', code: 'HE-RM-054', uom: 'L'},
    1314: {name: 'Red Food Colour', code: 'HE-RM-055', uom: 'g'},
    1315: {name: 'Yellow Food Colour', code: 'HE-RM-056', uom: 'g'},
    1316: {name: 'Green Food Colour', code: 'HE-RM-057', uom: 'g'},
    1317: {name: 'Onion', code: 'HE-RM-058', uom: 'kg'},
    1318: {name: 'Ginger Garlic Paste', code: 'HE-RM-059', uom: 'kg'},
    1319: {name: 'Green Chillies', code: 'HE-RM-060', uom: 'kg'},
    1320: {name: 'Carrot', code: 'HE-RM-061', uom: 'kg'},
    1321: {name: 'Cabbage', code: 'HE-RM-062', uom: 'kg'},
    1322: {name: 'Capsicum (Bell Pepper)', code: 'HE-RM-063', uom: 'kg'},
    1323: {name: 'Cauliflower (Gobi)', code: 'HE-RM-064', uom: 'kg'},
    1324: {name: 'Lemon (Nimbu)', code: 'HE-RM-065', uom: 'kg'},
    1325: {name: 'Fresh Mint (Pudina)', code: 'HE-RM-066', uom: 'kg'},
    1326: {name: 'Fresh Coriander (Dhaniya)', code: 'HE-RM-067', uom: 'kg'},
    1327: {name: 'French Beans', code: 'HE-RM-068', uom: 'kg'},
    1328: {name: 'Spring Onion', code: 'HE-RM-069', uom: 'kg'},
    1329: {name: 'Tomato', code: 'HE-RM-070', uom: 'kg'},
    1330: {name: 'Cucumber', code: 'HE-RM-071', uom: 'kg'},
    // ── Meat & Poultry ──
    1331: {name: 'Chicken Whole - Skin Out', code: 'HE-RM-072', uom: 'kg'},
    1332: {name: 'Chicken Tandoori Cut - Skin Out', code: 'HE-RM-073', uom: 'kg'},
    1333: {name: 'Chicken Whole - With Skin', code: 'HE-RM-074', uom: 'kg'},
    1334: {name: 'Chicken Boneless Breast', code: 'HE-RM-075', uom: 'kg'},
    1335: {name: 'Chicken Thighs', code: 'HE-RM-076', uom: 'kg'},
    1336: {name: 'Mutton Biryani Cut', code: 'HE-RM-077', uom: 'kg'},
    1337: {name: 'Mutton Chops', code: 'HE-RM-078', uom: 'kg'},
    1338: {name: 'Mutton Gravy Cut', code: 'HE-RM-079', uom: 'kg'},
    // ── Additional Spices ──
    1339: {name: 'Guntur Red Chilli (Dried)', code: 'HE-RM-080', uom: 'kg'},
    1340: {name: 'Khaskhas (Poppy Seeds)', code: 'HE-RM-081', uom: 'kg'},
    1341: {name: 'Imli (Tamarind)', code: 'HE-RM-082', uom: 'kg'},
    1342: {name: 'Carom Seeds (Ajwain)', code: 'HE-RM-083', uom: 'kg'},
    1343: {name: 'Saffron (Kesar)', code: 'HE-RM-084', uom: 'g'},
    1344: {name: 'Kalonji (Nigella Seeds)', code: 'HE-RM-085', uom: 'kg'},
    // ── Additional Dry Goods ──
    1345: {name: 'Peanuts (Raw)', code: 'HE-RM-086', uom: 'kg'},
    1346: {name: 'Lemon Salt (Citric Acid)', code: 'HE-RM-087', uom: 'kg'},
  };

  const DB = context.env.DB;

  // Helper: verify PIN from query param or POST body (required for all actions except verify-pin)
  function requirePin(pin) {
    return PINS[pin] || null;
  }

  try {
    // ─── GET PENDING RECEIPTS (no auth — non-sensitive PO list, PIN checked at confirm) ──
    if (action === 'pending-receipts') {
      const pickings = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
        'stock.picking', 'search_read',
        [[['state', '=', 'assigned'], ['picking_type_id.code', '=', 'incoming'], ['company_id', '=', 1]]],
        {fields: ['id', 'name', 'origin', 'partner_id', 'scheduled_date', 'location_dest_id', 'note', 'move_ids', 'state']}
      );

      const enriched = await Promise.all(pickings.map(async (picking) => {
        const moves = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
          'stock.move', 'read', [picking.move_ids],
          {fields: ['id', 'product_id', 'product_uom_qty', 'quantity', 'location_dest_id', 'move_line_ids', 'state']}
        );

        const allMoveLineIds = moves.flatMap(m => m.move_line_ids || []);
        let moveLines = [];
        if (allMoveLineIds.length > 0) {
          moveLines = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
            'stock.move.line', 'read', [allMoveLineIds],
            {fields: ['id', 'move_id', 'product_id', 'quantity', 'lot_id', 'lot_name', 'location_dest_id', 'picked']}
          );
        }

        const productIds = [...new Set(moves.map(m => m.product_id[0]))];
        const products = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
          'product.product', 'read', [productIds],
          {fields: ['id', 'name', 'default_code', 'uom_id', 'tracking', 'barcode']}
        );
        const productMap = Object.fromEntries(products.map(p => [p.id, p]));

        const items = moves.map(move => {
          const product = productMap[move.product_id[0]] || {};
          const mLine = moveLines.find(ml => ml.move_id[0] === move.id);
          return {
            moveId: move.id,
            moveLineId: mLine ? mLine.id : null,
            productId: move.product_id[0],
            productName: product.name || move.product_id[1],
            productCode: product.default_code || '',
            uom: product.uom_id ? product.uom_id[1] : '',
            tracking: product.tracking || 'none',
            barcode: product.barcode || product.default_code || '',
            expectedQty: move.product_uom_qty,
            destinationId: mLine ? mLine.location_dest_id[0] : move.location_dest_id[0],
            destinationName: mLine ? mLine.location_dest_id[1] : move.location_dest_id[1],
          };
        });

        const noteText = picking.note ? picking.note.replace(/<[^>]*>/g, '').trim() : '';

        return {
          pickingId: picking.id,
          name: picking.name,
          poName: picking.origin || '',
          vendorName: picking.partner_id ? picking.partner_id[1] : 'Unknown',
          vendorId: picking.partner_id ? picking.partner_id[0] : null,
          scheduledDate: picking.scheduled_date,
          note: noteText === 'false' ? '' : noteText,
          itemCount: items.length,
          items: items,
        };
      }));

      return new Response(JSON.stringify({success: true, receipts: enriched}), {headers: corsHeaders});
    }

    // ─── CONFIRM RECEIPT ─────────────────────────────────────────
    if (action === 'confirm-receipt' && context.request.method === 'POST') {
      const body = await context.request.json();
      const {pickingId, pin, items} = body;

      if (!pickingId || !items || !Array.isArray(items)) {
        return new Response(JSON.stringify({success: false, error: 'Missing pickingId or items'}), {headers: corsHeaders});
      }

      const confirmedBy = PINS[pin];
      if (!confirmedBy) {
        return new Response(JSON.stringify({success: false, error: 'Invalid PIN'}), {headers: corsHeaders});
      }

      for (const item of items) {
        if (item.moveLineId) {
          const writeData = {
            quantity: item.receivedQty,
            picked: true,
            location_dest_id: item.destinationId || LOC.MAIN_STORAGE,
          };

          if (item.lotName) {
            const existingLots = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
              'stock.lot', 'search_read',
              [[['name', '=', item.lotName], ['product_id', '=', item.productId], ['company_id', '=', 1]]],
              {fields: ['id'], limit: 1}
            );

            if (existingLots.length > 0) {
              writeData.lot_id = existingLots[0].id;
            } else {
              const lotId = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
                'stock.lot', 'create',
                [{name: item.lotName, product_id: item.productId, company_id: 1}]
              );
              writeData.lot_id = lotId;
            }
          }

          await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
            'stock.move.line', 'write', [[item.moveLineId], writeData]);
        }

        if (item.moveId) {
          await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
            'stock.move', 'write',
            [[item.moveId], {picked: true, location_dest_id: item.destinationId || LOC.MAIN_STORAGE}]);
        }
      }

      let validateResult;
      try {
        validateResult = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
          'stock.picking', 'button_validate', [[pickingId]]);
      } catch (valErr) {
        return new Response(JSON.stringify({
          success: false, error: `Validation failed: ${valErr.message}`, confirmedBy,
        }), {headers: corsHeaders});
      }

      let backorderCreated = false;
      const wizardContext = {context: {button_validate_picking_ids: [pickingId], skip_backorder: false}};

      if (validateResult && typeof validateResult === 'object' && validateResult.res_model) {
        if (validateResult.res_model === 'stock.backorder.confirmation') {
          try {
            await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
              'stock.backorder.confirmation', 'process', [[validateResult.res_id]], wizardContext);
            backorderCreated = true;
          } catch (e) {
            try {
              const freshWizardId = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
                'stock.backorder.confirmation', 'create', [{pick_ids: [[4, pickingId, false]]}]);
              await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
                'stock.backorder.confirmation', 'process', [[freshWizardId]], wizardContext);
              backorderCreated = true;
            } catch (e2) { /* backorder failed */ }
          }
        } else if (validateResult.res_model === 'stock.immediate.transfer') {
          try {
            await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
              'stock.immediate.transfer', 'process', [[validateResult.res_id]], wizardContext);
          } catch (e) { /* immediate transfer wizard failed */ }
        }
      }

      const finalState = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
        'stock.picking', 'read', [[pickingId]],
        {fields: ['state', 'name', 'origin', 'partner_id', 'backorder_ids']});
      const picking = finalState[0] || {};
      const hasDiscrepancy = items.some(item => item.receivedQty !== item.expectedQty);
      if (picking.backorder_ids && picking.backorder_ids.length > 0) backorderCreated = true;

      if (DB) {
        try {
          await DB.prepare(
            'INSERT INTO receipt_confirmations (picking_id, picking_name, po_name, vendor_name, confirmed_by, confirmed_at) VALUES (?,?,?,?,?,?)'
          ).bind(pickingId, picking.name || '', picking.origin || '', picking.partner_id ? picking.partner_id[1] : '', confirmedBy, new Date().toISOString()).run();
        } catch (dbErr) { /* D1 write non-fatal */ }
      }

      return new Response(JSON.stringify({
        success: true, message: 'Receipt confirmed', confirmedBy,
        pickingState: picking.state, pickingName: picking.name,
        backorderCreated, hasDiscrepancy,
        items: items.map(i => ({product: i.productName, expected: i.expectedQty, received: i.receivedQty})),
      }), {headers: corsHeaders});
    }

    // ─── VERIFY PIN ──────────────────────────────────────────────
    if (action === 'verify-pin') {
      const pin = url.searchParams.get('pin');
      if (PINS[pin]) return new Response(JSON.stringify({success: true, user: PINS[pin]}), {headers: corsHeaders});
      return new Response(JSON.stringify({success: false, error: 'Invalid PIN'}), {headers: corsHeaders});
    }

    // ─── RECENT RECEIPTS (no auth — non-sensitive completed PO list) ──
    if (action === 'recent-receipts') {
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const pickings = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
        'stock.picking', 'search_read',
        [[['state', '=', 'done'], ['picking_type_id.code', '=', 'incoming'], ['company_id', '=', 1]]],
        {fields: ['id', 'name', 'origin', 'partner_id', 'date_done', 'move_ids'], order: 'date_done desc', limit});
      return new Response(JSON.stringify({success: true, receipts: pickings}), {headers: corsHeaders});
    }

    // ─── STORAGE STOCK ───────────────────────────────────────────
    if (action === 'storage-stock') {
      const pin = url.searchParams.get('pin');
      if (!requirePin(pin)) return new Response(JSON.stringify({success: false, error: 'Authentication required'}), {status: 401, headers: corsHeaders});
      const stock = await fetchLocationStock(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, [LOC.MAIN_STORAGE, LOC.COLD_STORAGE], 1);
      return new Response(JSON.stringify({success: true, stock}), {headers: corsHeaders});
    }

    // ─── KITCHEN STOCK ───────────────────────────────────────────
    if (action === 'kitchen-stock') {
      const pin = url.searchParams.get('pin');
      if (!requirePin(pin)) return new Response(JSON.stringify({success: false, error: 'Authentication required'}), {status: 401, headers: corsHeaders});
      const stock = await fetchLocationStock(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, [LOC.KITCHEN], 1);
      return new Response(JSON.stringify({success: true, stock}), {headers: corsHeaders});
    }

    // ─── INTERNAL TRANSFER ───────────────────────────────────────
    if (action === 'transfer' && context.request.method === 'POST') {
      const body = await context.request.json();
      const {pin, type, items, reason} = body;

      if (!pin || !type || !items || !Array.isArray(items) || items.length === 0) {
        return new Response(JSON.stringify({success: false, error: 'Missing pin, type, or items'}), {headers: corsHeaders});
      }

      const confirmedBy = PINS[pin];
      if (!confirmedBy) return new Response(JSON.stringify({success: false, error: 'Invalid PIN'}), {headers: corsHeaders});

      const config = TRANSFER_CONFIG[type];
      const pickingTypeId = PICKING_TYPES[type];
      if (!config || !pickingTypeId) return new Response(JSON.stringify({success: false, error: 'Invalid transfer type'}), {headers: corsHeaders});

      const now = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
      const dateStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`;
      const timeStr = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;
      const originRef = `Kitchen/${confirmedBy}/${dateStr} ${timeStr}`;

      const pickingVals = {
        picking_type_id: pickingTypeId,
        location_id: config.srcLoc,
        location_dest_id: config.destLoc,
        origin: originRef,
        company_id: 1,
      };
      if (reason) pickingVals.note = `Wastage reason: ${reason}`;

      const productIds = [...new Set(items.map(i => i.productId))];
      const productData = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
        'product.product', 'read', [productIds], {fields: ['id', 'uom_id', 'tracking']});
      const productMap = Object.fromEntries(productData.map(p => [p.id, p]));

      for (const item of items) {
        const prod = productMap[item.productId];
        if (!prod) return new Response(JSON.stringify({success: false, error: `Product ${item.productName || item.productId} not found`}), {headers: corsHeaders});
        if (prod.tracking === 'lot' && !item.lotId) return new Response(JSON.stringify({success: false, error: `${item.productName} requires lot tracking but no lot was found.`}), {headers: corsHeaders});
      }

      const pickingId = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.picking', 'create', [pickingVals]);

      try {
        for (const item of items) {
          const prod = productMap[item.productId];
          const moveId = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.move', 'create', [{
            picking_id: pickingId, product_id: item.productId, product_uom: prod.uom_id[0],
            product_uom_qty: item.quantity, location_id: config.srcLoc, location_dest_id: config.destLoc, company_id: 1,
          }]);

          if (item.lotId) {
            const moveData = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.move', 'read', [[moveId]], {fields: ['move_line_ids']});
            if (moveData[0]?.move_line_ids?.length > 0) {
              await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.move.line', 'write',
                [moveData[0].move_line_ids, {lot_id: item.lotId, quantity: item.quantity, picked: true}]);
            }
          }
        }

        await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.picking', 'action_confirm', [[pickingId]]);
        try { await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.picking', 'action_assign', [[pickingId]]); } catch (e) {}

        const confirmedPicking = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.picking', 'read', [[pickingId]], {fields: ['move_ids']});
        if (confirmedPicking[0]?.move_ids?.length > 0) {
          const moves = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.move', 'read', [confirmedPicking[0].move_ids], {fields: ['id', 'product_uom_qty', 'move_line_ids']});
          for (const move of moves) {
            await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.move', 'write', [[move.id], {quantity: move.product_uom_qty, picked: true}]);
            if (move.move_line_ids?.length > 0) {
              await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.move.line', 'write', [move.move_line_ids, {picked: true}]);
            }
          }
        }

        const validateResult = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.picking', 'button_validate', [[pickingId]]);
        if (validateResult && typeof validateResult === 'object' && validateResult.res_model) {
          try { await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, validateResult.res_model, 'process', [[validateResult.res_id]]); } catch (e) {
            try { await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, validateResult.res_model, 'process_cancel_backorder', [[validateResult.res_id]]); } catch (e2) {}
          }
        }
      } catch (moveError) {
        try { await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.picking', 'action_cancel', [[pickingId]]); } catch (cancelErr) {}
        throw new Error(`Transfer failed: ${moveError.message}`);
      }

      const finalPicking = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY, 'stock.picking', 'read', [[pickingId]], {fields: ['state', 'name']});
      return new Response(JSON.stringify({
        success: true, message: 'Transfer completed', pickingName: finalPicking[0]?.name, pickingState: finalPicking[0]?.state,
        confirmedBy, type, reason: reason || null,
        items: items.map(i => ({product: i.productName, quantity: i.quantity})),
      }), {headers: corsHeaders});
    }

    // ─── LIVE INVENTORY STATUS ───────────────────────────────────
    if (action === 'live-status') {
      const pin = url.searchParams.get('pin');
      if (!requirePin(pin)) return new Response(JSON.stringify({success: false, error: 'Authentication required'}), {status: 401, headers: corsHeaders});
      let lastSettlement = null;
      let closingStock = {};
      if (DB) {
        try {
          lastSettlement = await DB.prepare(
            "SELECT id, settlement_date, settled_at, settled_by, inventory_closing FROM daily_settlements WHERE status IN ('completed','bootstrap') ORDER BY settled_at DESC LIMIT 1"
          ).first();
          if (lastSettlement) closingStock = JSON.parse(lastSettlement.inventory_closing || '{}');
        } catch (e) {}
      }

      const sinceUTC = lastSettlement
        ? new Date(lastSettlement.settled_at).toISOString().slice(0, 19).replace('T', ' ')
        : new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 19).replace('T', ' ');

      const pickings = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
        'stock.picking', 'search_read',
        [[['state', '=', 'done'], ['picking_type_id.code', '=', 'incoming'], ['date_done', '>=', sinceUTC], ['company_id', '=', 1]]],
        {fields: ['id', 'name', 'origin', 'partner_id', 'date_done', 'move_ids'], order: 'date_done desc', limit: 50});

      const allMoveIds = pickings.flatMap(p => p.move_ids || []);
      let moves = [];
      if (allMoveIds.length > 0) {
        const rawMoves = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
          'stock.move', 'read', [allMoveIds], {fields: ['id', 'product_id', 'quantity', 'picking_id', 'move_line_ids']});
        const allMoveLineIds = rawMoves.flatMap(m => m.move_line_ids || []);
        const moveLineQtys = {};
        if (allMoveLineIds.length > 0) {
          const moveLines = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
            'stock.move.line', 'read', [allMoveLineIds], {fields: ['id', 'move_id', 'quantity']});
          for (const ml of moveLines) moveLineQtys[ml.move_id[0]] = (moveLineQtys[ml.move_id[0]] || 0) + (ml.quantity || 0);
        }
        moves = rawMoves.map(m => ({...m, quantity: moveLineQtys[m.id] !== undefined ? moveLineQtys[m.id] : m.quantity}));
      }

      // PO line costs
      const poNames = [...new Set(pickings.map(p => p.origin).filter(Boolean))];
      const poLineCosts = {};
      if (poNames.length > 0) {
        const poLines = await odooCall(ODOO_URL, ODOO_DB, ODOO_UID, ODOO_API_KEY,
          'purchase.order.line', 'search_read',
          [[['order_id.name', 'in', poNames]]], {fields: ['product_id', 'price_unit', 'order_id']});
        for (const pl of poLines) poLineCosts[`${pl.order_id[1]}_${pl.product_id[0]}`] = pl.price_unit;
      }

      // Receipt confirmations from D1
      const confirmations = {};
      if (DB && pickings.length > 0) {
        try {
          const pickingIds = pickings.map(p => p.id);
          const placeholders = pickingIds.map(() => '?').join(',');
          const rows = await DB.prepare(`SELECT picking_id, confirmed_by, confirmed_at FROM receipt_confirmations WHERE picking_id IN (${placeholders})`).bind(...pickingIds).all();
          for (const r of (rows.results || [])) confirmations[r.picking_id] = {confirmedBy: r.confirmed_by, confirmedAt: r.confirmed_at};
        } catch (e) {}
      }

      const received = {};
      const deliveries = pickings.map(p => {
        const pickingMoves = moves.filter(m => m.picking_id && m.picking_id[0] === p.id);
        const items = pickingMoves.map(m => {
          const matId = m.product_id[0];
          const qty = m.quantity || 0;
          const costKey = `${p.origin}_${matId}`;
          const unitCost = poLineCosts[costKey] || 0;
          if (!received[matId]) received[matId] = 0;
          received[matId] += qty;
          return {materialId: matId, name: RAW_MATERIALS[matId]?.name || m.product_id[1], qty, uom: RAW_MATERIALS[matId]?.uom || '', unitCost};
        });
        const conf = confirmations[p.id] || {};
        return {
          pickingId: p.id, pickingName: p.name, poName: p.origin || '',
          vendorName: p.partner_id ? p.partner_id[1] : 'Unknown', dateDone: p.date_done,
          confirmedBy: conf.confirmedBy || null, confirmedAt: conf.confirmedAt || null, items,
        };
      });

      const currentStock = {};
      const allMatIds = new Set([...Object.keys(closingStock), ...Object.keys(received)]);
      for (const matId of allMatIds) {
        const mat = RAW_MATERIALS[matId];
        if (!mat) continue;
        const opening = closingStock[matId] || 0;
        const rec = received[matId] || 0;
        currentStock[matId] = {
          name: mat.name, code: mat.code, uom: mat.uom,
          opening: Math.round(opening * 10000) / 10000,
          received: Math.round(rec * 10000) / 10000,
          current: Math.round((opening + rec) * 10000) / 10000,
        };
      }

      return new Response(JSON.stringify({
        success: true,
        lastSettlement: lastSettlement ? {id: lastSettlement.id, settlementDate: lastSettlement.settlement_date, settledAt: lastSettlement.settled_at, settledBy: lastSettlement.settled_by} : null,
        deliveries, currentStock, rawMaterials: RAW_MATERIALS,
      }), {headers: corsHeaders});
    }

    // ─── SETTLEMENT TRAIL ────────────────────────────────────────
    if (action === 'settlement-trail') {
      const pin = url.searchParams.get('pin');
      if (!requirePin(pin)) return new Response(JSON.stringify({success: false, error: 'Authentication required'}), {status: 401, headers: corsHeaders});
      if (!DB) return new Response(JSON.stringify({success: false, error: 'DB not configured'}), {headers: corsHeaders});
      const limit = parseInt(url.searchParams.get('limit') || '20');
      try {
        const results = await DB.prepare(
          "SELECT id, settlement_date, period_start, period_end, settled_by, settled_at, status, inventory_opening, inventory_purchases, inventory_closing, inventory_consumption FROM daily_settlements WHERE status IN ('completed','bootstrap') ORDER BY settled_at DESC LIMIT ?"
        ).bind(limit).all();
        const settlements = (results.results || []).map(s => ({
          id: s.id, settlementDate: s.settlement_date, periodStart: s.period_start, periodEnd: s.period_end,
          settledBy: s.settled_by, settledAt: s.settled_at, status: s.status,
          opening: JSON.parse(s.inventory_opening || '{}'), purchases: JSON.parse(s.inventory_purchases || '{}'),
          closing: JSON.parse(s.inventory_closing || '{}'), consumption: JSON.parse(s.inventory_consumption || '{}'),
        }));
        return new Response(JSON.stringify({success: true, settlements, rawMaterials: RAW_MATERIALS}), {headers: corsHeaders});
      } catch (e) {
        return new Response(JSON.stringify({success: false, error: e.message}), {headers: corsHeaders});
      }
    }

    return new Response(JSON.stringify({success: false, error: 'Invalid action'}), {headers: corsHeaders});
  } catch (error) {
    console.error('Inventory API error:', error.message, error.stack);
    return new Response(JSON.stringify({success: false, error: 'Internal server error'}), {status: 500, headers: corsHeaders});
  }
}

// ─── ODOO JSON-RPC HELPER ──────────────────────────────────────
async function odooCall(url, db, uid, apiKey, model, method, positionalArgs, kwargs) {
  const payload = {
    jsonrpc: '2.0', method: 'call', id: Date.now(),
    params: {service: 'object', method: 'execute_kw', args: [db, uid, apiKey, model, method, positionalArgs, kwargs || {}]},
  };
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
  const data = await response.json();
  if (data.error) throw new Error(`Odoo ${model}.${method}: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

// ─── FETCH STOCK BY LOCATION ──────────────────────────────────
async function fetchLocationStock(odooUrl, db, uid, apiKey, locationIds, companyId) {
  const quants = await odooCall(odooUrl, db, uid, apiKey,
    'stock.quant', 'search_read',
    [[['location_id', 'in', locationIds], ['quantity', '>', 0], ['company_id', '=', companyId]]],
    {fields: ['id', 'product_id', 'quantity', 'lot_id', 'location_id', 'in_date']}
  );

  if (quants.length === 0) return [];

  const productIds = [...new Set(quants.map(q => q.product_id[0]))];
  const products = await odooCall(odooUrl, db, uid, apiKey,
    'product.product', 'read', [productIds],
    {fields: ['id', 'name', 'default_code', 'uom_id', 'tracking', 'barcode']}
  );
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  const grouped = {};
  for (const q of quants) {
    const pid = q.product_id[0];
    if (!grouped[pid]) {
      const p = productMap[pid] || {};
      grouped[pid] = {
        productId: pid, productName: p.name || q.product_id[1], productCode: p.default_code || '',
        barcode: p.barcode || p.default_code || '', uom: p.uom_id ? p.uom_id[1] : '',
        tracking: p.tracking || 'none', total: 0, lots: [],
      };
    }
    grouped[pid].total += q.quantity;
    grouped[pid].lots.push({
      lotId: q.lot_id ? q.lot_id[0] : null, lotName: q.lot_id ? q.lot_id[1] : null,
      qty: q.quantity, locationId: q.location_id[0], locationName: q.location_id[1],
    });
  }

  return Object.values(grouped).map(item => { item.total = Math.round(item.total * 100) / 100; return item; });
}
