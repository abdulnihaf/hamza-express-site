# Hamza Express WABA — Creator Flow Templates

Spec for the **3 Meta Utility templates** the creator flow needs approved
through Meta Business Manager. Until these are approved, the flow runs on
free-form text — which only delivers inside the recipient's 24h session
window. Once approved, swap `sendWaba()` → `sendTemplate()` in the
`notifyOwner / notifyCreatorReceived / notifyCreator` helpers in
`functions/api/creator-application.js`.

WABA sender: **+91 80080 02049** (Hamza Express).
WABA category: **Utility** (transactional — application receipts, booking
confirmations, owner-side ops alerts). NOT marketing.

---

## Template 1 — `creator_application_received`

**Category:** Utility · **Language:** English (en) · **Header:** None · **Footer:** None

Fires the moment a creator submits the form, regardless of approval status.
Their first ever message from us — needs to look professional and prompt
them to save the contact.

**Body:**

```
Hi @{{1}},

Thanks for applying to Hamza Express — the 108-year-old Dakhni kitchen on H.K.P. Road, Shivajinagar.

{{2}}

Tier: {{3}}
Slot requested: {{4}}

If approved, full confirmation with the menu + what we'll host you with lands in your next message.

— Nihaf, Managing Director, HN Hotels Pvt Ltd
Hamza Express · est. 1918 · Shivajinagar
```

**Variables:**
- `{{1}}` — IG handle (without @)
- `{{2}}` — status line (e.g. *"📝 We've received your application. We'll review within 24 hours."*)
- `{{3}}` — tier label (e.g. *"T3 · 15K–30K · Mid-Micro"*)
- `{{4}}` — slot string (e.g. *"Prime · 8 PM on 2026-05-15"*)

**Sample for approval:** Plug example values matching the format above so
Meta reviewer sees the message is genuinely transactional.

---

## Template 2 — `creator_invitation_confirmed`

**Category:** Utility · **Language:** English (en)

Fires on auto-approve at submit (T1–T4 with passing engagement) AND on
owner approve (T5+). The "you're booked" moment — heaviest message in
the flow because it carries the menu + asks.

**Body:**

```
Your invitation to Hamza Express is confirmed.

Tier: {{1}}
Slot: {{2}}
Where: 19 H.K.P. Road, Shivajinagar, Bangalore 560051

What we're hosting you with:
{{3}}

What we ask:
{{4}}

Tag @hamzaexpressblr · use the Shivajinagar geotag.

Looking forward,
— Nihaf, Managing Director, HN Hotels Pvt Ltd
Hamza Express · est. 1918 · Shivajinagar
Save us: +91 80080 02049 (WhatsApp)
```

**Variables:**
- `{{1}}` — tier label
- `{{2}}` — slot string
- `{{3}}` — bullet list of covers + add-ons + cash (joined with line breaks)
- `{{4}}` — bullet list of asks

> Note: Meta templates support up to ~10 variables. If `{{3}}` / `{{4}}`
> bullet lists are too long, split into two body templates by tier band:
> `creator_invitation_confirmed_t1_t4` (no cash) and
> `creator_invitation_confirmed_t5_t7` (with cash).

---

## Template 3 — `creator_owner_alert`

**Category:** Utility · **Language:** English (en) · **Header:** None

Fires on every submit — internal ops alert to the owner number
(+91 70104 26808). Simple summary + review CTA.

**Body:**

```
🍽️ NEW CREATOR APPLICATION

@{{1}} · {{2}}
{{3}} followers · ER {{4}}
Wants: {{5}}

Status: {{6}}

{{7}}
```

**Variables:**
- `{{1}}` — IG handle (without @)
- `{{2}}` — tier label
- `{{3}}` — followers count, formatted (e.g. *"24,371"*)
- `{{4}}` — engagement rate (e.g. *"1.20%"*)
- `{{5}}` — slot string
- `{{6}}` — status (one of: *"✅ AUTO-CONFIRMED"* / *"⏳ NEEDS REVIEW"* / *"❌ AUTO-DECLINED"*)
- `{{7}}` — review URL or empty (e.g. *"Review: hnhotels.in/ops/influencer-applications/?app_id=42"*)

**Header (optional, recommended):** `Type: Text` body
`📬 Hamza Express — Creator Ops Alert`

---

## How to submit for approval

1. Meta Business Manager → WhatsApp Manager → Message Templates
2. Click **Create Template**
3. **Category:** Utility (NOT Marketing — that's a different policy + 24h
   window doesn't apply to Utility transactional)
4. Paste the template body, register variables in order, add 1 sample message
5. Submit. Approval typically lands in **2–6 hours** for Utility templates
   (Marketing can take 24h). Rejection reasons are usually:
   - Too promotional in tone (Utility must be clearly transactional)
   - Generic placeholders (`{{1}}` instead of a real example in the sample)
   - URL shorteners (use full URL)

## After approval — code change

Swap the `sendWaba(env, to, text)` calls in `notifyOwner /
notifyCreatorReceived / notifyCreator` for a `sendTemplate(env, to,
templateName, vars)` helper. The free-form sender stays as a fallback for
in-session conversational replies (e.g. a creator asking a follow-up).

```js
async function sendTemplate(env, to, name, varsArray, lang = 'en') {
  const url = `https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to).replace(/\D/g, ''),
      type: 'template',
      template: {
        name,
        language: { code: lang },
        components: [{
          type: 'body',
          parameters: varsArray.map(v => ({ type: 'text', text: String(v) })),
        }],
      },
    }),
  });
  const data = await resp.json();
  return resp.ok
    ? { ok: true, message_id: data.messages?.[0]?.id }
    : { ok: false, status: resp.status, meta: data?.error };
}
```

## Free-form fallback (current state)

Until templates are approved, all 3 messages send via free-form text. They
deliver only within 24h of the recipient's most recent inbound message to
+91 80080 02049. Failure mode (Meta error 131047 / 132000 — "outside session
window") is logged into `influencer_applications.notes_owner` so the owner
dashboard can show delivery state per application.

The owner number works because the owner regularly tests HE WABA. The
creator number won't work for cold-DM'd creators — they need to message us
first OR the templates need to be approved.
