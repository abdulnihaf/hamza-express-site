#!/usr/bin/env python3
"""Generate QR codes pointing to hamzaexpress.in/go/{slug} redirects.
QR codes are permanent — changing the prefill text in the admin dashboard
automatically updates where the QR leads without regenerating the image."""

import qrcode
import os

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'public', 'qr')
os.makedirs(OUTPUT_DIR, exist_ok=True)

BASE = 'https://hamzaexpress.in/go'

# Only physical sources need QR codes — the rest use the link directly
PHYSICAL_QR = {
    'packaging': 'Swiggy/Zomato Packaging QR',
    'outlet': 'Outlet Table Tent / Standee',
    'flyer': 'Print Card / Flyer',
}

# Generate all slugs for reference/testing
ALL_SLUGS = [
    'google', 'website', 'instagram', 'facebook', 'google-post',
    'packaging', 'outlet', 'flyer', 'wa-status',
    'meta-ad', 'meta-offer', 'google-ad', 'broadcast', 'win-back', 'influencer'
]

print("Generating QR codes for PHYSICAL sources (packaging, outlet, flyer)...\n")

for slug in ALL_SLUGS:
    url = f"{BASE}/{slug}"
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=12, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color='#1a1a2e', back_color='white')
    filepath = os.path.join(OUTPUT_DIR, f'{slug}.png')
    img.save(filepath)

    is_physical = slug in PHYSICAL_QR
    marker = " [PRINT THIS]" if is_physical else ""
    print(f"  {slug}.png → {url}{marker}")

print(f"\nAll QR codes saved to: {OUTPUT_DIR}")
print(f"\nPhysical QR codes to print: packaging.png, outlet.png, flyer.png")
print(f"All others are for testing only — use the LINK (hamzaexpress.in/go/{{slug}}) on platforms")
