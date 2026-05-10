// _lib/email-templates.js — HTML email templates for the HE creator flow.
//
// Two states, one design system (HE brand: tan #D2B48C, sienna #713520,
// off-white #FAF3E3, Times New Roman / Georgia for serif heritage feel).
// All CSS inlined — Gmail/Outlook/iOS Mail strip <style> blocks.
//
// State 1: receivedEmail()  → fired on every form submit
// State 2: decisionEmail()  → fired on owner approve OR decline OR auto-approve at submit
//
// Public exports:
//   buildReceivedEmail({ first_name, handle, tier, slot, status })
//   buildDecisionEmail({ first_name, handle, tier, slot, hosting, asks, cash_inr, status, decline_reason })
// Each returns { subject, html }.

// ───────────────────────────────────────────────────────────────────
// Brand tokens (from /Users/nihaf/Documents/Design/HE/HE Brand Doc.docx)
// ───────────────────────────────────────────────────────────────────
const BRAND = {
  sienna:    '#713520',  // primary text + strokes
  tan:       '#D2B48C',  // primary background
  offwhite:  '#FAF3E3',  // EXPRESS fill, soft highlights
  white:     '#FFFFFF',
  text:      '#3a1a10',  // body text — slightly softened sienna
  mute:      '#8a6a5a',  // muted sienna
  gold:      '#b8860b',  // accent for cash callouts (cohesive with tan/sienna palette)
  line:      '#c8a070',  // soft line color, harmonises with tan
};

const LOGO_URL = 'https://hamzaexpress.in/assets/brand/he-emblem.png';
const APPLY_URL = 'https://hamzaexpress.in/creators/';
const ADDRESS = '151 TO 154, HKP Road, Sulthangunta · Shivajinagar · Bangalore 560051';
const WABA_NUMBER = '+91 80080 02049';
const MAP_URL = 'https://www.google.com/maps/place/?q=place_id:ChIJ-QQjtHEXrjsR-Z1RIEm2arg';

// Format slot date+window into "Saturday, 10 May · Prime · 8 PM"
function fmtSlotEmail(slot) {
  if (!slot) return 'Your selected slot';
  const WIN = {
    AFTERNOON: { time: '4 PM', label: 'Afternoon' },
    GOLDEN:    { time: '6 PM', label: 'Golden Hour' },
    PRIME:     { time: '8 PM', label: 'Prime' },
    LATE:      { time: '10 PM', label: 'Late' },
    MIDNIGHT:  { time: '12 AM (midnight)', label: 'Midnight' },
  };
  const win = WIN[slot.window_code] || { time: slot.window_code, label: '' };
  let dateStr = slot.slot_date || '';
  try {
    const d = new Date(slot.slot_date + 'T00:00:00+05:30');
    dateStr = d.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
  } catch {}
  return `${dateStr} · ${win.label} · ${win.time}`;
}

// ───────────────────────────────────────────────────────────────────
// Shared layout shell — header, footer, base wrapper
// ───────────────────────────────────────────────────────────────────
function shell({ preheader, body }) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
<title>An invitation from Hamza Hotel</title>
<!--[if mso]><style type="text/css">body,table,td{font-family:Georgia,serif !important}</style><![endif]-->
<style type="text/css">
  /* Mobile breakpoint — Apple Mail iOS / Gmail Android / Outlook Mobile honor this. */
  @media only screen and (max-width:480px){
    .px-mobile{padding-left:22px !important;padding-right:22px !important}
    .px-mobile-tight{padding-left:18px !important;padding-right:18px !important}
    .py-mobile{padding-top:24px !important;padding-bottom:24px !important}
    .h1-mobile{font-size:24px !important;line-height:1.2 !important}
    .h2-mobile{font-size:20px !important;line-height:1.25 !important}
    .body-mobile{font-size:15px !important;line-height:1.65 !important}
    .small-mobile{font-size:13px !important}
    .cta-mobile{display:block !important;width:auto !important;padding:16px 22px !important;font-size:15px !important}
    .stack-mobile{display:block !important;width:100% !important;padding-left:0 !important;padding-right:0 !important;text-align:left !important}
    .label-mobile{padding-bottom:2px !important;width:auto !important;display:block !important}
    .slot-when-mobile{font-size:20px !important}
    .logo-mobile{width:96px !important;height:96px !important}
  }
  /* Universal fluid-image safety */
  img{max-width:100%;height:auto}
  /* Anchor link colors stay branded across clients */
  a{color:#713520}
</style>
</head>
<body style="margin:0;padding:0;background:#f4ece0;font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">
<!-- Preheader (shown in inbox preview, hidden in body) -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;height:0;width:0">
${preheader}
</div>

<table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="background:#f4ece0;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="600" style="max-width:600px;width:100%;background:${BRAND.offwhite};border:1px solid ${BRAND.line};border-radius:6px;overflow:hidden;">

      <!-- HEADER STRIP -->
      <tr><td class="px-mobile py-mobile" style="background:${BRAND.tan};padding:32px 40px;text-align:center;border-bottom:3px solid ${BRAND.sienna};">
        <img class="logo-mobile" src="${LOGO_URL}" alt="Hamza Express · Est. 1918" width="120" height="120" style="display:block;margin:0 auto 14px;width:120px;height:120px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
        <div class="small-mobile" style="font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.sienna};font-size:13px;letter-spacing:.18em;text-transform:uppercase;font-weight:600;">
          Est. 1918 · Shivajinagar · Bangalore
        </div>
        <div class="small-mobile" style="font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.sienna};font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-top:6px;opacity:.75;">
          Over a hundred years of taste
        </div>
      </td></tr>

      <!-- BODY -->
      <tr><td class="px-mobile body-mobile" style="padding:40px 40px 24px 40px;font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.text};font-size:16px;line-height:1.7;">
        ${body}
      </td></tr>

      <!-- FOOTER STRIP -->
      <tr><td class="px-mobile-tight" style="background:${BRAND.tan};padding:24px 40px;text-align:center;border-top:1px solid ${BRAND.sienna};">
        <div style="font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.sienna};font-size:14px;font-weight:700;letter-spacing:.04em;margin-bottom:6px;">
          Hamza Express
        </div>
        <div style="font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.sienna};font-size:12px;line-height:1.6;opacity:.85;">
          ${ADDRESS}<br/>
          WhatsApp us: <a href="https://wa.me/${WABA_NUMBER.replace(/\D/g,'')}" style="color:${BRAND.sienna};text-decoration:underline;">${WABA_NUMBER}</a><br/>
          Web: <a href="${APPLY_URL}" style="color:${BRAND.sienna};text-decoration:underline;">hamzaexpress.in/creators</a>
        </div>
        <div style="margin-top:18px;padding-top:14px;border-top:1px solid ${BRAND.sienna};border-top-style:dotted;font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.sienna};font-size:11px;line-height:1.6;opacity:.7;">
          Hamza Hotel · cooking on H.K.P. Road since 1918<br/>
          Hamza Express is the modern, refreshed avatar of Hamza Hotel.<br/>
          Operated by HN Hotels Pvt Ltd · CIN U55101KA2023PTC182051
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// ───────────────────────────────────────────────────────────────────
// Reusable section primitives (inline-CSS only)
// ───────────────────────────────────────────────────────────────────
function divider() {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin:28px 0;"><tr><td style="border-top:1px solid ${BRAND.line};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`;
}

function eyebrow(label) {
  return `<div style="font-family:Georgia,serif;color:${BRAND.sienna};font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:700;margin-bottom:10px;">${label}</div>`;
}

function bigHeading(text) {
  return `<h1 class="h1-mobile" style="font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.sienna};font-size:30px;line-height:1.2;font-weight:700;margin:0 0 18px 0;letter-spacing:-.005em;">${text}</h1>`;
}

function statusPill({ label, color, bg }) {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:6px 0 22px 0;"><tr>
  <td style="background:${bg};color:${color};padding:8px 16px;border-radius:99px;font-family:Georgia,serif;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;border:1px solid ${color};">${label}</td>
  </tr></table>`;
}

function detailRow(label, value) {
  // On mobile (≤480px), the label cell stacks above the value cell via .stack-mobile + .label-mobile.
  return `<tr>
    <td class="label-mobile stack-mobile" style="padding:10px 0;font-family:Georgia,serif;color:${BRAND.mute};font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;border-bottom:1px dotted ${BRAND.line};vertical-align:top;width:120px;">${label}</td>
    <td class="stack-mobile" style="padding:10px 0 10px 14px;font-family:Georgia,serif;color:${BRAND.text};font-size:15px;font-weight:600;border-bottom:1px dotted ${BRAND.line};vertical-align:top;">${value}</td>
  </tr>`;
}

function bulletList(items) {
  if (!items || !items.length) return '';
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin:0;">
    ${items.map(i => `<tr><td style="padding:6px 0 6px 22px;font-family:Georgia,serif;color:${BRAND.text};font-size:15px;line-height:1.6;position:relative;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${BRAND.sienna};vertical-align:middle;margin-right:12px;"></span>${i}
    </td></tr>`).join('')}
  </table>`;
}

function ctaButton(href, label) {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0 8px 0;">
    <tr><td style="background:${BRAND.sienna};border-radius:4px;">
      <a class="cta-mobile" href="${href}" style="display:inline-block;padding:14px 28px;font-family:Georgia,serif;font-size:14px;color:${BRAND.offwhite};text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${label}</a>
    </td></tr></table>`;
}

function signoff() {
  return `<div style="margin-top:32px;font-family:Georgia,'Times New Roman',Times,serif;font-style:italic;color:${BRAND.sienna};font-size:16px;line-height:1.5;">
    Looking forward to hosting you,<br/>
    <span style="font-weight:700;font-style:normal;">— Nihaf</span><br/>
    <span style="font-size:13px;color:${BRAND.mute};font-style:normal;">Managing Director · HN Hotels Pvt Ltd</span>
  </div>`;
}

// Heritage strip — short editorial about Hamza Hotel's lineage. Used in both templates.
function heritageStrip() {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="background:${BRAND.tan};margin:28px 0;border-radius:4px;">
    <tr><td style="padding:22px 28px;">
      <div style="font-family:Georgia,serif;color:${BRAND.sienna};font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:700;margin-bottom:10px;">A note on the heritage</div>
      <p style="font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.sienna};font-size:14px;line-height:1.7;margin:0;font-style:italic;">
        Hamza Hotel has been on H.K.P. Road, Shivajinagar, since 1918 — one hundred and eight years, four generations of the same family. Through partition, license raj, through Bangalore turning from a sleepy cantonment into the metropolis we know today, the kitchen has not gone dark for a single evening. Hamza Express is the recently refreshed avatar of that kitchen. The recipes did not move an inch.
      </p>
    </td></tr>
  </table>`;
}

// ───────────────────────────────────────────────────────────────────
// TEMPLATE 1 — application received (waiting outlet approval)
// Also handles the "auto-approved at submit" case via the status field.
// ───────────────────────────────────────────────────────────────────
export function buildReceivedEmail({ first_name, handle, tier, slot, status, hosting, asks, cash_inr }) {
  // status is one of: 'auto_approved' | 'pending' | 'declined'
  const isApproved = status === 'auto_approved';
  const isDeclined = status === 'declined';

  let pill, headline, leadCopy;
  if (isApproved) {
    pill = statusPill({ label: '✓ Confirmed instantly', color: '#0a6645', bg: '#e0f4e8' });
    headline = `Your invitation is confirmed, ${first_name}.`;
    leadCopy = `<p style="margin:0 0 20px 0;">Welcome to the Hamza Hotel table. Your slot is reserved and the kitchen will be expecting you.</p>`;
  } else if (isDeclined) {
    pill = statusPill({ label: 'Decision · Not this round', color: '#8b1d1d', bg: '#fbe5e5' });
    headline = `Thank you for applying, ${first_name}.`;
    leadCopy = `<p style="margin:0 0 20px 0;">We're not able to host this round. We'd love to host you when your engagement grows — please apply again.</p>`;
  } else {
    pill = statusPill({ label: 'Application received · awaiting review', color: BRAND.sienna, bg: BRAND.tan });
    headline = `Thank you for applying, ${first_name}.`;
    leadCopy = `<p style="margin:0 0 20px 0;">Your application has reached the kitchen. The family will personally review it and respond within twenty-four hours — we host one creator per slot, so each invitation is decided by hand.</p>`;
  }

  const subject = isApproved
    ? 'Your invitation to Hamza Express is confirmed'
    : isDeclined
      ? 'Hamza Express — application update'
      : 'Application received — Hamza Express, est. 1918';

  const preheader = isApproved
    ? `Your slot is reserved at the table the city has been sitting at since 1918.`
    : isDeclined
      ? `Thank you for the consideration. Apply again as your audience grows.`
      : `The family will review and respond within 24 hours. One creator per slot.`;

  const body = `
    ${eyebrow('An invitation from Hamza Hotel · est. 1918')}
    ${bigHeading(headline)}
    ${pill}
    ${leadCopy}

    <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin:8px 0 16px 0;border-top:1px solid ${BRAND.line};">
      ${detailRow('Creator', `@${handle}`)}
      ${detailRow('Tier', tier)}
      ${detailRow('Slot ' + (isApproved ? 'reserved' : 'requested'), slot)}
      ${detailRow('Address', ADDRESS)}
    </table>

    ${isApproved && hosting ? `
      ${eyebrow('What we are hosting you with')}
      ${bulletList(hosting)}
      ${cash_inr ? `<div style="margin:14px 0 0 0;padding:12px 16px;background:#fdf6e3;border-left:3px solid ${BRAND.gold};font-family:Georgia,serif;color:${BRAND.sienna};font-size:14px;">
        <strong>Cash on top of the meal:</strong> <span style="font-weight:700;color:${BRAND.gold};">₹ ${Number(cash_inr).toLocaleString('en-IN')}</span>
      </div>` : ''}
      ${divider()}
      ${eyebrow('What we ask, in return')}
      ${bulletList(asks)}
      ${divider()}
      <p style="margin:0 0 8px 0;font-size:14px;line-height:1.7;">When you arrive, please tag <strong>@hamzaexpress1918</strong> and use the <strong>Shivajinagar geotag</strong>. That's the only deliverable that matters operationally — everything else is yours to tell in your own voice.</p>
      <p style="margin:14px 0 0 0;font-size:14px;line-height:1.7;">Save us at <strong>${WABA_NUMBER}</strong> on WhatsApp — last-mile details and reminders will land there.</p>
    ` : ''}

    ${!isApproved && !isDeclined ? `
      <p style="margin:14px 0 0 0;font-size:14px;line-height:1.7;color:${BRAND.mute};">
        <strong style="color:${BRAND.sienna};">What happens next:</strong> we review every application by hand. You'll hear back from us via WhatsApp on <strong>${WABA_NUMBER}</strong> and email — typically within twenty-four hours. Save the WhatsApp number now so our reply doesn't land in spam.
      </p>
    ` : ''}

    ${isDeclined ? `
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;">
        Engagement quality matters more to us than follower count. We work with creators whose followers are genuinely engaged — when yours grows, the door is open.
      </p>
      ${ctaButton(APPLY_URL, 'Apply again →')}
    ` : ''}

    ${heritageStrip()}
    ${signoff()}
  `;

  return { subject, html: shell({ preheader, body }) };
}

// ───────────────────────────────────────────────────────────────────
// OUTREACH — cold-DM email to a discovered creator inviting them to apply.
// Wraps an owner-edited body (plain text or basic HTML) in the brand shell.
// Supported template variables in the body: {first_name} {handle} {tier} {full_name}
// ───────────────────────────────────────────────────────────────────
export function buildOutreachEmail({ first_name, handle, tier, full_name, body_text, subject }) {
  const subj = subject || 'An invitation from Hamza Hotel — est. 1918, Shivajinagar';
  // Substitute placeholders in the body
  const vars = { first_name, handle, tier, full_name };
  let body = String(body_text || '');
  for (const k in vars) body = body.split(`{${k}}`).join(vars[k] || '');

  // Convert plain-text paragraphs (double-newlines → <p>; URLs → <a>)
  const escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const linkify = s => s.replace(/(https?:\/\/[^\s<>"']+)/g,
    `<a href="$1" style="color:${BRAND.sienna};text-decoration:underline;">$1</a>`);
  const paragraphs = body.split(/\n\s*\n/).map(p => {
    // Inside a paragraph, single \n becomes <br/>
    const inner = linkify(escHtml(p)).replace(/\n/g, '<br/>');
    return `<p style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',Times,serif;font-size:16px;line-height:1.7;color:${BRAND.text};">${inner}</p>`;
  }).join('\n');

  const preheader = `An invitation to sit at the Hamza family table — by selection only`;

  const innerBody = `
    ${eyebrow('An invitation from Hamza Hotel · est. 1918')}
    ${paragraphs}

    ${ctaButton('https://hamzaexpress.in/creators/', 'View your invitation card →')}

    ${heritageStrip()}
  `;

  return { subject: subj, html: shell({ preheader, body: innerBody }) };
}

// ───────────────────────────────────────────────────────────────────
// TEMPLATE 2b — TENTATIVE (outlet approved, awaiting creator confirmation)
// Fires the moment owner taps Approve. Booking is held but not final.
// Creator must tap the Confirm button to lock the slot.
// ───────────────────────────────────────────────────────────────────
export function buildTentativeEmail({ first_name, handle, tier, slot, hosting, asks, cash_inr, confirm_url }) {
  const slotLabel = fmtSlotEmail(slot);
  const subject = `🎉 Outlet approved · please confirm your slot at Hamza Express`;
  const preheader = `Your slot is held for ${slotLabel}. One last tap to lock it in.`;

  const body = `
    ${eyebrow('An invitation from Hamza Hotel · est. 1918')}
    ${bigHeading(`We'd be honoured to host you, ${first_name}.`)}
    ${statusPill({ label: '🎉 Outlet approved · awaiting your confirmation', color: BRAND.sienna, bg: '#fdf6e3' })}
    <p style="margin:0 0 20px 0;">The family has personally reviewed your application and we'd love to have you at our table. Your slot is on hold — one last tap from you and the kitchen prepares for your arrival.</p>

    <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin:8px 0 16px 0;border-top:1px solid ${BRAND.line};">
      ${detailRow('Creator', `@${handle}`)}
      ${detailRow('Tier', tier)}
      ${detailRow('Slot held', slotLabel)}
      ${detailRow('Address', ADDRESS)}
    </table>

    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0 8px 0;">
      <tr><td style="background:${BRAND.sienna};border-radius:4px;">
        <a class="cta-mobile" href="${confirm_url}" style="display:inline-block;padding:18px 36px;font-family:Georgia,serif;font-size:16px;color:${BRAND.offwhite};text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">✓ Confirm my slot</a>
      </td></tr>
    </table>

    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:8px 0 24px 0;">
      <tr><td style="border:1.5px solid ${BRAND.sienna};">
        <a class="cta-mobile" href="${MAP_URL}" style="display:inline-block;padding:14px 28px;font-family:Georgia,serif;font-size:14px;color:${BRAND.sienna};text-decoration:none;font-weight:700;letter-spacing:.04em;">📍 Get directions</a>
      </td></tr>
    </table>

    ${hosting ? `
      ${eyebrow('What we will host you with')}
      ${bulletList(hosting)}
      ${cash_inr ? `<div style="margin:14px 0 0 0;padding:12px 16px;background:#fdf6e3;border-left:3px solid ${BRAND.gold};font-family:Georgia,serif;color:${BRAND.sienna};font-size:14px;">
        <strong>Cash on top of the meal:</strong> <span style="font-weight:700;color:${BRAND.gold};">₹ ${Number(cash_inr).toLocaleString('en-IN')}</span>
      </div>` : ''}
      ${divider()}
      ${eyebrow('What we ask, in return')}
      ${bulletList(asks)}
      ${divider()}
    ` : ''}

    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.7;color:${BRAND.mute};font-style:italic;">If we don't hear from you in 24 hours, we'll release the slot back to the pool. No pressure — just want to make sure the kitchen is ready for you.</p>

    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.7;">Save <strong>${WABA_NUMBER}</strong> on WhatsApp now — slot reminders and day-of details land there.</p>

    ${heritageStrip()}
    ${signoff()}
  `;

  return { subject, html: shell({ preheader, body }) };
}

// ───────────────────────────────────────────────────────────────────
// TEMPLATE 2 — outlet decision (approve or reject after manual review)
// ───────────────────────────────────────────────────────────────────
export function buildDecisionEmail({ first_name, handle, tier, slot, hosting, asks, cash_inr, status, decline_reason }) {
  // status: 'approved' | 'declined'
  const isApproved = status === 'approved';

  const slotLabel = fmtSlotEmail(slot);
  let pill, headline, leadCopy;
  if (isApproved) {
    pill = statusPill({ label: '✅ Slot locked in', color: '#0a6645', bg: '#e0f4e8' });
    headline = `You're booked, ${first_name}.`;
    leadCopy = `<p style="margin:0 0 20px 0;font-size:17px;line-height:1.65;">Your slot at Hamza Express is confirmed. Save the details below — and the WhatsApp number — so we can reach you on the day of.</p>`;
  } else {
    pill = statusPill({ label: 'Decision · Not this round', color: '#8b1d1d', bg: '#fbe5e5' });
    headline = `Thank you for applying, ${first_name}.`;
    leadCopy = `<p style="margin:0 0 12px 0;">We're not able to host this round.</p>${decline_reason ? `<p style="margin:0 0 20px 0;font-style:italic;color:${BRAND.mute};border-left:3px solid ${BRAND.line};padding:10px 16px;background:#fdf6e3;">"${decline_reason.replace(/[<>]/g,'')}"</p>` : ''}<p style="margin:0 0 20px 0;">Please don't take it as a final no — when the timing or fit is right, the door is open.</p>`;
  }

  const subject = isApproved
    ? `✅ Your slot at Hamza Express is locked in · ${slotLabel.split('·')[0].trim()}`
    : 'Hamza Express — application update';

  const preheader = isApproved
    ? `${slotLabel} · 151 TO 154 HKP Road, Shivajinagar`
    : `Thank you for the consideration. We'd love you to apply again.`;

  const body = `
    ${eyebrow('An invitation from Hamza Hotel · est. 1918')}
    ${bigHeading(headline)}
    ${pill}
    ${leadCopy}

    ${isApproved ? `
    <!-- BIG SLOT BOX — the one thing they need to see -->
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin:24px 0;background:${BRAND.tan};border:2px solid ${BRAND.sienna};">
      <tr><td class="px-mobile-tight" style="padding:28px 32px;">
        <div style="font-family:Georgia,serif;color:${BRAND.sienna};font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:700;margin-bottom:12px;">Your slot</div>
        <div class="slot-when-mobile" style="font-family:Georgia,'Times New Roman',Times,serif;color:${BRAND.sienna};font-size:24px;font-weight:700;line-height:1.3;margin-bottom:14px;">${slotLabel}</div>
        <div class="small-mobile" style="font-family:Georgia,serif;color:${BRAND.sienna};font-size:15px;line-height:1.55;">📍 ${ADDRESS}</div>
      </td></tr>
    </table>

    <!-- Map button, prominent -->
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:8px 0 24px 0;">
      <tr><td style="background:${BRAND.sienna};border-radius:4px;">
        <a class="cta-mobile" href="${MAP_URL}" style="display:inline-block;padding:18px 36px;font-family:Georgia,serif;font-size:16px;color:${BRAND.offwhite};text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">📍 Get directions on Google Maps</a>
      </td></tr>
    </table>
    ` : ''}

    <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin:8px 0 16px 0;border-top:1px solid ${BRAND.line};">
      ${detailRow('Creator', `@${handle}`)}
      ${detailRow('Tier', tier)}
      ${!isApproved ? detailRow('Slot requested', slotLabel) : ''}
    </table>

    ${isApproved && hosting ? `
      ${eyebrow('What we are hosting you with')}
      ${bulletList(hosting)}
      ${cash_inr ? `<div style="margin:14px 0 0 0;padding:12px 16px;background:#fdf6e3;border-left:3px solid ${BRAND.gold};font-family:Georgia,serif;color:${BRAND.sienna};font-size:14px;">
        <strong>Cash on top of the meal:</strong> <span style="font-weight:700;color:${BRAND.gold};">₹ ${Number(cash_inr).toLocaleString('en-IN')}</span>
      </div>` : ''}
      ${divider()}
      ${eyebrow('What we ask, in return')}
      ${bulletList(asks)}
      ${divider()}
      <p style="margin:0 0 8px 0;font-size:14px;line-height:1.7;">Please tag <strong>@hamzaexpress1918</strong> and use the <strong>Shivajinagar geotag</strong> when you arrive. That is the only formal deliverable — the rest is yours to tell in your own voice.</p>
      <p style="margin:14px 0 0 0;font-size:14px;line-height:1.7;"><strong>Day-of:</strong> walk in, mention you're from the creator program. Park on HKP Road or take Russell Market lanes.</p>
      <p style="margin:14px 0 0 0;font-size:14px;line-height:1.7;">Save <strong>${WABA_NUMBER}</strong> on WhatsApp now — last-mile details and reminders land there.</p>
    ` : ''}

    ${!isApproved ? `
      ${ctaButton(APPLY_URL, 'Apply again when ready →')}
    ` : ''}

    ${heritageStrip()}
    ${signoff()}
  `;

  return { subject, html: shell({ preheader, body }) };
}
