-- Add FCM token column for native Capacitor push notifications
ALTER TABLE floor_staff ADD COLUMN fcm_token TEXT;
