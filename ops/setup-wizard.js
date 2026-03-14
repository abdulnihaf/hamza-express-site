// ═══════════════════════════════════════════════════════════════════
// HE Setup Wizard — Auto-permission + device-specific setup guide
// Shared across waiter, captain, cleaner PWAs
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // ── Platform & device detection ──
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isAndroid() { return /Android/i.test(navigator.userAgent); }
  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

  function detectDevice() {
    const ua = navigator.userAgent;
    if (isIOS()) return 'ios';
    if (/Xiaomi|Redmi|POCO|MIUI|Mi /i.test(ua)) return 'xiaomi';
    if (/vivo/i.test(ua)) return 'vivo';
    if (/Samsung|SM-/i.test(ua)) return 'samsung';
    if (/OPPO|CPH/i.test(ua)) return 'oppo';
    if (/RMX|Realme/i.test(ua)) return 'realme';
    if (/OnePlus|IN20|KB20/i.test(ua)) return 'oneplus';
    if (/Huawei|Honor|HUAWEI/i.test(ua)) return 'huawei';
    return 'android';
  }

  function detectModel() {
    const ua = navigator.userAgent;
    // Extract model from "Build/..." or known patterns
    let m;
    // Redmi: "Redmi Note 13" etc
    m = ua.match(/(Redmi\s*\w[\w\s]*?)(?:\s*Build|[;)])/i);
    if (m) return m[1].trim();
    // Vivo: "vivo Y300" etc (also V2338 style codes)
    m = ua.match(/(vivo\s*[\w\d]+[\w\d\s]*?)(?:\s*Build|[;)])/i);
    if (m) return m[1].trim();
    // POCO
    m = ua.match(/(POCO\s*[\w\d]+[\w\d\s]*?)(?:\s*Build|[;)])/i);
    if (m) return m[1].trim();
    // Samsung SM-XXXX
    m = ua.match(/(SM-[\w\d]+)/i);
    if (m) return 'Samsung ' + m[1];
    // OnePlus
    m = ua.match(/((?:OnePlus|IN\d{4}|KB\d{4})[\w]*)/i);
    if (m) return m[1].trim();
    // OPPO CPH
    m = ua.match(/(CPH[\d]+)/i);
    if (m) return 'OPPO ' + m[1];
    // Realme RMX
    m = ua.match(/(RMX[\d]+)/i);
    if (m) return 'Realme ' + m[1];
    // Generic: try to grab model before "Build/"
    m = ua.match(/;\s*([\w][\w\s\-\+\.]+?)\s*Build\//);
    if (m) return m[1].trim();
    return null;
  }

  const DEVICE_NAMES = {
    ios: 'iPhone', xiaomi: 'Xiaomi / Redmi', vivo: 'Vivo', samsung: 'Samsung',
    oppo: 'OPPO', realme: 'Realme', oneplus: 'OnePlus',
    huawei: 'Huawei', android: 'Android'
  };

  // ── Device-specific manual steps ──
  // Each returns array of { title, steps[], skip? }
  function getManualSteps(device) {
    const steps = [];

    // iOS: completely different flow — no battery/autostart, but needs PWA install
    if (device === 'ios') {
      if (!isStandalone()) {
        steps.push({
          id: 'ios_install', icon: '\u{1F4F2}', title: 'Install as App',
          steps: [
            'Tap the <b>Share button</b> (box with arrow) at the bottom of Safari',
            'Scroll down and tap <b>"Add to Home Screen"</b>',
            'Tap <b>"Add"</b> in the top right',
            'Open the app from your <b>Home Screen</b>',
            'Log in again — push notifications only work from the installed app'
          ]
        });
      }
      steps.push({
        id: 'ios_focus', icon: '\u{1F515}', title: 'Check Focus / Do Not Disturb',
        steps: [
          'Open <b>Settings</b> → <b>Focus</b>',
          'If any Focus mode is active, tap it',
          'Make sure <b>Safari</b> or this app is in the <b>Allowed Apps</b> list',
          'Or turn off Focus mode during shifts'
        ]
      });
      return steps;
    }

    // Use app name based on whether running in native app or Chrome
    const appLabel = isNativeApp() ? 'Hamza Express Ops' : 'Chrome';

    // Step: Battery optimization
    const battery = { id: 'battery', icon: '\u{1F50B}', title: 'Disable Battery Optimization', steps: [] };
    switch (device) {
      case 'xiaomi':
        battery.steps = [
          'Open <b>Settings</b>',
          'Tap <b>Apps</b> → <b>Manage apps</b>',
          'Find and tap <b>' + appLabel + '</b>',
          'Tap <b>Battery saver</b>',
          'Select <b>"No restrictions"</b>'
        ];
        break;
      case 'vivo':
        battery.steps = [
          'Open <b>Settings</b>',
          'Tap <b>Battery</b>',
          'Tap <b>Background power consumption</b>',
          'Find <b>' + appLabel + '</b> and set to <b>"Allow"</b>'
        ];
        break;
      case 'samsung':
        battery.steps = [
          'Open <b>Settings</b> → <b>Apps</b>',
          'Find and tap <b>' + appLabel + '</b>',
          'Tap <b>Battery</b>',
          'Select <b>"Unrestricted"</b>'
        ];
        break;
      case 'oppo': case 'realme':
        battery.steps = [
          'Open <b>Settings</b> → <b>Battery</b>',
          'Tap <b>More battery settings</b>',
          'Tap <b>Optimize battery use</b>',
          'Find <b>' + appLabel + '</b> → <b>"Don\'t optimize"</b>'
        ];
        break;
      case 'oneplus':
        battery.steps = [
          'Open <b>Settings</b> → <b>Battery</b>',
          'Tap <b>Battery optimization</b>',
          'Switch to <b>"All apps"</b>',
          'Find <b>' + appLabel + '</b> → <b>"Don\'t optimize"</b>'
        ];
        break;
      case 'huawei':
        battery.steps = [
          'Open <b>Settings</b> → <b>Battery</b>',
          'Tap <b>App launch</b>',
          'Find <b>' + appLabel + '</b>, turn off auto management',
          'Enable ALL three toggles: <b>Auto-launch, Secondary launch, Run in background</b>'
        ];
        break;
      default:
        battery.steps = [
          'Open <b>Settings</b> → <b>Apps</b>',
          'Find and tap <b>' + appLabel + '</b>',
          'Tap <b>Battery</b>',
          'Select <b>"Unrestricted"</b> or <b>"No restrictions"</b>'
        ];
    }
    steps.push(battery);

    // Step: Autostart (only for brands that need it)
    if (['xiaomi', 'vivo', 'oppo', 'realme', 'huawei'].includes(device)) {
      const autostart = { id: 'autostart', icon: '\u{1F680}', title: 'Enable Autostart', steps: [] };
      switch (device) {
        case 'xiaomi':
          autostart.steps = [
            'Open <b>Settings</b> → <b>Apps</b>',
            'Tap <b>Permissions</b> → <b>Autostart</b>',
            'Find <b>' + appLabel + '</b> and toggle <b>ON</b>'
          ];
          break;
        case 'vivo':
          autostart.steps = [
            'Open <b>Settings</b>',
            'Tap <b>Apps & Permissions</b>',
            'Tap <b>Autostart Manager</b>',
            'Enable <b>' + appLabel + '</b>'
          ];
          break;
        case 'oppo': case 'realme':
          autostart.steps = [
            'Open <b>Settings</b> → <b>App Management</b>',
            'Find <b>' + appLabel + '</b>, tap it',
            'Enable <b>"Allow auto-launch"</b>'
          ];
          break;
        case 'huawei':
          autostart.steps = [
            'Already covered in Battery step above',
            'Confirm <b>Auto-launch</b> toggle is ON for ' + appLabel
          ];
          break;
      }
      steps.push(autostart);
    }

    // Step: Pause app activity
    const pause = {
      id: 'pause', icon: '\u23F8\uFE0F', title: 'Disable "Pause App Activity"',
      steps: [
        'Open <b>Settings</b> → <b>Apps</b> → <b>Manage Apps</b>',
        'Find and tap <b>' + appLabel + '</b>',
        'Turn <b>OFF</b> "Pause app activity if unused"'
      ]
    };
    steps.push(pause);

    // Step: Set notification sound to alarm/ringtone
    // In native app, notification sound is set via the Android channel — skip this step
    if (!isNativeApp()) {
      const notifSound = { id: 'notif_sound', icon: '\u{1F50A}', title: 'Set Alarm Ringtone for Notifications', steps: [] };
      switch (device) {
        case 'xiaomi':
          notifSound.steps = [
            'Open <b>Settings</b> → <b>Apps</b> → <b>Manage apps</b>',
            'Find and tap <b>Chrome</b>',
            'Tap <b>Notifications</b>',
            'Find <b>hamzaexpress.in</b> (or "HE ' + (config.appName || 'App') + '")',
            'Tap it → tap <b>Sound</b>',
            'Pick a <b>loud ringtone</b> (e.g. "Alarm" or "Ring") — NOT "Default"',
            'Also set <b>Importance</b> to <b>Urgent</b>'
          ];
          break;
        case 'vivo':
          notifSound.steps = [
            'Open <b>Settings</b> → <b>Notifications & Status Bar</b>',
            'Tap <b>App Notifications</b> → find <b>Chrome</b>',
            'Tap <b>Chrome</b> → find <b>hamzaexpress.in</b> channel',
            'Tap it → tap <b>Sound</b>',
            'Pick a <b>loud alarm tone</b> — something that sounds like a phone ringing',
            'Set <b>Importance</b> to <b>Urgent</b>'
          ];
          break;
        case 'samsung':
          notifSound.steps = [
            'Open <b>Settings</b> → <b>Apps</b> → <b>Chrome</b>',
            'Tap <b>Notifications</b>',
            'Find the <b>hamzaexpress.in</b> notification channel',
            'Tap it → tap <b>Sound</b>',
            'Pick a <b>loud alarm/ringtone</b>',
            'Set to <b>Alert</b> (not Silent)'
          ];
          break;
        default:
          notifSound.steps = [
            'Open <b>Settings</b> → <b>Apps</b> → <b>Chrome</b>',
            'Tap <b>Notifications</b>',
            'Find <b>hamzaexpress.in</b> notification channel',
            'Tap it → change <b>Sound</b> to a <b>loud alarm/ringtone</b>',
            'Set <b>Importance</b> to <b>Urgent</b>'
          ];
      }
      steps.push(notifSound);
    }

    // Step: Lock in recents (not needed for native app — FCM delivers even when app is killed)
    if (!isNativeApp()) {
      const lock = {
        id: 'lock_recents', icon: '\u{1F512}', title: 'Lock Chrome in Recent Apps',
        steps: [
          'Open Chrome with this app',
          'Swipe up to see <b>Recent Apps</b>',
          device === 'xiaomi' ? 'Long-press the Chrome card → tap the <b>lock icon</b>' :
          device === 'vivo' ? 'Pull <b>down</b> on the Chrome card to lock it' :
          'Long-press Chrome card → tap <b>Lock</b> or the lock icon'
        ]
      };
      steps.push(lock);
    }

    return steps;
  }

  // ── Inject CSS ──
  function injectStyles() {
    if (document.getElementById('sw-styles')) return;
    const style = document.createElement('style');
    style.id = 'sw-styles';
    style.textContent = `
      .sw-overlay{position:fixed;inset:0;z-index:9999;background:var(--bg,#0a0f1a);display:flex;flex-direction:column;overflow:hidden}
      .sw-progress{height:4px;background:var(--border,#2d3a4f);flex-shrink:0}
      .sw-progress-bar{height:100%;background:var(--green,#22c55e);transition:width .4s ease}
      .sw-header{padding:16px 20px 8px;flex-shrink:0;display:flex;justify-content:space-between;align-items:center}
      .sw-header-text{font-size:13px;color:var(--text2,#94a3b8);font-weight:500}
      .sw-skip-all{font-size:13px;color:var(--text2,#94a3b8);cursor:pointer;text-decoration:underline;background:none;border:none;font-family:inherit}
      .sw-body{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
      .sw-icon{font-size:64px;margin-bottom:20px;line-height:1}
      .sw-title{font-size:22px;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:10px}
      .sw-desc{font-size:14px;color:var(--text2,#94a3b8);margin-bottom:24px;line-height:1.6;max-width:340px}
      .sw-device-tag{display:inline-block;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;background:var(--blue-dim,rgba(59,130,246,.12));color:var(--blue,#3b82f6);margin-bottom:16px;letter-spacing:.3px}
      .sw-steps-list{text-align:left;max-width:320px;width:100%;margin:0 auto 24px}
      .sw-step-item{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border,#2d3a4f);font-size:14px;color:var(--text,#f1f5f9);line-height:1.5}
      .sw-step-item:last-child{border-bottom:none}
      .sw-step-num{width:24px;height:24px;border-radius:50%;background:var(--border,#2d3a4f);color:var(--text2,#94a3b8);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
      .sw-footer{padding:16px 20px 24px;flex-shrink:0}
      .sw-btn{width:100%;padding:16px;border:none;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s}
      .sw-btn:active{transform:scale(.97);opacity:.85}
      .sw-btn-primary{background:var(--green,#22c55e);color:#000}
      .sw-btn-skip{background:none;border:none;color:var(--text2,#94a3b8);font-size:13px;cursor:pointer;padding:12px;width:100%;text-align:center;font-family:inherit}
      .sw-btn-skip:active{color:var(--text,#f1f5f9)}
      .sw-spinner{width:32px;height:32px;border:3px solid var(--border,#2d3a4f);border-top-color:var(--green,#22c55e);border-radius:50%;animation:sw-spin .8s linear infinite;margin:0 auto 16px}
      @keyframes sw-spin{to{transform:rotate(360deg)}}
      .sw-check{color:var(--green,#22c55e);font-size:64px;margin-bottom:16px;line-height:1}
      .sw-fail{color:var(--red,#ef4444);font-size:64px;margin-bottom:16px;line-height:1}
      .sw-auto-items{max-width:320px;width:100%;margin-bottom:24px}
      .sw-auto-item{display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--card,#1a2234);border:1px solid var(--border,#2d3a4f);border-radius:10px;margin-bottom:8px}
      .sw-auto-item .label{font-size:14px;color:var(--text,#f1f5f9)}
      .sw-auto-item .status{font-size:13px;font-weight:600}
      .sw-auto-item .status.ok{color:var(--green,#22c55e)}
      .sw-auto-item .status.wait{color:var(--text2,#94a3b8)}
      .sw-auto-item .status.fail{color:var(--red,#ef4444)}
    `;
    document.head.appendChild(style);
  }

  // ── Main wizard logic ──
  let overlay = null;
  let config = null;
  let device = null;
  let model = null;
  let manualSteps = [];
  let currentManualStep = 0;
  let autoResults = { notification: false, sw: false, push: false };

  function createOverlay() {
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.className = 'sw-overlay';
    document.body.appendChild(overlay);
    return overlay;
  }

  function render(html) {
    overlay.innerHTML = html;
  }

  function totalSteps() {
    return 1 + manualSteps.length + 1; // auto phase + manual steps + test
  }

  function progressPercent(step) {
    return Math.round((step / totalSteps()) * 100);
  }

  // ── Detect native app (Capacitor shell with HENative JS bridge) ──
  function isNativeApp() {
    return !!(window.HENative || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
  }

  // ── Phase 1: Auto permissions ──
  async function runAutoPhase() {
    render(`
      <div class="sw-progress"><div class="sw-progress-bar" style="width:5%"></div></div>
      <div class="sw-header">
        <span class="sw-header-text">Setting up permissions...</span>
        <button class="sw-skip-all" onclick="SetupWizard._skipAll()">Skip all</button>
      </div>
      <div class="sw-body">
        <div class="sw-icon">\u{1F50D}</div>
        <div class="sw-title">Checking Permissions</div>
        <div class="sw-device-tag">${model || DEVICE_NAMES[device] || 'Android'} detected</div>
        <div class="sw-auto-items">
          <div class="sw-auto-item"><span class="label">\u{1F514} Notifications</span><span class="status wait" id="sw-s1">Checking...</span></div>
          <div class="sw-auto-item"><span class="label">\u2699\uFE0F Background Service</span><span class="status wait" id="sw-s2">Checking...</span></div>
          <div class="sw-auto-item"><span class="label">\u{1F517} Push Subscription</span><span class="status wait" id="sw-s3">Checking...</span></div>
        </div>
        <div class="sw-spinner"></div>
        <div class="sw-desc" id="sw-auto-status">Requesting permissions automatically...</div>
      </div>
    `);

    // ── Native app: permissions handled by Android, FCM by MainActivity ──
    if (isNativeApp()) {
      try {
        // Notifications: Android handles this via system permission dialog (already requested in MainActivity)
        // We can't check it from JS — trust that native code requested it
        autoResults.notification = true;
        updateAutoItem('sw-s1', true);

        // Background: FCM delivers even when app is killed — always OK
        autoResults.sw = true;
        updateAutoItem('sw-s2', true);

        // Push: FCM token is injected by native code, setupPush sends it to server
        if (config.setupPush) await config.setupPush();
        const hasFcm = !!(window.nativeFcmToken || (window.HENative && window.HENative.getFcmToken()));
        autoResults.push = hasFcm;
        updateAutoItem('sw-s3', hasFcm);
      } catch (e) {
        console.warn('Native push setup error:', e);
        updateAutoItem('sw-s1', true);
        updateAutoItem('sw-s2', true);
        updateAutoItem('sw-s3', false);
      }

      const el = document.getElementById('sw-auto-status');
      if (el) {
        const allOk = autoResults.notification && autoResults.push;
        el.textContent = allOk ? 'All permissions granted!' : 'Some permissions need attention.';
      }
      await sleep(1200);

      if (!autoResults.notification) {
        await showNotificationDenied();
        return;
      }
      // Native app doesn't need manual Chrome steps — skip to test
      showTestPush();
      return;
    }

    // iOS in Safari (not installed): push won't work — skip auto and go to install step
    if (isIOS() && !isStandalone() && typeof Notification === 'undefined') {
      updateAutoItem('sw-s1', false);
      updateAutoItem('sw-s2', false);
      updateAutoItem('sw-s3', false);
      const el = document.getElementById('sw-auto-status');
      if (el) el.textContent = 'Push notifications require the installed app on iPhone.';
      await sleep(1500);
      if (manualSteps.length > 0) { currentManualStep = 0; showManualStep(); } else { showTestPush(); }
      return;
    }

    // 1. Notification permission
    try {
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          autoResults.notification = true;
        } else if (Notification.permission !== 'denied') {
          const perm = await Notification.requestPermission();
          autoResults.notification = perm === 'granted';
        }
      }
    } catch (e) { /* denied */ }
    updateAutoItem('sw-s1', autoResults.notification);

    // 2. Service Worker
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        autoResults.sw = true;
      }
    } catch (e) { /* failed */ }
    updateAutoItem('sw-s2', autoResults.sw);

    // 3. Push subscription
    try {
      if (autoResults.notification && autoResults.sw && config.setupPush) {
        await config.setupPush();
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        autoResults.push = !!sub;
      }
    } catch (e) { /* failed */ }
    updateAutoItem('sw-s3', autoResults.push);

    // Update status text
    const el = document.getElementById('sw-auto-status');
    if (el) {
      const allOk = autoResults.notification && autoResults.sw && autoResults.push;
      el.textContent = allOk ? 'All automatic permissions granted!' : 'Some permissions need attention.';
    }

    // Brief pause to show results
    await sleep(1200);

    // If notification denied, show manual fix
    if (!autoResults.notification) {
      await showNotificationDenied();
      return;
    }

    // Move to manual steps (or skip to test if none)
    if (manualSteps.length > 0) {
      currentManualStep = 0;
      showManualStep();
    } else {
      showTestPush();
    }
  }

  function updateAutoItem(id, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = ok ? '\u2713 Done' : '\u2717 Failed';
    el.className = 'status ' + (ok ? 'ok' : 'fail');
  }

  // ── Notification denied — manual fix needed ──
  async function showNotificationDenied() {
    render(`
      <div class="sw-progress"><div class="sw-progress-bar" style="width:10%"></div></div>
      <div class="sw-header"><span class="sw-header-text">Notifications blocked</span><button class="sw-skip-all" onclick="SetupWizard._skipAll()">Skip</button></div>
      <div class="sw-body">
        <div class="sw-fail">\u{1F515}</div>
        <div class="sw-title">Notifications are Blocked</div>
        <div class="sw-desc">Your browser blocked notifications. Please enable them manually:</div>
        <div class="sw-steps-list">
          <div class="sw-step-item"><span class="sw-step-num">1</span><span>Tap the <b>lock icon</b> (\u{1F512}) next to the URL in Chrome</span></div>
          <div class="sw-step-item"><span class="sw-step-num">2</span><span>Tap <b>Site settings</b></span></div>
          <div class="sw-step-item"><span class="sw-step-num">3</span><span>Set <b>Notifications</b> to <b>Allow</b></span></div>
          <div class="sw-step-item"><span class="sw-step-num">4</span><span>Come back and tap <b>Retry</b></span></div>
        </div>
      </div>
      <div class="sw-footer">
        <button class="sw-btn sw-btn-primary" onclick="SetupWizard._retryNotification()">Retry</button>
        <button class="sw-btn-skip" onclick="SetupWizard._skipAll()">Skip for now</button>
      </div>
    `);
  }

  // ── Phase 2: Manual device-specific steps ──
  function showManualStep() {
    const step = manualSteps[currentManualStep];
    const stepNum = 2 + currentManualStep; // 1 = auto, then manual, then test
    const pct = progressPercent(stepNum);

    let stepsHtml = step.steps.map((s, i) =>
      `<div class="sw-step-item"><span class="sw-step-num">${i + 1}</span><span>${s}</span></div>`
    ).join('');

    render(`
      <div class="sw-progress"><div class="sw-progress-bar" style="width:${pct}%"></div></div>
      <div class="sw-header">
        <span class="sw-header-text">Step ${stepNum} of ${totalSteps()} \u2022 ${model || DEVICE_NAMES[device]}</span>
        <button class="sw-skip-all" onclick="SetupWizard._skipAll()">Skip all</button>
      </div>
      <div class="sw-body">
        <div class="sw-icon">${step.icon}</div>
        <div class="sw-title">${step.title}</div>
        <div class="sw-device-tag">${model || DEVICE_NAMES[device]}</div>
        <div class="sw-steps-list">${stepsHtml}</div>
      </div>
      <div class="sw-footer">
        <button class="sw-btn sw-btn-primary" onclick="SetupWizard._manualDone()">\u2713 I've Done This</button>
        <button class="sw-btn-skip" onclick="SetupWizard._manualSkip()">Skip this step</button>
      </div>
    `);
  }

  // ── Phase 3: Test push notification ──
  async function showTestPush() {
    const pct = progressPercent(totalSteps());
    render(`
      <div class="sw-progress"><div class="sw-progress-bar" style="width:${pct}%"></div></div>
      <div class="sw-header"><span class="sw-header-text">Final step</span></div>
      <div class="sw-body">
        <div class="sw-icon">\u{1F514}</div>
        <div class="sw-title">Test Notification</div>
        <div class="sw-desc">Let's send a test notification to make sure everything works — even when your phone is locked.</div>
      </div>
      <div class="sw-footer">
        <button class="sw-btn sw-btn-primary" onclick="SetupWizard._sendTest()">Send Test Notification</button>
        <button class="sw-btn-skip" onclick="SetupWizard._finish()">Skip test</button>
      </div>
    `);
  }

  async function sendTestPush() {
    render(`
      <div class="sw-progress"><div class="sw-progress-bar" style="width:95%"></div></div>
      <div class="sw-header"><span class="sw-header-text">Testing...</span></div>
      <div class="sw-body">
        <div class="sw-spinner"></div>
        <div class="sw-title">Sending notification...</div>
        <div class="sw-desc">A notification should appear on your phone.</div>
      </div>
    `);

    try {
      const resp = await fetch(`${config.apiBase}?action=floor-test-push`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + config.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Setup Complete! \u2705',
          body: 'Push notifications are working for ' + (config.appName || 'this app'),
          vibrate: [1000,300,1000,300,1000,300,1000,300,1000,300,1000,300,1000,300,1000,300,1000,300,1000],
          tag: 'setup-test',
          url: window.location.pathname
        })
      });
      const data = await resp.json();

      if (data.ok) {
        showTestResult(true);
      } else {
        showTestResult(false, data.error || 'Push failed');
      }
    } catch (e) {
      showTestResult(false, e.message);
    }
  }

  function showTestResult(success, error) {
    render(`
      <div class="sw-progress"><div class="sw-progress-bar" style="width:100%"></div></div>
      <div class="sw-header"><span class="sw-header-text">${success ? 'All done!' : 'Test result'}</span></div>
      <div class="sw-body">
        <div class="${success ? 'sw-check' : 'sw-fail'}">${success ? '\u2705' : '\u26A0\uFE0F'}</div>
        <div class="sw-title">${success ? 'Notification Sent!' : 'Test Push Failed'}</div>
        <div class="sw-desc">${success
          ? 'Did you see the notification? If yes, everything is working! Try locking your phone — notifications will come through.'
          : 'Error: ' + (error || 'Unknown error') + '. Make sure you completed all the steps above. Try restarting your phone and re-opening the app.'
        }</div>
      </div>
      <div class="sw-footer">
        ${success
          ? `<button class="sw-btn sw-btn-primary" onclick="SetupWizard._finish()">\u{1F389} Start Using App</button>
             <button class="sw-btn-skip" onclick="SetupWizard._sendTest()">Send another test</button>`
          : `<button class="sw-btn sw-btn-primary" onclick="SetupWizard._sendTest()">Retry</button>
             <button class="sw-btn-skip" onclick="SetupWizard._finish()">Continue anyway</button>`
        }
      </div>
    `);
  }

  // ── Completion ──
  function finish() {
    const prefix = config.storagePrefix || 'floor';
    localStorage.setItem(prefix + '_setup_complete', '1');
    localStorage.setItem(prefix + '_setup_done_at', new Date().toISOString());
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function skipAll() {
    const prefix = config.storagePrefix || 'floor';
    localStorage.setItem(prefix + '_setup_skipped_at', new Date().toISOString());
    if (overlay) { overlay.remove(); overlay = null; }
  }

  // ── Helpers ──
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Public API ──
  window.SetupWizard = {
    init: function(cfg) {
      if (!isAndroid() && !isIOS()) {
        // Desktop — push works fine, no setup needed
        return;
      }

      config = cfg;
      device = detectDevice();
      model = detectModel();
      manualSteps = getManualSteps(device);

      const prefix = cfg.storagePrefix || 'floor';

      // Check if critical permissions are missing
      // In native Capacitor app, web Notification API doesn't exist — that's fine, FCM handles it
      const notifOk = isNativeApp() || (typeof Notification !== 'undefined' && Notification.permission === 'granted');
      const complete = localStorage.getItem(prefix + '_setup_complete');
      const skippedAt = localStorage.getItem(prefix + '_setup_skipped_at');

      // Always show if notifications not granted
      if (!notifOk) {
        injectStyles();
        createOverlay();
        runAutoPhase();
        return;
      }

      // Show if never completed
      if (!complete) {
        // But respect skip cooldown (24h)
        if (skippedAt && (Date.now() - new Date(skippedAt).getTime()) < 86400000) return;
        injectStyles();
        createOverlay();
        runAutoPhase();
        return;
      }

      // Already complete + notifications OK — don't show
    },

    forceShow: function(cfg) {
      config = cfg || config;
      if (!config) return;
      device = detectDevice();
      model = detectModel();
      manualSteps = getManualSteps(device);
      injectStyles();
      createOverlay();
      runAutoPhase();
    },

    // Internal callbacks (called from onclick)
    _skipAll: skipAll,
    _finish: finish,
    _manualDone: function() {
      currentManualStep++;
      if (currentManualStep < manualSteps.length) {
        showManualStep();
      } else {
        showTestPush();
      }
    },
    _manualSkip: function() {
      currentManualStep++;
      if (currentManualStep < manualSteps.length) {
        showManualStep();
      } else {
        showTestPush();
      }
    },
    _sendTest: sendTestPush,
    _retryNotification: async function() {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          autoResults.notification = true;
          // Re-run SW + push
          try {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            autoResults.sw = true;
            if (config.setupPush) await config.setupPush();
            const reg = await navigator.serviceWorker.getRegistration('/sw.js');
            const sub = reg ? await reg.pushManager.getSubscription() : null;
            autoResults.push = !!sub;
          } catch (e) {}
          // Move to manual steps
          if (manualSteps.length > 0) {
            currentManualStep = 0;
            showManualStep();
          } else {
            showTestPush();
          }
        } else {
          showNotificationDenied();
        }
      } catch (e) {
        showNotificationDenied();
      }
    }
  };
})();
