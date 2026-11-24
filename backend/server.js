import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import {
  createSession, getSession, rotateOtp,
  createAdminOtpSession, getAdminOtpSession, rotateAdminOtp, dropAdminOtpSession,
  issueAdminToken, checkAdminToken, revokeAdminToken,
} from "./src/store.js";
import { initDb } from "./src/mysql.js";
import * as db from "./src/db.js";
import { BROADCAST_SEGMENTS } from "./src/db.js";
import * as whatsapp from "./src/whatsapp.js";
import {
  normalizeMobile,
  normalizeName,
  validateName,
  mapPool,
  THEME_IDS,
  effectiveTheme,
  validateThemeConfig,
  liveFestival,
  validateFestivals,
} from "./src/util.js";

const app = express();
const PORT = process.env.PORT || 4000;

// Input bounds (the API has no auth in this demo, so guard payload sizes).
const MAX_MESSAGE_LEN = 1024; // WhatsApp body limit
const MAX_LOGO_CHARS = 1_500_000; // ~1.1MB data URL, matches the client-side cap
const BROADCAST_CONCURRENCY = 8;
const MAX_SEGMENTS = 24; // a wheel this big is already unreadable

// Text column widths from the schema in src/mysql.js. Without these checks an
// over-long value reaches MySQL and comes back as error 1406, which `wrap`
// turns into an opaque 500 instead of a message the admin can act on.
const FIELD_LIMITS = {
  settings: {
    brandName: 120, themeColor: 20, accentColor: 20, logoText: 60,
    tagline: 160, waPhoneNumberId: 40, waTemplateName: 80,
  },
  coupon: { title: 120, product: 200, codePrefix: 12, staticCode: 60, codeType: 12 },
  segment: { label: 120, color: 20 },
};

// `maxSpinsPer` drives the spin-limit window at /api/spin. An unrecognised
// value would leave `windowMs` undefined and silently disable the limit.
const SPIN_LIMITS = ["day", "week", "unlimited"];

/** Returns an error message for the first out-of-bounds field, else null. */
function checkFields(body, limits) {
  for (const [key, max] of Object.entries(limits)) {
    const value = body?.[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return `"${key}" must be text.`;
    if (value.trim().length > max) return `"${key}" is too long (max ${max} characters).`;
  }
  return null;
}

app.use(cors());
// logo + festival background images can arrive as data URLs in one
// settings PUT, so the body cap needs headroom beyond a single image.
app.use(express.json({ limit: "25mb" }));

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

// Wrap async handlers so rejected promises become 500s instead of crashing.
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ error: "Server error. Please try again." });
});

/* =====================  PUBLIC API  ===================== */

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Everything the public page needs to render itself.
app.get("/api/config", wrap(async (_req, res) => {
  const [settings, segments] = await Promise.all([db.getSettings(), db.listSegments()]);
  res.json({
    // The public page gets the *live* festival (a scheduled date window wins
    // over the admin's manually activated festival) precomputed — the admin
    // screen fetches the raw list separately via /api/admin/settings.
    settings: {
      ...settings,
      theme: effectiveTheme(settings.theme, settings.themeConfig),
      liveFestival: liveFestival(settings),
    },
    segments: segments.map(({ id, label, color, image }) => ({ id, label, color, image })),
  });
}));

app.get("/api/wheel", wrap(async (_req, res) => {
  const segments = await db.listSegments();
  res.json({ segments: segments.map(({ id, label, color, image }) => ({ id, label, color, image })) });
}));

// Lets the frontend ask "is this mobile already registered?" before deciding
// whether to show the name field, without creating a session or sending an OTP.
app.get("/api/lead/check", wrap(async (req, res) => {
  const mobile = normalizeMobile(req.query.mobile);
  if (mobile.length !== 10) return res.json({ known: false });
  const existing = await db.getUserByMobile(mobile);
  res.json(existing ? { known: true, name: existing.name } : { known: false });
}));

app.post("/api/lead", wrap(async (req, res) => {
  const mobile = normalizeMobile(req.body?.mobile);
  if (mobile.length !== 10)
    return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });

  // A mobile already on file is a returning customer — reuse their stored
  // name instead of asking for (or trusting) a freshly typed one.
  const existing = await db.getUserByMobile(mobile);
  let name;
  if (existing) {
    name = existing.name;
  } else {
    name = normalizeName(req.body?.name);
    const nameError = validateName(name);
    if (nameError) return res.status(400).json({ error: nameError });
  }

  const marketingOptIn = Boolean(req.body?.marketingOptIn) && req.body.marketingOptIn !== "false";

  const user = await db.upsertUser({ name, mobile, marketingOptIn });
  const session = createSession({ name: user.name, mobile, marketingOptIn });
  session.user = user;
  console.log(`OTP for ${mobile}: ${session.otp}`);
  res.json({
    sessionId: session.id,
    mobile: session.mobile,
    devOtp: session.otp,
    name: user.name,
    isReturning: Boolean(existing),
  });
}));

app.post("/api/verify", wrap(async (req, res) => {
  const { sessionId, code } = req.body || {};
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found. Start again." });
  if (String(code) !== session.otp) return res.status(400).json({ error: "Incorrect code. Please try again." });
  session.verified = true;

  // Issue a persistent login token so this customer can return without logging in again.
  const token = crypto.randomUUID();
  if (session.user?.id) await db.setUserToken(session.user.id, token);
  session.token = token;
  res.json({ verified: true, token });
}));

// Resume a returning, already-verified customer from their saved token.
// Hands back a fresh verified session so they can spin without form/OTP again.
app.get("/api/me", wrap(async (req, res) => {
  const user = await db.getUserByToken(req.query.token);
  if (!user) return res.status(404).json({ error: "Session expired. Please sign in again." });
  const session = createSession({ name: user.name, mobile: user.mobile, marketingOptIn: user.marketingOptIn });
  session.verified = true;
  session.user = user;
  session.token = req.query.token;
  res.json({ sessionId: session.id, name: user.name, mobile: user.mobile });
}));

// The signed-in customer's claimed coupons (all statuses) for the wallet view.
app.get("/api/my-coupons", wrap(async (req, res) => {
  const user = await db.getUserByToken(req.query.token);
  if (!user) return res.status(404).json({ error: "Session expired. Please sign in again." });
  const settings = await db.getSettings();
  const coupons = (await db.listCouponsByMobile(user.mobile)).map((c) => ({
    ...c,
    store: settings.brandName,
    validUntil: fmtDate(c.expiresAt),
    wonOn: fmtDate(c.spunAt),
  }));
  res.json({ coupons });
}));

app.post("/api/resend", (req, res) => {
  const { sessionId } = req.body || {};
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found. Start again." });
  const otp = rotateOtp(session);
  console.log(`Resent OTP for ${session.mobile}: ${otp}`);
  res.json({ resent: true, devOtp: otp });
});

app.post("/api/spin", wrap(async (req, res) => {
  const { sessionId } = req.body || {};
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found. Start again." });
  if (!session.verified) return res.status(403).json({ error: "Verify your number first." });
  if (session.reward) return res.json(session.reward);

  // Enforce the "max spins per customer" campaign rule (once per day / week / unlimited).
  const settingsForLimit = await db.getSettings();
  const windowMs = { day: 86400000, week: 7 * 86400000 }[settingsForLimit.maxSpinsPer];
  if (windowMs) {
    const used = await db.countSpinsByMobileSince(session.mobile, Date.now() - windowMs);
    if (used >= 1) {
      const when = settingsForLimit.maxSpinsPer === "day" ? "today" : "this week";
      return res.status(429).json({ error: `You've already played ${when}. Come back later for another chance!` });
    }
  }

  const segment = await db.pickSegment();
  if (!segment) return res.status(500).json({ error: "No scratch-card prizes configured." });
  const spin = await db.recordSpin({ user: session.user, segment });
  const settings = await db.getSettings();
  const reward = {
    index: spin.segmentIndex,
    label: spin.couponTitle,
    product: spin.product,
    isWin: spin.isWin,
    code: spin.code,
    store: settings.brandName,
    validUntil: fmtDate(spin.expiresAt),
  };
  session.reward = reward;

  // WhatsApp delivery layer (PRD §9): send prize confirmation + coupon code on a win.
  if (spin.isWin) {
    const optedOut = await db.isOptedOut(session.mobile);
    if (optedOut) {
      await db.setSpinWhatsApp(spin.id, "opted-out");
    } else {
      // Use the library template named in settings (falls back to the settings body).
      const tpl = await db.getTemplateByName(settings.waTemplateName);
      const result = await whatsapp.sendSpinReward({
        settings,
        body: tpl?.body,
        name: spin.userName,
        mobile: session.mobile,
        prize: spin.couponTitle,
        code: spin.code,
        days: settings && spin.expiresAt ? Math.round((spin.expiresAt - spin.spunAt) / 86400000) : "",
        date: reward.validUntil,
      });
      const sent = result.status === "sent" || result.status === "simulated";
      await db.setSpinWhatsApp(spin.id, result.status, sent ? Date.now() : null);
      reward.whatsapp = result.status;
    }
  }

  res.json(reward);
}));

/* =====================  WHATSAPP WEBHOOK  =====================
   Meta calls these. GET verifies the subscription; POST delivers inbound
   messages — we watch for STOP/UNSUBSCRIBE to honour opt-out (PRD §9.2). */
app.get("/api/whatsapp/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "scratch-verify";
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === verifyToken) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/api/whatsapp/webhook", wrap(async (req, res) => {
  // Always 200 quickly so Meta doesn't retry; process opt-out keywords inline.
  res.sendStatus(200);
  try {
    const messages =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
    for (const m of messages) {
      const text = (m.text?.body || "").trim().toUpperCase();
      if (["STOP", "UNSUBSCRIBE", "STOP PROMOTIONS"].includes(text)) {
        const mobile = String(m.from || "").replace(/\D/g, "").slice(-10);
        if (mobile) {
          await db.addOptOut(mobile);
          console.log(`[WhatsApp] opt-out recorded for ${mobile}`);
        }
      }
    }
  } catch (e) {
    console.error("[WhatsApp] webhook error:", e.message);
  }
}));

/* =====================  ADMIN API  =====================
   OTP login (same method as customers): POST /auth/request sends a 4-digit
   code to an admin mobile, POST /auth/verify exchanges it for a 12h bearer
   token. Every other /api/admin/* route requires that token.
   Admin numbers come from ADMIN_MOBILES in backend/.env (comma-separated).
   When it's unset the login runs in open demo mode — any number may request
   a code — so set ADMIN_MOBILES before exposing this beyond your own LAN. */
const admin = express.Router();

const ADMIN_MOBILES = (process.env.ADMIN_MOBILES || "")
  .split(",")
  .map((m) => normalizeMobile(m))
  .filter((m) => m.length === 10);
if (ADMIN_MOBILES.length === 0) {
  console.warn("[AdminAuth] ADMIN_MOBILES is not set — admin OTP login is in OPEN DEMO MODE (any mobile can sign in). Set ADMIN_MOBILES in backend/.env to restrict it.");
}
const adminBearer = (req) => {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : req.headers["x-admin-token"] || null;
};

admin.post("/auth/request", (req, res) => {
  const mobile = normalizeMobile(req.body?.mobile);
  if (mobile.length !== 10) return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });
  if (ADMIN_MOBILES.length > 0 && !ADMIN_MOBILES.includes(mobile))
    return res.status(403).json({ error: "This number isn't registered as an admin. Ask the shop owner to add it." });
  const session = createAdminOtpSession(mobile);
  console.log(`Admin OTP for ${mobile}: ${session.otp}`);
  res.json({ sessionId: session.id, mobile, devOtp: session.otp });
});

admin.post("/auth/verify", (req, res) => {
  const { sessionId, code } = req.body || {};
  const session = getAdminOtpSession(sessionId);
  if (!session) return res.status(404).json({ error: "Code expired or not requested. Enter your number again." });
  if (String(code) !== session.otp) {
    session.attempts += 1;
    if (session.attempts >= 5) {
      dropAdminOtpSession(session.id);
      return res.status(400).json({ error: "Too many wrong tries. Request a fresh code." });
    }
    return res.status(400).json({ error: "Incorrect code. Please try again." });
  }
  dropAdminOtpSession(session.id);
  res.json({ token: issueAdminToken(session.mobile), mobile: session.mobile });
});

admin.post("/auth/resend", (req, res) => {
  const session = getAdminOtpSession(req.body?.sessionId);
  if (!session) return res.status(404).json({ error: "Code expired or not requested. Enter your number again." });
  const otp = rotateAdminOtp(session);
  console.log(`Resent admin OTP for ${session.mobile}: ${otp}`);
  res.json({ resent: true, devOtp: otp });
});

admin.get("/auth/me", (req, res) => {
  const entry = checkAdminToken(adminBearer(req));
  if (!entry) return res.status(401).json({ error: "Admin session expired. Sign in again." });
  res.json({ mobile: entry.mobile });
});

// Everything below this line needs a valid admin token.
admin.use((req, res, next) => {
  const entry = checkAdminToken(adminBearer(req));
  if (!entry) return res.status(401).json({ error: "Admin session expired. Sign in again." });
  req.adminMobile = entry.mobile;
  next();
});

admin.post("/auth/logout", (req, res) => {
  revokeAdminToken(adminBearer(req));
  res.json({ ok: true });
});

admin.get("/settings", wrap(async (_req, res) => res.json(await db.getSettings())));
admin.put("/settings", wrap(async (req, res) => {
  const patch = req.body || {};
  if (typeof patch.logoImage === "string" && patch.logoImage.length > MAX_LOGO_CHARS)
    return res.status(413).json({ error: "Logo image is too large." });
  if (typeof patch.waTemplateBody === "string" && patch.waTemplateBody.length > MAX_MESSAGE_LEN)
    return res.status(400).json({ error: `Template is too long (max ${MAX_MESSAGE_LEN} characters).` });
  const fieldError = checkFields(patch, FIELD_LIMITS.settings);
  if (fieldError) return res.status(400).json({ error: fieldError });
  if (patch.maxSpinsPer !== undefined && !SPIN_LIMITS.includes(patch.maxSpinsPer))
    return res.status(400).json({ error: `Spin limit must be one of: ${SPIN_LIMITS.join(", ")}.` });
  if (patch.wheelSize !== undefined && !(Number(patch.wheelSize) >= 120 && Number(patch.wheelSize) <= 1000))
    return res.status(400).json({ error: "Card size must be between 120 and 1000." });
  if (patch.theme !== undefined && !THEME_IDS.includes(patch.theme))
    return res.status(400).json({ error: `Theme must be one of: ${THEME_IDS.join(", ")}.` });
  if (patch.themeConfig !== undefined) {
    const themeConfigError = validateThemeConfig(patch.themeConfig);
    if (themeConfigError) return res.status(400).json({ error: themeConfigError });
  }
  if (patch.festivals !== undefined) {
    const festivalsError = validateFestivals(patch.festivals);
    if (festivalsError) return res.status(400).json({ error: festivalsError });
  }
  if (patch.activeFestivalId !== undefined && patch.activeFestivalId !== null && typeof patch.activeFestivalId !== "string")
    return res.status(400).json({ error: "Active festival must be a festival id or null." });
  res.json(await db.updateSettings(patch));
}));

admin.get("/coupons", wrap(async (_req, res) => res.json(await db.listCoupons())));
admin.post("/coupons", wrap(async (req, res) => {
  const body = req.body || {};
  if (!String(body.title || "").trim()) return res.status(400).json({ error: "Coupon needs a title." });
  const fieldError = checkFields(body, FIELD_LIMITS.coupon);
  if (fieldError) return res.status(400).json({ error: fieldError });
  res.status(201).json(await db.createCoupon(body));
}));
admin.put("/coupons/:id", wrap(async (req, res) => {
  const fieldError = checkFields(req.body || {}, FIELD_LIMITS.coupon);
  if (fieldError) return res.status(400).json({ error: fieldError });
  const c = await db.updateCoupon(req.params.id, req.body || {});
  if (!c) return res.status(404).json({ error: "Coupon not found." });
  res.json(c);
}));
admin.delete("/coupons/:id", wrap(async (req, res) => {
  await db.deleteCoupon(req.params.id);
  res.json({ deleted: true });
}));

admin.get("/segments", wrap(async (_req, res) => res.json(await db.listSegments())));
admin.put("/segments", wrap(async (req, res) => {
  const segments = Array.isArray(req.body?.segments) ? req.body.segments : [];
  if (segments.length < 2) return res.status(400).json({ error: "A scratch card needs at least 2 prizes." });
  // saveSegments does one round-trip per segment, so cap the count.
  if (segments.length > MAX_SEGMENTS)
    return res.status(400).json({ error: `A scratch card can have at most ${MAX_SEGMENTS} prizes.` });
  for (const s of segments) {
    if (!String(s?.label || "").trim()) return res.status(400).json({ error: "Every segment needs a label." });
    const fieldError = checkFields(s, FIELD_LIMITS.segment);
    if (fieldError) return res.status(400).json({ error: fieldError });
    if (typeof s.image === "string" && s.image.length > MAX_LOGO_CHARS)
      return res.status(413).json({ error: `Image for "${s.label}" is too large.` });
  }
  res.json(await db.saveSegments(segments));
}));

admin.get("/users", wrap(async (_req, res) => {
  const [allUsers, spins] = await Promise.all([db.listUsers(), db.listSpins()]);
  const users = allUsers.map((u) => {
    const userSpins = spins.filter((s) => s.userId === u.id);
    return { ...u, spinCount: userSpins.length, lastSpin: userSpins.at(-1) || null };
  });
  res.json(users);
}));

admin.get("/spins", wrap(async (_req, res) => res.json(await db.listSpins())));
admin.patch("/spins/:id", wrap(async (req, res) => {
  const spin = await db.updateSpinStatus(req.params.id, req.body?.status);
  if (!spin) return res.status(404).json({ error: "Play not found." });
  res.json(spin);
}));

/* ---------- Counter redemption: scan a coupon QR (or type the code) ---------- */
// Wallet QRs encode `SPIN1:<spinId>:<code>` so a claim targets one customer's
// coupon even when a static code was issued to many people. Raw codes (older
// QRs, WhatsApp messages, read-aloud) are accepted too.
function parseClaimText(raw) {
  const text = String(raw || "").trim();
  if (!text) return {};
  const m = text.match(/^(?:SPIN1|SPIN-REDEEM):([^:\s]+):(.+)$/i);
  if (m) return { spinId: m[1], code: m[2].trim() };
  // A pasted wallet link or payload that merely contains the marker.
  const embedded = text.match(/(?:SPIN1|SPIN-REDEEM):([^:\s]+):([A-Za-z0-9-]+)/i);
  if (embedded) return { spinId: embedded[1], code: embedded[2] };
  return { code: text.replace(/\s/g, "").toUpperCase() };
}

const claimLookup = wrap(async (req, res) => {
  const { spinId, code } = parseClaimText(req.body?.text ?? req.body?.code ?? req.query.text ?? req.query.code ?? req.query.q);
  if (!spinId && !code) return res.status(400).json({ error: "Enter or scan a coupon code first." });

  if (spinId) {
    const claim = await db.findClaimById(spinId);
    if (!claim) return res.status(404).json({ error: "Coupon not found. Check the code and try again." });
    if (code && claim.code?.replace(/\s/g, "").toUpperCase() !== code.replace(/\s/g, "").toUpperCase())
      return res.status(400).json({ error: "This QR doesn't match its coupon code. Ask the customer to reopen their coupon." });
    return res.json({ found: true, coupon: claim });
  }

  const matches = await db.findClaimsByCode(code);
  if (matches.length === 0)
    return res.status(404).json({ error: `No coupon found for code ${code}. Check the code and try again.` });
  if (matches.length > 1) return res.json({ found: true, ambiguous: true, matches });
  res.json({ found: true, coupon: matches[0] });
});
admin.get("/redeem/lookup", claimLookup);
admin.post("/redeem/lookup", claimLookup);

admin.post("/redeem/claim", wrap(async (req, res) => {
  const spinId = String(req.body?.spinId || "").trim();
  if (!spinId) return res.status(400).json({ error: "Pick a coupon to approve first." });
  const { outcome, claim } = await db.claimSpin(spinId);
  if (outcome === "not-found") return res.status(404).json({ error: "Coupon not found." });
  if (outcome === "already-redeemed")
    return res.status(409).json({ error: "This coupon was already redeemed.", coupon: claim });
  if (outcome === "expired")
    return res.status(409).json({ error: "This coupon has expired and can't be claimed.", coupon: claim });
  res.json({ claimed: true, coupon: claim });
}));

/* ---------- WhatsApp module ---------- */
// Live vs simulation status, so the admin knows whether real sends happen.
admin.get("/whatsapp/status", wrap(async (_req, res) => {
  const settings = await db.getSettings();
  res.json({
    enabled: settings.waEnabled,
    live: whatsapp.isLiveConfigured(settings),
    mode: whatsapp.isLiveConfigured(settings) ? "live" : "simulation",
  });
}));

admin.get("/whatsapp/optouts", wrap(async (_req, res) => res.json(await db.listOptOuts())));
admin.post("/whatsapp/optouts", wrap(async (req, res) => {
  const mobile = String(req.body?.mobile || "").replace(/\D/g, "").slice(-10);
  if (mobile.length !== 10) return res.status(400).json({ error: "Enter a valid 10-digit number." });
  await db.addOptOut(mobile);
  res.status(201).json({ mobile });
}));
admin.delete("/whatsapp/optouts/:mobile", wrap(async (req, res) => {
  await db.removeOptOut(String(req.params.mobile).replace(/\D/g, "").slice(-10));
  res.json({ removed: true });
}));

/* ---------- WhatsApp template library ---------- */
admin.get("/whatsapp/templates", wrap(async (_req, res) => res.json(await db.listTemplates())));
admin.post("/whatsapp/templates", wrap(async (req, res) => {
  const tplName = String(req.body?.name || "").trim();
  if (!tplName) return res.status(400).json({ error: "Template needs a name." });
  if (tplName.length > 80) return res.status(400).json({ error: "Template name is too long (max 80 characters)." });
  if (String(req.body?.body || "").length > MAX_MESSAGE_LEN)
    return res.status(400).json({ error: `Template is too long (max ${MAX_MESSAGE_LEN} characters).` });
  res.status(201).json(await db.createTemplate(req.body || {}));
}));
admin.put("/whatsapp/templates/:id", wrap(async (req, res) => {
  if (typeof req.body?.body === "string" && req.body.body.length > MAX_MESSAGE_LEN)
    return res.status(400).json({ error: `Template is too long (max ${MAX_MESSAGE_LEN} characters).` });
  const t = await db.updateTemplate(req.params.id, req.body || {});
  if (!t) return res.status(404).json({ error: "Template not found." });
  res.json(t);
}));
admin.delete("/whatsapp/templates/:id", wrap(async (req, res) => {
  await db.deleteTemplate(req.params.id);
  res.json({ deleted: true });
}));

// How many customers a segment would reach (opt-outs already excluded).
admin.get("/whatsapp/recipients", wrap(async (req, res) => {
  const segment = String(req.query.segment || "all");
  if (!BROADCAST_SEGMENTS.includes(segment)) return res.status(400).json({ error: "Unknown segment." });
  const recipients = await db.getBroadcastRecipients(segment);
  res.json({ segment, count: recipients.length, recipients: recipients.map((r) => ({ mobile: r.mobile, name: r.name })) });
}));

// Broadcast a message to a customer segment. Supports [Name], [Business Name], [CODE] tokens.
admin.post("/whatsapp/broadcast", wrap(async (req, res) => {
  const segment = String(req.body?.segment || "");
  const message = String(req.body?.message || "").trim();
  if (!BROADCAST_SEGMENTS.includes(segment)) return res.status(400).json({ error: "Unknown segment." });
  if (!message) return res.status(400).json({ error: "Message cannot be empty." });
  if (message.length > MAX_MESSAGE_LEN)
    return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LEN} characters).` });

  const settings = await db.getSettings();
  if (!settings.waEnabled) return res.status(400).json({ error: "WhatsApp delivery is disabled in settings." });

  const recipients = await db.getBroadcastRecipients(segment);
  // Send with bounded concurrency so we neither stall serially nor flood Meta.
  const results = await mapPool(recipients, BROADCAST_CONCURRENCY, (r) => {
    const text = whatsapp.renderTemplate(message, {
      name: r.name || "there",
      business: settings.brandName || "our store",
      code: r.code || "",
      prize: "",
      days: "",
    });
    return whatsapp.sendText({ settings, mobile: r.mobile, text });
  });

  const tally = {};
  for (const r of results) tally[r.status] = (tally[r.status] || 0) + 1;
  res.json({
    segment,
    total: recipients.length,
    sent: tally.sent || 0,
    simulated: tally.simulated || 0,
    failed: tally.failed || 0,
    skipped: (tally.disabled || 0) + (tally["opted-out"] || 0),
  });
}));

// Send a test reward message with the current template + settings.
admin.post("/whatsapp/test", wrap(async (req, res) => {
  const mobile = String(req.body?.mobile || "").replace(/\D/g, "").slice(-10);
  if (mobile.length !== 10) return res.status(400).json({ error: "Enter a valid 10-digit number." });
  const settings = await db.getSettings();
  const result = await whatsapp.sendSpinReward({
    settings,
    name: normalizeName(req.body?.name) || "there",
    mobile,
    prize: "Free Coffee",
    code: "TEST-1234",
    days: 14,
  });
  res.json(result);
}));

admin.get("/stats", wrap(async (_req, res) => res.json(await db.stats())));

app.use("/api/admin", admin);

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Scratch-to-Win backend listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("\n✖ Could not initialize MySQL database.");
    console.error(`  ${err.code || ""} ${err.message}`);
    console.error("  Check that MySQL is running and the DB_* env vars are correct.\n");
    process.exit(1);
  });
