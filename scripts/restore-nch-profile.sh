#!/bin/bash
# Restore NCH Business Profile on phone +91 80080 02049
# Run this AFTER HE WABA is approved and HE gets its own phone number
#
# What this does:
# - Restores NCH business profile (about, address, description, email, websites)
# - Profile picture must be re-uploaded separately (requires resumable upload API)
#
# Usage: ACCESS_TOKEN=your_token bash scripts/restore-nch-profile.sh

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Set ACCESS_TOKEN env var first"
  echo "   ACCESS_TOKEN=EAAdjK... bash scripts/restore-nch-profile.sh"
  exit 1
fi

PHONE_ID="970365416152029"

echo "=== Restoring NCH Business Profile ==="
echo "Phone: +91 80080 02049 (ID: $PHONE_ID)"
echo ""

# Restore business profile
RESULT=$(curl -s -X POST "https://graph.facebook.com/v21.0/$PHONE_ID/whatsapp_business_profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "about": "Authentic Irani Chai ☕ HKP Road Delivery ~5 min",
    "address": "HKP Road, Shivajinagar, Bangalore 560051",
    "description": "Nawabi Chai House — Authentic Irani Chai & Snacks by HN Hotels (Est. 1918).\n\n☕ Irani Chai • Bun Maska • Osmania Biscuits • Chicken Cutlet\n\n📍 HKP Road delivery in ~5 minutes\n🎁 First 2 Irani Chai FREE for new customers!\n\nOrder right here on WhatsApp — just say Hi!",
    "email": "nawabichaihouse@gmail.com",
    "websites": ["https://nawabichaihouse.com/"],
    "vertical": "RESTAURANT"
  }')

echo "$RESULT" | python3 -m json.tool
echo ""

if echo "$RESULT" | grep -q '"success":true'; then
  echo "✅ NCH profile restored!"
  echo ""
  echo "⚠️  MANUAL STEPS NEEDED:"
  echo "1. Re-upload NCH profile picture via WhatsApp Business Manager"
  echo "2. Update webhook override_callback_uri back to nawabichaihouse.com"
  echo "3. Update WA_PHONE_ID in NCH Cloudflare worker if needed"
else
  echo "❌ Profile restore failed. Check the error above."
fi
