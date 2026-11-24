// WhatsApp Business Cloud API (Meta) integration for the Scratch Card module.
//
// Delivery is the core distribution layer (PRD §9): after a card is played we
// send a prize confirmation + coupon code. Credentials live in env vars; the
// editable template body and per-client config live in settings.
//
// If no access token / phone-number id is configured the sender runs in
// SIMULATION mode — it renders and logs the message instead of calling Meta —
// so the demo and local dev work without real WhatsApp credentials.

const {
  WHATSAPP_ACCESS_TOKEN = "EABAHJV35Xr4BRwaRhNa9DdZBe3ZAB06Ifjc0bd9DjvzQpi417GRKaP72kdGtTuUZAcvsGK03FCCnLsj7QPZCkAyN9aCGYlEQNtC1dagagf7eBiF77MeIsZASSD8mOzZBSi6E5rZCBbbCIBRAOZAkLAdmvyeZBdwOoQhMvg1z1sZBejCQbSJqH8nfbaMvykwAYkFIZAVpLTZAHJo8zIL7i1ZC9z9jVXZBTufLZAmDHs2qS3FbqFh5jr1H1e2zqFlLN44ITDowerIPANBZCokpSqVOSpVeHUZAGJQZDZD",
  WHATSAPP_PHONE_NUMBER_ID = "1011932448680473",
  WHATSAPP_API_VERSION = "v25.0",
  WHATSAPP_TEMPLATE_LANG = "en_US",
  WHATSAPP_DEFAULT_COUNTRY_CODE = "91",
} = process.env;

// Default approved template name (overridable per-client in settings).
export const DEFAULT_TEMPLATE_NAME = "jaspers_market_order_confirmation_v1";

// "Jun 24, 2026" — matches the date format the approved template expects.
const formatDate = (ms) =>
  new Date(ms).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

export function isLiveConfigured(settings) {
  const phoneId = settings?.waPhoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  return Boolean(WHATSAPP_ACCESS_TOKEN && phoneId);
}

// Normalize a local number to E.164 digits, e.g. "9876543210" -> "919876543210".
export function toE164(mobile) {
  const digits = String(mobile || "").replace(/\D/g, "");
  if (digits.length === 10) return `${WHATSAPP_DEFAULT_COUNTRY_CODE}${digits}`;
  return digits;
}

// Fill the template placeholders. Supports both [Bracket] tokens (used in the
// editable body / preview) and returns the ordered params Meta needs for an
// approved template's body component.
const TOKEN_MAP = {
  "[Name]": "name",
  "[Business Name]": "business",
  "[Prize]": "prize",
  "[CODE]": "code",
  "[Days]": "days",
};

export function renderTemplate(body, vars) {
  let text = body || "";
  for (const [token, key] of Object.entries(TOKEN_MAP)) {
    text = text.replaceAll(token, vars[key] ?? "");
  }
  return text;
}

// Ordered body params for the Meta approved-template call. Order must match the
// {{1}}..{{n}} placeholders in the approved template. The default template
// `jaspers_market_order_confirmation_v1` takes three:
//   {{1}} customer name   {{2}} order / coupon code   {{3}} date
export function templateParams(vars) {
  return [vars.name, vars.code, vars.date].map((t) => ({
    type: "text",
    text: String(t ?? ""),
  }));
}

// Send a free-form text message (used by admin broadcasts/campaigns).
// NOTE: outside the 24h customer-service window Meta requires an approved
// template; for production marketing blasts, wire this to a template instead.
export async function sendText({ settings, mobile, text }) {
  if (!settings?.waEnabled) return { status: "disabled", text };

  if (!isLiveConfigured(settings)) {
    console.log(`\n[WhatsApp · SIMULATED → +${toE164(mobile)}]\n  ${text}\n`);
    return { status: "simulated", text };
  }

  const phoneId = settings.waPhoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneId}/messages`;
  try {
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
    if (!res.ok) {
      const err = await res.text();
      console.error(`[WhatsApp] broadcast failed (${res.status}): ${err}`);
      return { status: "failed", text, error: `HTTP ${res.status}` };
    }
    return { status: "sent", text };
  } catch (e) {
    console.error("[WhatsApp] broadcast error:", e.message);
    return { status: "failed", text, error: e.message };
  }
}

/**
 * Send the spin-reward message.
 * @returns {Promise<{status:'sent'|'simulated'|'failed'|'disabled'|'opted-out', text:string, error?:string}>}
 */
export async function sendSpinReward({ settings, name, mobile, prize, code, days, date, body }) {
  const vars = {
    name: name || "there",
    business: settings?.brandName || "our store",
    prize,
    code,
    days,
    date: date || formatDate(Date.now()),
  };
  const text = renderTemplate(body || settings?.waTemplateBody, vars);

  if (!settings?.waEnabled) return { status: "disabled", text };

  // SIMULATION mode — no real credentials. Log so it's visible in dev.
  if (!isLiveConfigured(settings)) {
    console.log(`\n[WhatsApp · SIMULATED → +${toE164(mobile)}]\n  ${text}\n`);
    return { status: "simulated", text };
  }

  const phoneId = settings.waPhoneNumberId || WHATSAPP_PHONE_NUMBER_ID;
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: toE164(mobile),
    type: "template",
    template: {
      name: settings.waTemplateName || DEFAULT_TEMPLATE_NAME,
      language: { code: WHATSAPP_TEMPLATE_LANG },
      components: [{ type: "body", parameters: templateParams(vars) }],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[WhatsApp] send failed (${res.status}): ${err}`);
      return { status: "failed", text, error: `HTTP ${res.status}` };
    }
    return { status: "sent", text };
  } catch (e) {
    console.error("[WhatsApp] send error:", e.message);
    return { status: "failed", text, error: e.message };
  }
}
