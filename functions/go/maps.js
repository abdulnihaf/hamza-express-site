// Redirect hamzaexpress.in/go/maps → Google Maps app (deep link)
// Uses geo: URI scheme which opens the native maps app on both iOS and Android

export async function onRequest() {
  // Google Maps universal link — opens app on mobile, web on desktop
  const mapsUrl = 'https://maps.google.com/?q=Hamza+Express,+151+HKP+Road,+Shivajinagar,+Bangalore&ftid=0x3bae1771b42304f9:0xb86ab64920519df9';
  return Response.redirect(mapsUrl, 302);
}
