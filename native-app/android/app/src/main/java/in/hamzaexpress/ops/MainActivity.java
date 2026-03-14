package in.hamzaexpress.ops;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "HEMain";
    private static final int NOTIFICATION_PERMISSION_CODE = 1001;
    private static final String PREFS_NAME = "he_ops_prefs";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        requestAllPermissions();
        setupBackNavigation();

        // Delay bridge injection slightly to ensure WebView is fully ready
        getBridge().getWebView().post(() -> {
            exposeJsBridge();
            getFcmTokenAndInject();
        });
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmSound == null) {
                alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build();

            NotificationChannel orderChannel = new NotificationChannel(
                    "he_orders",
                    "Order Alerts",
                    NotificationManager.IMPORTANCE_HIGH
            );
            orderChannel.setDescription("New order assignments, items ready, table alerts");
            orderChannel.setSound(alarmSound, audioAttributes);
            orderChannel.enableVibration(true);
            orderChannel.setVibrationPattern(new long[]{
                    0, 1000, 300, 1000, 300, 1000, 300, 1000, 300,
                    1000, 300, 1000, 300, 1000, 300, 1000, 300, 1000, 300, 1000
            });
            orderChannel.setBypassDnd(true);
            orderChannel.enableLights(true);
            orderChannel.setLightColor(0xFFD4A44C);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(orderChannel);
            }
        }
    }

    private void requestAllPermissions() {
        // 1. Request POST_NOTIFICATIONS permission (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                        NOTIFICATION_PERMISSION_CODE);
            }
        }

        // 2. Request battery optimization exemption
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            }
        }
    }

    /**
     * Handle Android back button — navigate back in WebView history.
     * If no history, go to ops hub. If already at hub, minimize app.
     */
    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    // Check if we're on the hub — if so, minimize to home
                    String url = webView != null ? webView.getUrl() : "";
                    if (url != null && (url.endsWith("/ops/") || url.endsWith("/ops"))) {
                        moveTaskToBack(true);
                    } else {
                        // Navigate to hub
                        if (webView != null) {
                            webView.loadUrl("https://hamzaexpress.in/ops/");
                        }
                    }
                }
            }
        });
    }

    private void getFcmTokenAndInject() {
        FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) {
                        Log.w(TAG, "FCM token fetch failed", task.getException());
                        return;
                    }
                    String token = task.getResult();
                    Log.d(TAG, "FCM Token: " + token);

                    // Store in SharedPreferences for the MessagingService
                    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                    prefs.edit().putString("fcm_token", token).apply();

                    // Inject into WebView so web app can send it to the server
                    runOnUiThread(() -> {
                        WebView webView = getBridge().getWebView();
                        if (webView != null) {
                            webView.evaluateJavascript(
                                    "window.nativeFcmToken = '" + token + "';" +
                                    "window.dispatchEvent(new CustomEvent('fcmTokenReady', { detail: '" + token + "' }));",
                                    null
                            );
                        }
                    });
                });
    }

    /**
     * Expose a JS bridge so the web app can store auth info back to native SharedPreferences.
     * This allows the FirebaseMessagingService to send token refreshes to the server.
     */
    private void exposeJsBridge() {
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.addJavascriptInterface(new HEJsBridge(), "HENative");
            Log.d(TAG, "HENative JS bridge injected");
        } else {
            Log.w(TAG, "WebView not ready for JS bridge injection");
        }
    }

    /**
     * JavaScript bridge — callable from web as HENative.setAuthInfo(token, staffId)
     */
    public class HEJsBridge {
        @JavascriptInterface
        public void setAuthInfo(String authToken, String staffId) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit()
                    .putString("auth_token", authToken)
                    .putString("staff_id", staffId)
                    .apply();
            Log.d(TAG, "Auth info saved for staff: " + staffId);
        }

        @JavascriptInterface
        public String getFcmToken() {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return prefs.getString("fcm_token", "");
        }
    }
}
