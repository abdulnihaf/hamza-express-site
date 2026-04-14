// Google Ads — Create Search Campaign (one-shot endpoint)
// POST /api/google-ads-create
// Creates: Budget → Campaign → 2 Ad Groups → 8 Keywords → 2 RSAs → Location + Schedule + Negatives → Assets

const API = 'https://googleads.googleapis.com/v23';
const CID = '3681710084';

export async function onRequest(context) {
  const { env } = context;
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const json = (d, s = 200) => new Response(JSON.stringify(d, null, 2), { status: s, headers: CORS });

  if (context.request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const log = [];
  const step = (n, msg) => { log.push(`Step ${n}: ${msg}`); console.log(`Step ${n}: ${msg}`); };

  try {
    // Get OAuth token
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_ADS_CLIENT_ID,
        client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
        refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) throw new Error('OAuth failed: ' + JSON.stringify(tokenData));
    const token = tokenData.access_token;
    const devToken = env.GOOGLE_ADS_DEV_TOKEN;

    // Mutate helper
    const mutate = async (resource, operations) => {
      const resp = await fetch(`${API}/customers/${CID}/${resource}:mutate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'developer-token': devToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operations }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`${resource}:mutate (${resp.status}): ${err}`);
      }
      return (await resp.json()).results || [];
    };

    // ── Step 1: Budget ──
    step(1, 'Creating budget ₹500/day');
    const budgetRes = await mutate('campaignBudgets', [{
      create: { name: 'HE Local Search ₹500/day', amountMicros: '500000000', deliveryMethod: 'STANDARD' },
    }]);
    const budget = budgetRes[0].resourceName;
    step(1, `OK: ${budget}`);

    // ── Step 2: Campaign ──
    step(2, 'Creating campaign');
    const campRes = await mutate('campaigns', [{
      create: {
        name: 'HE — Ghee Rice & Kabab — Local Search',
        status: 'PAUSED',
        advertisingChannelType: 'SEARCH',
        campaignBudget: budget,
        manualCpc: { enhancedCpcEnabled: false },
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: false,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
        geoTargetTypeSetting: {
          positiveGeoTargetType: 'PRESENCE',
          negativeGeoTargetType: 'PRESENCE',
        },
      },
    }]);
    const camp = campRes[0].resourceName;
    step(2, `OK: ${camp}`);

    // ── Step 3: Ad Groups ──
    step(3, 'Creating 2 ad groups');
    const agRes = await mutate('adGroups', [
      { create: { name: 'Near Me — Ghee Rice Kabab Biryani', campaign: camp, status: 'ENABLED', type: 'SEARCH_STANDARD', cpcBidMicros: '8000000' } },
      { create: { name: 'Shivajinagar — Destination Intent', campaign: camp, status: 'ENABLED', type: 'SEARCH_STANDARD', cpcBidMicros: '5000000' } },
    ]);
    const ag1 = agRes[0].resourceName;
    const ag2 = agRes[1].resourceName;
    step(3, `OK: ${ag1}, ${ag2}`);

    // ── Step 4: Keywords ──
    step(4, 'Creating 8 keywords');
    await mutate('adGroupCriteria', [
      { create: { adGroup: ag1, status: 'ENABLED', keyword: { text: 'best restaurant near me', matchType: 'PHRASE' } } },
      { create: { adGroup: ag1, status: 'ENABLED', keyword: { text: 'best biryani near me', matchType: 'PHRASE' } } },
      { create: { adGroup: ag1, status: 'ENABLED', keyword: { text: 'best ghee rice near me', matchType: 'PHRASE' } } },
      { create: { adGroup: ag1, status: 'ENABLED', keyword: { text: 'best kabab near me', matchType: 'PHRASE' } } },
      { create: { adGroup: ag2, status: 'ENABLED', keyword: { text: 'shivajinagar restaurant', matchType: 'PHRASE' } } },
      { create: { adGroup: ag2, status: 'ENABLED', keyword: { text: 'shivajinagar biryani', matchType: 'PHRASE' } } },
      { create: { adGroup: ag2, status: 'ENABLED', keyword: { text: 'shivajinagar food', matchType: 'PHRASE' } } },
      { create: { adGroup: ag2, status: 'ENABLED', keyword: { text: 'restaurants in shivajinagar', matchType: 'PHRASE' } } },
    ]);
    step(4, 'OK: 8 keywords');

    // ── Step 5: Responsive Search Ads ──
    step(5, 'Creating responsive search ads');
    const headlines = [
      { text: 'Hamza Express — Est. 1918', pinnedField: 'HEADLINE_1' },
      { text: 'Ghee Rice. Kebab. Bheja Fry.' },
      { text: '5.0 on Google (70+ Reviews)' },
      { text: 'Best Ghee Rice in Bangalore' },
      { text: 'HKP Road, Shivajinagar' },
      { text: 'Legendary Kabab Since 1918' },
      { text: 'Combo Meals from ₹139' },
      { text: 'Open 12 PM to 12:30 AM' },
      { text: 'Free Dal, Sherwa & Salad' },
      { text: '108 Years, Same Kitchen' },
      { text: 'Order on WhatsApp' },
      { text: 'Drive-Worthy Bheja Fry' },
      { text: 'Walk In or Takeaway' },
      { text: 'Near Russell Market' },
      { text: 'Dakhni Cuisine Since 1918' },
    ];
    const descriptions = [
      { text: 'Ghee rice that glistens, charcoal kebabs people queue for, bheja fry worth the drive. Since 1918.' },
      { text: '5.0 on Google, 70+ reviews. Combos from ₹139 with free Dal, Sherwa & Salad. Walk in anytime.' },
      { text: '108-year Dakhni legacy, HKP Road. Ghee Rice, Kebab, Brain Fry, Shawarma. Open 12PM-12:30AM.' },
      { text: 'WhatsApp us, pay UPI, collect in 15 min. Or walk in for dine-in. Near Russell Market.' },
    ];
    const adBody = {
      responsiveSearchAd: { headlines, descriptions, path1: 'ghee-rice', path2: 'kebab' },
      finalUrls: ['https://hamzaexpress.in'],
    };
    await mutate('adGroupAds', [
      { create: { adGroup: ag1, status: 'ENABLED', ad: adBody } },
      { create: { adGroup: ag2, status: 'ENABLED', ad: adBody } },
    ]);
    step(5, 'OK: 2 RSAs');

    // ── Step 6: Location + Schedule + Negative Keywords ──
    step(6, 'Setting location, schedule, negatives');
    const days = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
    const scheduleOps = days.flatMap(d => [
      { create: { campaign: camp, adSchedule: { dayOfWeek: d, startHour: 11, startMinute: 'ZERO', endHour: 14, endMinute: 'ZERO' } } },
      { create: { campaign: camp, adSchedule: { dayOfWeek: d, startHour: 18, startMinute: 'ZERO', endHour: 22, endMinute: 'THIRTY' } } },
    ]);
    const negatives = [
      'recipe','how to make','ingredients','cooking','homemade',
      'movie','download','streaming','watch online',
      'Swiggy','Zomato','jobs','hiring','franchise',
      'calories','nutrition','diet','veg','vegetarian',
    ];
    const negOps = negatives.map(kw => ({
      create: { campaign: camp, negative: true, keyword: { text: kw, matchType: 'PHRASE' } },
    }));
    await mutate('campaignCriteria', [
      { create: { campaign: camp, proximity: { geoPoint: { latitudeInMicroDegrees: 12986800, longitudeInMicroDegrees: 77604400 }, radius: 5.0, radiusUnits: 'KILOMETERS' } } },
      ...scheduleOps,
      ...negOps,
    ]);
    step(6, `OK: location + 14 schedules + ${negatives.length} negatives`);

    // ── Step 7: Assets ──
    step(7, 'Creating assets');
    const assetRes = await mutate('assets', [
      { create: { sitelinkAsset: { linkText: 'View Our Menu', description1: '100+ dishes, 9 categories', description2: 'Ghee Rice, Kebab, Biryani', finalUrls: ['https://hamzaexpress.in/#menu'] } } },
      { create: { sitelinkAsset: { linkText: 'Order on WhatsApp', description1: 'Skip the queue', description2: 'Pay UPI, collect in 15 min', finalUrls: ['https://hamzaexpress.in/go/google-ad'] } } },
      { create: { sitelinkAsset: { linkText: 'Our 108-Year Legacy', description1: 'Same recipes since 1918', description2: 'Dakhni cuisine heritage', finalUrls: ['https://hamzaexpress.in/#legacy'] } } },
      { create: { sitelinkAsset: { linkText: 'Get Directions', description1: 'HKP Road, Shivajinagar', description2: 'Near Russell Market', finalUrls: ['https://hamzaexpress.in/go/maps'] } } },
      { create: { calloutAsset: { calloutText: 'Est. 1918' } } },
      { create: { calloutAsset: { calloutText: '5.0 on Google' } } },
      { create: { calloutAsset: { calloutText: '108-Year Legacy' } } },
      { create: { calloutAsset: { calloutText: 'HKP Road' } } },
      { create: { calloutAsset: { calloutText: 'Free Salad & Sherwa' } } },
      { create: { structuredSnippetAsset: { header: 'Menu', values: ['Ghee Rice','Chicken Kebab','Bheja Fry','Biryani','Shawarma','Tandoori'] } } },
    ]);
    step(7, `OK: ${assetRes.length} assets`);

    // ── Step 8: Link Assets ──
    step(8, 'Linking assets to campaign');
    const linkOps = assetRes.map((r, i) => ({
      create: {
        campaign: camp,
        asset: r.resourceName,
        fieldType: i < 4 ? 'SITELINK' : i < 9 ? 'CALLOUT' : 'STRUCTURED_SNIPPET',
      },
    }));
    await mutate('campaignAssets', linkOps);
    step(8, `OK: ${linkOps.length} linked`);

    return json({
      success: true,
      campaign: 'HE — Ghee Rice & Kabab — Local Search',
      status: 'PAUSED — enable when ready',
      budget: '₹500/day',
      location: '5km from 12.9868°N, 77.6044°E',
      schedule: '11AM-2PM + 6PM-10:30PM',
      adGroups: { nearMe: ag1, shivajinagar: ag2 },
      keywords: 8,
      negatives: negatives.length,
      assets: assetRes.length,
      resources: { budget, campaign: camp, ag1, ag2 },
      log,
    });
  } catch (err) {
    return json({ success: false, error: err.message, log, stack: err.stack }, 500);
  }
}
