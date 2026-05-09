#!/bin/bash
# Register HE phone number to WhatsApp Cloud API
# Run this script after the 72-hour rate limit expires (~Feb 18, 2026 22:00 IST)
#
# What this does:
# - Registers phone +91 80080 02045 (ID: 987158291152067) to Cloud API
# - Sets 2-step verification PIN: 191800
# - Transitions status: PENDING → CONNECTED, platform_type: NOT_APPLICABLE → CLOUD_API
#
# Usage: bash scripts/register-waba-phone.sh

ACCESS_TOKEN="EAAdjKyLVeusBQRF4VKXU2spFCAelf2s5091YDWhM1O1G2DcXwO9URM6ZCQmDJIjSDltSHu0wDz8nksmz9OXeuWhn13xCsnZBU9BKNIvHtufaveIMgefXwbW2RuhZCYcBv1ChzZBzaQDPt5VB3FELHgmJ6Cu6ZCx6gU68zbZA4yff3mDJYAqXpbJayZCvY0vAQZDZD"
PHONE_ID="987158291152067"
PIN="191800"

echo "=== HE WABA Phone Registration ==="
echo "Phone ID: $PHONE_ID"
echo "PIN: $PIN"
echo ""

# Step 1: Check current status
echo "--- Current Phone Status ---"
curl -s "https://graph.facebook.com/v21.0/$PHONE_ID?fields=display_phone_number,status,platform_type,name_status,is_pin_enabled,verified_name" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool
echo ""

# Step 2: Attempt registration
echo "--- Attempting Registration ---"
RESULT=$(curl -s -X POST "https://graph.facebook.com/v21.0/$PHONE_ID/register" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"messaging_product\": \"whatsapp\", \"pin\": \"$PIN\"}")
echo "$RESULT" | python3 -m json.tool
echo ""

# Check if successful
if echo "$RESULT" | grep -q '"success":true'; then
  echo "✅ REGISTRATION SUCCESSFUL!"
  echo ""

  # Step 3: Verify new status
  echo "--- Updated Phone Status ---"
  curl -s "https://graph.facebook.com/v21.0/$PHONE_ID?fields=display_phone_number,status,platform_type,name_status,is_pin_enabled,verified_name" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool
  echo ""

  # Step 4: Check WABA status
  echo "--- WABA Account Status ---"
  curl -s "https://graph.facebook.com/v21.0/1803726526967696?fields=name,account_review_status" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool
  echo ""

  # Step 5: Set override callback URI for webhook routing
  echo "--- Setting Webhook Override ---"
  curl -s -X POST "https://graph.facebook.com/v21.0/1803726526967696/subscribed_apps" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"override_callback_uri": "https://hamzaexpress.in/api/whatsapp"}' | python3 -m json.tool

  echo ""
  echo "🎉 Done! Phone should now be CONNECTED with platform_type CLOUD_API."
  echo "Next: Send a test message to +91 80080 02045 on WhatsApp to verify."
elif echo "$RESULT" | grep -q '133016'; then
  echo "⏳ STILL RATE LIMITED. Wait longer and try again."
  echo "The 72-hour window from Feb 15 expires around Feb 18 22:00 IST."
else
  echo "❌ Registration failed with unexpected error. Check the response above."
fi
