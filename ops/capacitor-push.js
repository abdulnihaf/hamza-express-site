// ═══════════════════════════════════════════════════════════════════
// Capacitor Native Push Bridge
// Detects if running in Capacitor, uses native FCM push instead of Web Push
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // Detect if running inside Capacitor native app
  function isCapacitor() {
    return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  }

  // Wait for Capacitor plugins to be ready
  async function initNativePush(apiBase, token, appName) {
    if (!isCapacitor()) return null;

    try {
      const { PushNotifications } = window.Capacitor.Plugins;
      if (!PushNotifications) {
        console.warn('PushNotifications plugin not available');
        return null;
      }

      // Request permission
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        console.warn('Push permission not granted:', permResult.receive);
        return null;
      }

      // Register for push
      await PushNotifications.register();

      // Listen for FCM token
      return new Promise((resolve) => {
        PushNotifications.addListener('registration', async (fcmToken) => {
          console.log('FCM token received:', fcmToken.value.substring(0, 20) + '...');

          // Send FCM token to server (different from Web Push subscription)
          try {
            await fetch(`${apiBase}?action=floor-push-subscribe`, {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                fcm_token: fcmToken.value,
                platform: 'native'
              })
            });
            console.log('FCM token registered on server');
          } catch (e) {
            console.error('Failed to register FCM token:', e);
          }

          resolve(fcmToken.value);
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.error('FCM registration error:', err);
          resolve(null);
        });

        // Handle notification received while app is in foreground
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push received in foreground:', notification);
          // The notification is shown automatically by the system
          // We could also trigger an in-app alert here
        });

        // Handle notification tap
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('Push notification tapped:', action);
          // Navigate to appropriate screen based on notification data
          const data = action.notification?.data;
          if (data?.url) {
            window.location.href = data.url;
          }
        });
      });
    } catch (e) {
      console.error('Native push init failed:', e);
      return null;
    }
  }

  // Expose globally
  window.CapacitorPush = {
    isCapacitor,
    initNativePush
  };
})();
