// Redirect hamzaexpress.in/go/maps → Google Maps app (deep link)
// Uses geo: URI scheme which opens the native maps app on both iOS and Android

export async function onRequest() {
  // Google Maps universal link — opens app on mobile, web on desktop
  const mapsUrl = 'https://www.google.com/maps/place/Hamza+Express/@12.9868521,77.6018339,17z/data=!3m1!4b1!4m6!3m5!1s0x3bae1771b42304f9:0xb86ab64920519df9!8m2!3d12.9868469!4d77.6044088!16s%2Fg%2F11z0yk3x5g';
  return Response.redirect(mapsUrl, 302);
}
