# WhatsApp Integration, Approved Templates & Promotion Messages

A portable guide to the admin-panel WhatsApp feature as built in the Spin Wheel
project, so it can be re-implemented on another project with the same behaviour.

It covers three things:

1. **WhatsApp integration** — sending messages through the Meta WhatsApp
   Business Cloud API, with a built-in **simulation mode** for local/dev.
2. **Approved templates** — the reusable message library, token substitution,
   and the Meta-approved template call used for the spin reward.
3. **Promotion messages (broadcasts)** — sending a template to an audience
   segment, with opt-out handling and recipient counting.

---

## 1. Architecture at a glance

```
Frontend (Next.js admin)          Backend (Express)               Meta Cloud API
──────────────────────────        ────────────────────────       ──────────────
WhatsApp.jsx     ─┐               /api/admin/whatsapp/status
Templates.jsx    ─┼── api.js ───► /api/admin/whatsapp/templates ──►
Promotions.jsx   ─┘               /api/admin/whatsapp/recipients
lib/wa.js (preview/tokens)        /api/admin/whatsapp/broadcast ──► graph.facebook.com
                                  /api/admin/whatsapp/test      ──►   /{phoneId}/messages
                                  /api/admin/whatsapp/optouts
                                  /api/whatsapp/webhook (Meta → us, STOP handling)
                                        │
                                        └── src/whatsapp.js  (Meta API client)
                                        └── src/db.js        (templates, opt-outs, recipients)
```

Key files to port:

| File | Responsibility |
|------|----------------|
| `backend/src/whatsapp.js` | Meta API client: send text, send approved template, token render, E.164, simulation mode |
| `backend/server.js` | Admin + webhook routes |
| `backend/src/db.js` | Template CRUD, opt-outs, segment recipient resolution |
| `backend/src/mysql.js` | Table schema + seed templates + default reward body |
| `frontend/lib/wa.js` | Shared tokens, segments, live-preview renderer |
| `frontend/lib/api.js` | API client methods |
| `frontend/components/admin/WhatsApp.jsx` | Delivery settings, test send, opt-outs UI |
| `frontend/components/admin/Templates.jsx` | Template library UI |
| `frontend/components/admin/Promotions.jsx` | Broadcast/promotion UI |

---

## 2. Environment / configuration

Credentials live in **env vars** (never in the browser or DB). Per-client
values (phone number id, template name, enabled flag) live in **settings**.

```bash
WHATSAPP_ACCESS_TOKEN=EAA...          # Meta permanent/system-user token
WHATSAPP_PHONE_NUMBER_ID=1011932...   # from Meta > WhatsApp > API setup
WHATSAPP_API_VERSION=v25.0            # Graph API version
WHATSAPP_TEMPLATE_LANG=en_US          # must match the approved template's language
WHATSAPP_DEFAULT_COUNTRY_CODE=91      # prepended to 10-digit local numbers
WHATSAPP_VERIFY_TOKEN=spin-verify     # webhook verification handshake token
```

**Simulation mode:** if `WHATSAPP_ACCESS_TOKEN` or the phone-number id is
missing, the sender logs the rendered message to the server console instead of
calling Meta and returns `status: "simulated"`. This lets the whole flow work
in dev without real credentials.

> ⚠️ **Security note when porting:** the current `whatsapp.js` ships a hardcoded
> token/phone-id as env-var defaults. For a new project, remove those literals
> and require the env vars — a leaked token can send messages on your account.

Per-client settings fields (stored in `settings` table):

| Setting | Meaning |
|---------|---------|
| `waEnabled` (`wa_enabled`) | Master on/off for delivery for this client |
| `waPhoneNumberId` (`wa_phone_number_id`) | Overrides the env phone number id |
| `waTemplateName` (`wa_template_name`) | Which library template is the spin reward (default `scratch_card_reward`) |
| `waTemplateBody` (`wa_template_body`) | Fallback body if no library template matches |
| `brandName` | Fills the `[Business Name]` token |

---

## 3. WhatsApp API client (`backend/src/whatsapp.js`)

### Token substitution

Messages use human-readable bracket tokens in the editable body, mapped to
variables:

```js
const TOKEN_MAP = {
  "[Name]":          "name",
  "[Business Name]": "business",
  "[Prize]":         "prize",
  "[CODE]":          "code",
  "[Days]":          "days",
};

export function renderTemplate(body, vars) {
  let text = body || "";
  for (const [token, key] of Object.entries(TOKEN_MAP)) {
    text = text.replaceAll(token, vars[key] ?? "");
  }
  return text;
}
```

### Phone normalization (E.164)

```js
export function toE164(mobile) {
  const digits = String(mobile || "").replace(/\D/g, "");
  if (digits.length === 10) return `${WHATSAPP_DEFAULT_COUNTRY_CODE}${digits}`;
  return digits;
}
```

### Live vs simulation check

```js
export function isLiveConfigured(settings) {
  const phoneId = settings?.waPhoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  return Boolean(WHATSAPP_ACCESS_TOKEN && phoneId);
}
```

### Send free-form text (used by promotions/broadcasts)

Free-form text is only deliverable inside the 24-hour customer-service window.
Outside it, Meta requires an approved template.

```js
export async function sendText({ settings, mobile, text }) {
  if (!settings?.waEnabled) return { status: "disabled", text };
  if (!isLiveConfigured(settings)) {
    console.log(`[WhatsApp · SIMULATED → +${toE164(mobile)}] ${text}`);
    return { status: "simulated", text };
  }
  const phoneId = settings.waPhoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164(mobile),
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) return { status: "failed", text, error: `HTTP ${res.status}` };
  return { status: "sent", text };
}
```

Return statuses used everywhere: `sent` | `simulated` | `failed` | `disabled` | `opted-out`.

---

## 4. Approved templates

There are **two layers** of "template" — don't confuse them:

### 4a. The Meta-approved template (required for out-of-window sends)

Marketing/notification messages sent outside the 24h window MUST use a template
that has been **submitted to and approved by Meta**. The approved template has
positional placeholders `{{1}}`, `{{2}}`, `{{3}}` … and the API call passes an
**ordered** parameter array whose order must match those placeholders exactly.

```js
// Default approved template name (overridable per-client in settings)
export const DEFAULT_TEMPLATE_NAME = "jaspers_market_order_confirmation_v1";

// Ordered body params — order must match {{1}}..{{n}} in the approved template.
//   {{1}} customer name   {{2}} order / coupon code   {{3}} date
export function templateParams(vars) {
  return [vars.name, vars.code, vars.date].map((t) => ({
    type: "text",
    text: String(t ?? ""),
  }));
}
```

Sending the approved template (the spin-reward path):

```js
const payload = {
  messaging_product: "whatsapp",
  to: toE164(mobile),
  type: "template",
  template: {
    name: settings.waTemplateName || DEFAULT_TEMPLATE_NAME,
    language: { code: WHATSAPP_TEMPLATE_LANG },   // must match approved lang
    components: [{ type: "body", parameters: templateParams(vars) }],
  },
};
// POST to https://graph.facebook.com/{version}/{phoneId}/messages
```

**To approve a template with Meta:**
1. Meta Business Manager → WhatsApp Manager → **Message Templates** → Create.
2. Choose category (Marketing / Utility / Authentication), name, language.
3. Write the body using `{{1}}`, `{{2}}`, … placeholders + sample values.
4. Submit; approval is usually minutes to a few hours.
5. Put the **approved name** into the admin's "Spin-reward template name" field
   (`waTemplateName`) and ensure `WHATSAPP_TEMPLATE_LANG` matches the language.

> The number of `templateParams` and their order MUST match the approved
> template body. If you add a `{{4}}`, add a 4th entry here.

### 4b. The editable template library (admin convenience layer)

A DB-backed library of reusable message bodies using the `[Bracket]` tokens.
These drive:
- the **live preview** in the admin,
- the **promotion/broadcast** copy (sent as free-form text, in-window),
- selecting **which** template acts as the spin reward (by name).

Schema:

```sql
CREATE TABLE wa_templates (
  id         VARCHAR(40) PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,   -- normalized: lowercased, spaces→_
  body       TEXT NOT NULL,          -- contains [Name], [CODE], etc.
  created_at BIGINT NOT NULL
);
```

Seeded defaults (`backend/src/mysql.js`):

```
scratch_card_reward:
  "Hey [Name]! 🎉 You spun the wheel at [Business Name] and won: [Prize].
   Use code [CODE] on your next order. Valid for [Days] days. Reply STOP to unsubscribe."

coupon_reminder:
  "Hi [Name]! ⏰ Your coupon [CODE] from [Business Name] is still unused.
   Pop in and redeem it before it expires! Reply STOP to unsubscribe."

win_back:
  "We miss you, [Name]! 💛 Come back to [Business Name] and spin again for a
   fresh reward. Reply STOP to unsubscribe."
```

Template CRUD (`db.js`) — note names are normalized on write:

```js
name: String(name).trim().replace(/\s+/g, "_").toLowerCase().slice(0, 80)
```

Body length is capped at `MAX_MESSAGE_LEN = 1024` (WhatsApp body limit),
enforced in the routes.

---

## 5. Promotion messages (broadcasts)

A promotion = pick a library template → pick an audience segment → send.

### Audience segments

Defined identically on both sides. Backend id list (`db.js`):

```js
export const BROADCAST_SEGMENTS = ["all", "redeemed", "unused", "non-redeemed"];
```

Frontend labels (`lib/wa.js`):

| id | Label | Who |
|----|-------|-----|
| `all` | All customers | Everyone registered (minus opt-outs) |
| `redeemed` | Redeemed | Used at least one coupon |
| `unused` | Unused coupon | Hold a live (active) coupon not yet redeemed |
| `non-redeemed` | Non-redeemed | Never redeemed any coupon |

Recipient resolution (`db.getBroadcastRecipients`) groups spins/users by phone,
**drops opted-out numbers**, applies the segment filter, and attaches a relevant
coupon `code` so the `[CODE]` token can be filled per recipient.

### Sending a broadcast (`POST /api/admin/whatsapp/broadcast`)

```js
const settings = await db.getSettings();
if (!settings.waEnabled) return res.status(400)...;   // must be enabled

const recipients = await db.getBroadcastRecipients(segment);

// Bounded concurrency so we neither stall serially nor flood Meta.
const results = await mapPool(recipients, BROADCAST_CONCURRENCY /* 8 */, (r) => {
  const text = whatsapp.renderTemplate(message, {
    name: r.name || "there",
    business: settings.brandName || "our store",
    code: r.code || "",
    prize: "", days: "",
  });
  return whatsapp.sendText({ settings, mobile: r.mobile, text });
});

// Tally by status → { total, sent, simulated, failed, skipped }
```

The response tallies `sent` / `simulated` / `failed` / `skipped`
(`skipped = disabled + opted-out`), which the UI shows after sending.

> Broadcasts here go out as **free-form text** via `sendText`. That only reaches
> users inside the 24h window. For true cold marketing blasts, Meta requires an
> approved **marketing template** — wire the broadcast to `type: "template"`
> (like the reward path) with an approved template + per-recipient params.

---

## 6. Opt-outs (STOP handling)

Compliance layer — a number that replies STOP is never messaged again.

Schema:
```sql
CREATE TABLE wa_opt_outs (
  mobile     VARCHAR(20) PRIMARY KEY,   -- normalized phone
  created_at BIGINT NOT NULL
);
```

Inbound webhook watches for STOP keywords (`backend/server.js`):

```js
// GET verifies the subscription (hub.challenge handshake)
app.get("/api/whatsapp/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "spin-verify";
  if (req.query["hub.mode"] === "subscribe" &&
      req.query["hub.verify_token"] === verifyToken) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// POST delivers inbound messages
app.post("/api/whatsapp/webhook", async (req, res) => {
  res.sendStatus(200); // ack fast so Meta doesn't retry
  const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
  for (const m of messages) {
    const text = (m.text?.body || "").trim().toUpperCase();
    if (["STOP", "UNSUBSCRIBE", "STOP PROMOTIONS"].includes(text)) {
      const mobile = String(m.from || "").replace(/\D/g, "").slice(-10);
      if (mobile) await db.addOptOut(mobile);
    }
  }
});
```

Opt-outs are excluded in `getBroadcastRecipients`, and the spin-reward path
skips opted-out numbers (marking the spin `wa_status = "opted-out"`).

Register the webhook URL in Meta → WhatsApp → Configuration, subscribe to the
`messages` field, and use `WHATSAPP_VERIFY_TOKEN` as the verify token.

---

## 7. Admin API surface

All under `/api/admin` (put behind real auth before deploying — the demo has none).

| Method & path | Purpose |
|---------------|---------|
| `GET /whatsapp/status` | `{ enabled, live, mode: "live"\|"simulation" }` |
| `GET /whatsapp/optouts` | List opted-out numbers |
| `POST /whatsapp/optouts` `{mobile}` | Add opt-out |
| `DELETE /whatsapp/optouts/:mobile` | Release opt-out |
| `GET /whatsapp/templates` | List library templates |
| `POST /whatsapp/templates` `{name, body}` | Create template |
| `PUT /whatsapp/templates/:id` `{name?, body?}` | Update template |
| `DELETE /whatsapp/templates/:id` | Delete template |
| `GET /whatsapp/recipients?segment=` | `{ segment, count, recipients[] }` |
| `POST /whatsapp/broadcast` `{segment, message}` | Send promotion; returns tally |
| `POST /whatsapp/test` `{mobile, name}` | Send a sample reward message |

Public (Meta-facing): `GET/POST /api/whatsapp/webhook`.

Frontend client methods (`frontend/lib/api.js`):

```js
adminApi.getWhatsAppStatus()
adminApi.getOptOuts() / addOptOut(mobile) / removeOptOut(mobile)
adminApi.sendWhatsAppTest(mobile, name)
adminApi.getRecipients(segment)
adminApi.sendBroadcast(segment, message)
adminApi.getTemplates() / createTemplate(data) / updateTemplate(id, patch) / deleteTemplate(id)
```

---

## 8. Frontend preview helper (`frontend/lib/wa.js`)

Mirrors backend token substitution so the admin preview matches what's sent:

```js
export const TOKENS = ["[Name]", "[Business Name]", "[Prize]", "[CODE]", "[Days]"];

export const SEGMENTS = [
  { id: "all",          label: "All customers", desc: "Everyone who has registered (minus opt-outs)." },
  { id: "redeemed",     label: "Redeemed",      desc: "Customers who have used at least one coupon." },
  { id: "unused",       label: "Unused coupon", desc: "Hold a live coupon they haven't redeemed yet." },
  { id: "non-redeemed", label: "Non-redeemed",  desc: "Have never redeemed any coupon." },
];

const sampleVars = (brandName) => ({
  "[Name]": "Ravi", "[Business Name]": brandName || "our store",
  "[Prize]": "Free Coffee", "[CODE]": "CCB-7K2M", "[Days]": "14",
});

export function renderPreview(body, brandName) {
  let text = body || "";
  for (const [token, value] of Object.entries(sampleVars(brandName)))
    text = text.replaceAll(token, value);
  return text;
}
```

---

## 9. Porting checklist

1. **Env vars** — set the 6 `WHATSAPP_*` vars; **remove hardcoded token/phone
   defaults** from `whatsapp.js`.
2. **DB** — create `wa_templates` and `wa_opt_outs` tables; add `wa_status` /
   `wa_sent_at` columns to your outbound-message table; add `wa_enabled`,
   `wa_phone_number_id`, `wa_template_name`, `wa_template_body` to settings.
3. **Copy** `whatsapp.js` (adapt token map / templateParams to your fields).
4. **Meta template** — create + approve your template; set its name in
   `waTemplateName` and align `WHATSAPP_TEMPLATE_LANG`.
5. **Routes** — mount admin template/opt-out/recipient/broadcast/test routes and
   the public webhook (GET verify + POST STOP handling).
6. **Segments** — keep `BROADCAST_SEGMENTS` in sync between `db.js` and `wa.js`;
   adapt `getBroadcastRecipients` filters to your data model.
7. **Frontend** — copy `wa.js`, the three admin components, and the `api.js`
   methods; wire the components into your admin nav.
8. **Webhook** — register the URL + verify token in Meta and subscribe to
   `messages`.
9. **Auth** — protect `/api/admin/*` before production.
10. **Marketing blasts** — if you need out-of-window promotions, switch the
    broadcast from `sendText` to an approved marketing template.
