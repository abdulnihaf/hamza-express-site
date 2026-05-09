// HE Swiggy Auto-Push — Content Script
// Injected into partner.swiggy.com
// Intercepts GraphQL polling responses to detect orders and auto-push to assembly API

(function () {
  'use strict';

  const EXT_NAME = '[HE-AutoPush]';
  const GRAPHQL_URL = 'vhc-composer.swiggy.com/query';
  const PUSH_API = 'https://hamzaexpress.in/api/assembly';
  const PRODUCTS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  // ── State ──────────────────────────────────────────────────────
  let config = { apiKey: '', enabled: false };
  let odooProducts = [];          // Cached Odoo products
  let productsLoadedAt = 0;
  let pushedOrderIds = new Set();  // Track already-pushed Swiggy order IDs
  let interceptorInstalled = false;

  // ── Load config from extension storage ─────────────────────────
  function loadConfig() {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['apiKey', 'enabled', 'pushedOrders'], result => {
          config.apiKey = result.apiKey || '';
          config.enabled = result.enabled !== false; // default true
          if (result.pushedOrders && Array.isArray(result.pushedOrders)) {
            pushedOrderIds = new Set(result.pushedOrders);
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  function savePushedOrders() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      // Keep only last 500 order IDs
      const arr = [...pushedOrderIds].slice(-500);
      chrome.storage.local.set({ pushedOrders: arr });
    }
  }

  // ── Log helper ─────────────────────────────────────────────────
  function log(...args) { console.log(EXT_NAME, ...args); }
  function warn(...args) { console.warn(EXT_NAME, ...args); }
  function err(...args) { console.error(EXT_NAME, ...args); }

  // ── Fetch Odoo products (for name matching) ────────────────────
  async function loadOdooProducts() {
    if (!config.apiKey) return;
    if (odooProducts.length > 0 && Date.now() - productsLoadedAt < PRODUCTS_CACHE_TTL) return;

    try {
      const res = await fetch(`${PUSH_API}?action=products&key=${encodeURIComponent(config.apiKey)}`);
      if (!res.ok) { warn('Products fetch failed:', res.status); return; }
      const data = await res.json();
      if (data.ok && data.products) {
        odooProducts = data.products;
        productsLoadedAt = Date.now();
        log('Loaded', odooProducts.length, 'Odoo products');
      }
    } catch (e) {
      err('Products load error:', e.message);
    }
  }

  // ── Fuzzy product name matching ────────────────────────────────
  function normalizeForMatch(name) {
    return (name || '')
      .toLowerCase()
      .replace(/\[he-\w+\]\s*/i, '')  // Strip [HE-XXXX] prefix
      .replace(/[^a-z0-9\s]/g, ' ')    // Remove special chars
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchProduct(swiggyItemName) {
    const normalized = normalizeForMatch(swiggyItemName);
    if (!normalized) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const product of odooProducts) {
      const prodNorm = normalizeForMatch(product.name);

      // Exact match
      if (prodNorm === normalized) {
        return product;
      }

      // Check if one contains the other
      if (prodNorm.includes(normalized) || normalized.includes(prodNorm)) {
        const score = Math.min(prodNorm.length, normalized.length) / Math.max(prodNorm.length, normalized.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = product;
        }
      }

      // Word overlap scoring
      const swiggyWords = new Set(normalized.split(' '));
      const prodWords = new Set(prodNorm.split(' '));
      let overlap = 0;
      for (const w of swiggyWords) {
        if (w.length > 2 && prodWords.has(w)) overlap++;
      }
      const wordScore = overlap / Math.max(swiggyWords.size, prodWords.size);
      if (wordScore > bestScore && wordScore >= 0.5) {
        bestScore = wordScore;
        bestMatch = product;
      }
    }

    // Only return if score is reasonable
    return bestScore >= 0.4 ? bestMatch : null;
  }

  // ── Push order to Assembly API ─────────────────────────────────
  async function pushOrder(swiggyOrder) {
    const orderId = String(swiggyOrder.order_id || swiggyOrder.orderId || '');
    if (!orderId || pushedOrderIds.has(orderId)) return;

    // Ensure products are loaded
    await loadOdooProducts();

    // Extract items from the Swiggy order
    const swiggyItems = extractItems(swiggyOrder);
    if (swiggyItems.length === 0) {
      warn('No items found in Swiggy order', orderId);
      return;
    }

    // Match each item to an Odoo product
    const matchedItems = [];
    const unmatchedItems = [];
    for (const si of swiggyItems) {
      const match = matchProduct(si.name);
      if (match) {
        matchedItems.push({
          odoo_product_id: match.odooId,
          name: match.name,
          quantity: si.quantity || 1,
          price: match.price || 0,
          category_id: match.catId,
        });
      } else {
        unmatchedItems.push(si.name);
        // Still push with Kitchen Pass default — item goes into Odoo as-is
        matchedItems.push({
          name: si.name,
          quantity: si.quantity || 1,
          price: 0,
          category_id: 22, // Default to Indian/Kitchen Pass
        });
      }
    }

    if (unmatchedItems.length > 0) {
      warn('Unmatched items in order', orderId, ':', unmatchedItems);
    }

    // Push to assembly API
    try {
      const customerName = swiggyOrder.customer_name || swiggyOrder.customerName || '';
      const res = await fetch(`${PUSH_API}?action=push&key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'swiggy',
          source_order_id: orderId,
          customer_name: customerName,
          items: matchedItems,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Duplicate — already pushed (possibly from a previous session)
        log('Order', orderId, 'already pushed (duplicate)');
        pushedOrderIds.add(orderId);
        savePushedOrders();
        return;
      }

      if (!res.ok) {
        err('Push failed for order', orderId, ':', data.error);
        return;
      }

      log('Pushed Swiggy order', orderId, '→ Assembly #' + data.assembly_order_id,
        data.odoo_order ? '(Odoo: ' + data.odoo_order.name + ')' : '(no Odoo)');

      pushedOrderIds.add(orderId);
      savePushedOrders();

      // Notify popup of successful push
      notifyPush(orderId, matchedItems.length, unmatchedItems.length);

    } catch (e) {
      err('Push error for order', orderId, ':', e.message);
    }
  }

  // ── Extract items from Swiggy order object ─────────────────────
  function extractItems(order) {
    const items = [];

    // Try various structures Swiggy might use
    const itemArrays = [
      order.items,
      order.order_items,
      order.orderItems,
      order.kot_items,
      order.kotItems,
    ];

    for (const arr of itemArrays) {
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const name = item.name || item.itemName || item.item_name || item.product_name || '';
          const qty = item.quantity || item.qty || item.count || 1;
          if (name) items.push({ name, quantity: qty });
        }
        if (items.length > 0) return items;
      }
    }

    // Try nested KOT structure
    if (order.kots || order.KOTs) {
      const kots = order.kots || order.KOTs;
      if (Array.isArray(kots)) {
        for (const kot of kots) {
          const kotItems = kot.items || kot.kotItems || [];
          for (const item of kotItems) {
            const name = item.name || item.itemName || item.item_name || '';
            const qty = item.quantity || item.qty || 1;
            if (name) items.push({ name, quantity: qty });
          }
        }
      }
    }

    return items;
  }

  // ── Notify popup of push events ────────────────────────────────
  function notifyPush(orderId, matchedCount, unmatchedCount) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'ORDER_PUSHED',
        orderId,
        matchedCount,
        unmatchedCount,
        timestamp: Date.now(),
      }).catch(() => {});
    }
  }

  // ── Install fetch interceptor ──────────────────────────────────
  function installInterceptor() {
    if (interceptorInstalled) return;
    interceptorInstalled = true;

    // Inject a script into the page context to intercept fetch
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        const _origFetch = window.fetch;
        window.fetch = async function(...args) {
          const response = await _origFetch.apply(this, args);
          try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            if (url.includes('${GRAPHQL_URL}')) {
              const clone = response.clone();
              clone.json().then(data => {
                window.postMessage({
                  type: '__HE_SWIGGY_RESPONSE__',
                  url: url,
                  data: data,
                }, '*');
              }).catch(() => {});
            }
          } catch(e) {}
          return response;
        };
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    log('Fetch interceptor installed');
  }

  // ── Listen for intercepted responses ───────────────────────────
  window.addEventListener('message', async (event) => {
    if (event.data?.type !== '__HE_SWIGGY_RESPONSE__') return;
    if (!config.enabled || !config.apiKey) return;

    const data = event.data.data;
    if (!data) return;

    // Look for order data in the GraphQL response
    const orders = findOrders(data);
    if (orders.length === 0) return;

    log('Detected', orders.length, 'order(s) in Swiggy response');

    for (const order of orders) {
      const orderId = String(order.order_id || order.orderId || '');
      if (!orderId || pushedOrderIds.has(orderId)) continue;

      // Only push orders that are in "preparing" or "confirmed" state
      const status = (order.status || order.order_status || '').toLowerCase();
      if (status && !['preparing', 'confirmed', 'food_ready', 'accepted'].includes(status)) {
        continue;
      }

      await pushOrder(order);
    }
  });

  // ── Find orders in GraphQL response (recursive search) ─────────
  function findOrders(obj, depth = 0) {
    if (depth > 8 || !obj || typeof obj !== 'object') return [];
    const results = [];

    // Check if this object looks like an order
    if (hasOrderShape(obj)) {
      results.push(obj);
      return results; // Don't recurse into orders
    }

    // Check arrays
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (hasOrderShape(item)) {
          results.push(item);
        } else {
          results.push(...findOrders(item, depth + 1));
        }
      }
      return results;
    }

    // Check object values
    for (const key of Object.keys(obj)) {
      // Skip large irrelevant objects
      if (['extensions', 'errors', '__typename'].includes(key)) continue;

      const val = obj[key];
      if (Array.isArray(val) && val.length > 0 && hasOrderShape(val[0])) {
        for (const item of val) {
          if (hasOrderShape(item)) results.push(item);
        }
      } else {
        results.push(...findOrders(val, depth + 1));
      }
    }

    return results;
  }

  // ── Check if an object looks like a Swiggy order ───────────────
  function hasOrderShape(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    // Must have an order_id or orderId
    const hasId = obj.order_id || obj.orderId || obj.id;
    // Must have items in some form
    const hasItems = obj.items || obj.order_items || obj.orderItems ||
                     obj.kots || obj.KOTs || obj.kot_items;
    // Must have either a customer name or a status
    const hasContext = obj.customer_name || obj.customerName ||
                       obj.status || obj.order_status ||
                       obj.placed_time || obj.placedTime;
    return !!(hasId && hasItems && hasContext);
  }

  // ── Listen for config changes from popup ───────────────────────
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'CONFIG_UPDATE') {
        config.apiKey = msg.apiKey || '';
        config.enabled = msg.enabled !== false;
        log('Config updated. Enabled:', config.enabled);
        if (config.enabled && config.apiKey) {
          loadOdooProducts();
        }
        sendResponse({ ok: true });
      }
      if (msg.type === 'GET_STATUS') {
        sendResponse({
          enabled: config.enabled,
          connected: !!config.apiKey,
          productsLoaded: odooProducts.length,
          pushedCount: pushedOrderIds.size,
          interceptorActive: interceptorInstalled,
        });
      }
      if (msg.type === 'CLEAR_PUSHED') {
        pushedOrderIds.clear();
        savePushedOrders();
        sendResponse({ ok: true });
      }
      return true; // async response
    });
  }

  // ── Badge indicator on the page ────────────────────────────────
  function createIndicator() {
    const div = document.createElement('div');
    div.id = 'he-autopush-indicator';
    div.style.cssText = `
      position: fixed; bottom: 12px; right: 12px; z-index: 99999;
      background: #1a2234; border: 1px solid #2d3a4f; border-radius: 8px;
      padding: 6px 12px; font-size: 11px; font-family: monospace;
      color: #94a3b8; display: flex; align-items: center; gap: 6px;
      cursor: pointer; user-select: none; transition: all .2s;
    `;
    div.innerHTML = '<span id="he-dot" style="width:7px;height:7px;border-radius:50%;background:#ef4444;"></span> HE AutoPush';
    div.addEventListener('click', () => {
      config.enabled = !config.enabled;
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ enabled: config.enabled });
      }
      updateIndicator();
    });
    document.body.appendChild(div);
    updateIndicator();
  }

  function updateIndicator() {
    const dot = document.getElementById('he-dot');
    const ind = document.getElementById('he-autopush-indicator');
    if (!dot || !ind) return;
    if (config.enabled && config.apiKey) {
      dot.style.background = '#22c55e';
      dot.style.animation = 'pulse 2s infinite';
      ind.style.borderColor = '#22c55e33';
    } else {
      dot.style.background = '#ef4444';
      dot.style.animation = 'none';
      ind.style.borderColor = '#2d3a4f';
    }
  }

  // Inject pulse animation
  const style = document.createElement('style');
  style.textContent = '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}';
  document.head.appendChild(style);

  // ── Initialize ─────────────────────────────────────────────────
  async function init() {
    log('Initializing on', window.location.href);
    await loadConfig();
    installInterceptor();
    createIndicator();

    if (config.apiKey && config.enabled) {
      await loadOdooProducts();
      log('Ready. Products:', odooProducts.length, 'Previously pushed:', pushedOrderIds.size);
    } else if (!config.apiKey) {
      log('No API key configured. Open extension popup to set up.');
    }
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
