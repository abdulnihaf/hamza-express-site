package in.hamzaexpress.ops;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Use the device's default alarm ringtone for maximum attention
            Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmSound == null) {
                alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build();

            // Main order notification channel — alarm priority
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
            orderChannel.setLightColor(0xFFD4A44C); // golden-amber

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(orderChannel);
            }
        }
    }
}
