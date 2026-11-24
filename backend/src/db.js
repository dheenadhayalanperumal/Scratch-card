import crypto from "node:crypto";
import { query } from "./mysql.js";
import { normalizeMobile, normalizeFestivals } from "./util.js";

// Segment ids a broadcast can target — shared with the API layer so the list
// can't drift between validation and the recipient query.
export const BROADCAST_SEGMENTS = ["all", "redeemed", "unused", "non-redeemed"];

export const uid = (p = "id") => `${p}-${crypto.randomUUID().slice(0, 8)}`;

/* ---------- mappers (snake_case row -> camelCase api shape) ---------- */
const mapSettings = (r) => ({
  brandName: r.brand_name,
  themeColor: r.theme_color,
  accentColor: r.accent_color,
  logoText: r.logo_text,
  logoImage: r.logo_image,
  wheelSize: r.wheel_size,
  tagline: r.tagline,
  maxSpinsPer: r.max_spins_per || "unlimited",
  waEnabled: Boolean(r.wa_enabled),
  waPhoneNumberId: r.wa_phone_number_id || "",
  waTemplateName: r.wa_template_name || "scratch_card_reward",
  waTemplateBody: r.wa_template_body || "",
  // Seasonal skin: the admin's manual pick, plus per-festival overrides
  // (colors / bg image / particle effect / auto-activate date window) — see
  // effectiveTheme()/resolveThemeStyle() in util.js and frontend/lib/theme.js.
  theme: r.theme || "default",
  themeConfig: r.theme_config ? JSON.parse(r.theme_config) : {},
  // Dynamic festivals: any number of admin-created skins, each with its own
  // name, date window, background and effect. Synthesized from the legacy
  // theme/theme_config above until the list is saved for the first time.
  festivals: normalizeFestivals(r.festivals, r.theme || "default", r.theme_config ? JSON.parse(r.theme_config) : {}),
  activeFestivalId: r.active_festival || null,
});
const mapCoupon = (r) => ({
  id: r.id,
  title: r.title,
  product: r.product,
  codePrefix: r.code_prefix,
  validityDays: r.validity_days,
  active: Boolean(r.active),
  codeType: r.code_type || "generated",
  staticCode: r.static_code || "",
});
const mapSegment = (r) => ({
  id: r.id,
  label: r.label,
  color: r.color,
  image: r.image || null,
  weight: r.weight,
  couponId: r.coupon_id,
});
const mapUser = (r) => ({
  id: r.id,
  name: r.name,
  mobile: r.mobile,
  marketingOptIn: Boolean(r.marketing_opt_in),
  createdAt: Number(r.created_at),
});
const mapSpin = (r) => ({
  id: r.id,
  userId: r.user_id,
  userName: r.user_name,
  userMobile: r.user_mobile,
  segmentId: r.segment_id,
  segmentIndex: r.segment_index,
  label: r.label,
  couponId: r.coupon_id,
  couponTitle: r.coupon_title,
  product: r.product,
  code: r.code,
  isWin: Boolean(r.is_win),
  status: r.status,
  waStatus: r.wa_status || "pending",
  waSentAt: r.wa_sent_at == null ? null : Number(r.wa_sent_at),
  spunAt: Number(r.spun_at),
  expiresAt: r.expires_at == null ? null : Number(r.expires_at),
  redeemedAt: r.redeemed_at == null ? null : Number(r.redeemed_at),
});

/* ---------- Settings ---------- */
export async function getSettings() {
  const rows = await query("SELECT * FROM settings WHERE id = 1");
  return mapSettings(rows[0]);
}
export async function updateSettings(patch) {
  const cols = {
    brandName: "brand_name",
    themeColor: "theme_color",
    accentColor: "accent_color",
    logoText: "logo_text",
    logoImage: "logo_image",
    wheelSize: "wheel_size",
    tagline: "tagline",
    maxSpinsPer: "max_spins_per",
    waEnabled: "wa_enabled",
    waPhoneNumberId: "wa_phone_number_id",
    waTemplateName: "wa_template_name",
    waTemplateBody: "wa_template_body",
    theme: "theme",
  };
  const sets = [];
  const params = {};
  for (const [key, col] of Object.entries(cols)) {
    if (patch[key] !== undefined) {
      sets.push(`${col} = :${key}`);
      params[key] = key === "waEnabled" ? (patch[key] ? 1 : 0) : patch[key];
    }
  }
  // themeConfig is an object client-side but stored as a JSON string.
  if (patch.themeConfig !== undefined) {
    sets.push("theme_config = :themeConfig");
    params.themeConfig = patch.themeConfig ? JSON.stringify(patch.themeConfig) : null;
  }
  if (patch.festivals !== undefined) {
    sets.push("festivals = :festivals");
    params.festivals = patch.festivals ? JSON.stringify(patch.festivals) : null;
  }
  if (patch.activeFestivalId !== undefined) {
    sets.push("active_festival = :activeFestivalId");
    params.activeFestivalId = patch.activeFestivalId || null;
  }
  if (sets.length) {
    await query(`UPDATE settings SET ${sets.join(", ")} WHERE id = 1`, params);
  }
  return getSettings();
}

/* ---------- Coupons ---------- */
export async function listCoupons() {
  const rows = await query("SELECT * FROM coupons ORDER BY created_at ASC");
  return rows.map(mapCoupon);
}
export async function createCoupon(data) {
  const codeType = data.codeType === "static" ? "static" : "generated";
  const coupon = {
    id: uid("c"),
    title: data.title || "Untitled reward",
    product: data.product || "",
    codePrefix: (data.codePrefix || "CCB").toUpperCase(),
    validityDays: Number(data.validityDays) || 14,
    active: data.active !== false ? 1 : 0,
    codeType,
    staticCode: codeType === "static" ? String(data.staticCode || "").trim() : "",
    createdAt: Date.now(),
  };
  await query(
    `INSERT INTO coupons (id, title, product, code_prefix, validity_days, active, code_type, static_code, created_at)
     VALUES (:id, :title, :product, :codePrefix, :validityDays, :active, :codeType, :staticCode, :createdAt)`,
    coupon
  );
  return mapCoupon({
    id: coupon.id,
    title: coupon.title,
    product: coupon.product,
    code_prefix: coupon.codePrefix,
    validity_days: coupon.validityDays,
    active: coupon.active,
    code_type: coupon.codeType,
    static_code: coupon.staticCode,
  });
}
export async function updateCoupon(id, patch) {
  const cols = {
    title: "title",
    product: "product",
    codePrefix: "code_prefix",
    validityDays: "validity_days",
    active: "active",
    codeType: "code_type",
    staticCode: "static_code",
  };
  const sets = [];
  const params = { id };
  for (const [key, col] of Object.entries(cols)) {
    if (patch[key] !== undefined) {
      sets.push(`${col} = :${key}`);
      params[key] =
        key === "codePrefix"
          ? String(patch[key]).toUpperCase()
          : key === "active"
            ? patch[key] ? 1 : 0
            : key === "codeType"
              ? patch[key] === "static" ? "static" : "generated"
              : key === "staticCode"
                ? String(patch[key] || "").trim()
                : patch[key];
    }
  }
  if (sets.length) {
    await query(`UPDATE coupons SET ${sets.join(", ")} WHERE id = :id`, params);
  }
  const rows = await query("SELECT * FROM coupons WHERE id = :id", { id });
  return rows[0] ? mapCoupon(rows[0]) : null;
}
export async function deleteCoupon(id) {
  // segments.coupon_id is ON DELETE SET NULL, so links clear automatically.
  await query("DELETE FROM coupons WHERE id = :id", { id });
}

/* ---------- Segments ---------- */
export async function listSegments() {
  const rows = await query("SELECT * FROM segments ORDER BY position ASC");
  return rows.map(mapSegment);
}
export async function saveSegments(segments) {
  // Replace the whole set, preserving incoming order via `position`.
  await query("DELETE FROM segments");
  let pos = 0;
  const saved = [];
  for (const s of segments) {
    const row = {
      id: s.id && !String(s.id).startsWith("new-") ? s.id : uid("s"),
      label: s.label || `Segment ${pos + 1}`,
      color: s.color || "#888888",
      image: s.image || null,
      weight: Math.max(0, Number(s.weight) || 0),
      couponId: s.couponId || null,
      pos: pos++,
    };
    await query(
      `INSERT INTO segments (id, label, color, image, weight, coupon_id, position)
       VALUES (:id, :label, :color, :image, :weight, :couponId, :pos)`,
      row
    );
    saved.push(mapSegment({ ...row, coupon_id: row.couponId }));
  }
  return saved;
}

/* ---------- Users ---------- */
export async function getUserByMobile(mobile) {
  const rows = await query("SELECT * FROM users WHERE mobile = :mobile LIMIT 1", {
    mobile: normalizeMobile(mobile),
  });
  return rows[0] ? mapUser(rows[0]) : null;
}
// Returning customers are recognised by mobile number: an existing row's name,
// id and token survive untouched — only marketing_opt_in is refreshed.
export async function upsertUser({ name, mobile, marketingOptIn }) {
  const user = {
    id: uid("u"),
    name,
    mobile: normalizeMobile(mobile),
    marketingOptIn: marketingOptIn ? 1 : 0,
    createdAt: Date.now(),
  };
  await query(
    `INSERT INTO users (id, name, mobile, marketing_opt_in, created_at)
     VALUES (:id, :name, :mobile, :marketingOptIn, :createdAt)
     ON DUPLICATE KEY UPDATE marketing_opt_in = VALUES(marketing_opt_in)`,
    user
  );
  const rows = await query("SELECT * FROM users WHERE mobile = :mobile LIMIT 1", { mobile: user.mobile });
  return mapUser(rows[0]);
}
export async function listUsers() {
  const rows = await query("SELECT * FROM users ORDER BY created_at ASC");
  return rows.map(mapUser);
}
/* ---------- WhatsApp templates ---------- */
const mapTemplate = (r) => ({
  id: r.id,
  name: r.name,
  body: r.body,
  createdAt: Number(r.created_at),
});
export async function listTemplates() {
  const rows = await query("SELECT * FROM wa_templates ORDER BY created_at ASC");
  return rows.map(mapTemplate);
}
export async function getTemplateByName(name) {
  const rows = await query("SELECT * FROM wa_templates WHERE name = :name LIMIT 1", { name });
  return rows[0] ? mapTemplate(rows[0]) : null;
}
export async function createTemplate({ name, body }) {
  const row = {
    id: uid("wt"),
    name: String(name || "untitled").trim().replace(/\s+/g, "_").toLowerCase().slice(0, 80),
    body: String(body || ""),
    createdAt: Date.now(),
  };
  await query("INSERT INTO wa_templates (id, name, body, created_at) VALUES (:id, :name, :body, :createdAt)", row);
  return mapTemplate({ ...row, created_at: row.createdAt });
}
export async function updateTemplate(id, patch) {
  const sets = [];
  const params = { id };
  if (patch.name !== undefined) {
    sets.push("name = :name");
    params.name = String(patch.name).trim().replace(/\s+/g, "_").toLowerCase().slice(0, 80);
  }
  if (patch.body !== undefined) {
    sets.push("body = :body");
    params.body = String(patch.body);
  }
  if (sets.length) await query(`UPDATE wa_templates SET ${sets.join(", ")} WHERE id = :id`, params);
  const rows = await query("SELECT * FROM wa_templates WHERE id = :id", { id });
  return rows[0] ? mapTemplate(rows[0]) : null;
}
export async function deleteTemplate(id) {
  await query("DELETE FROM wa_templates WHERE id = :id", { id });
}

/* ---------- WhatsApp opt-outs & delivery ---------- */
export async function isOptedOut(mobile) {
  const rows = await query("SELECT 1 FROM wa_opt_outs WHERE mobile = :mobile LIMIT 1", {
    mobile: normalizeMobile(mobile),
  });
  return rows.length > 0;
}
export async function addOptOut(mobile) {
  await query(
    "INSERT INTO wa_opt_outs (mobile, created_at) VALUES (:mobile, :now) ON DUPLICATE KEY UPDATE created_at = created_at",
    { mobile: normalizeMobile(mobile), now: Date.now() }
  );
}
export async function removeOptOut(mobile) {
  await query("DELETE FROM wa_opt_outs WHERE mobile = :mobile", { mobile: normalizeMobile(mobile) });
}
export async function listOptOuts() {
  const rows = await query("SELECT mobile, created_at FROM wa_opt_outs ORDER BY created_at DESC");
  return rows.map((r) => ({ mobile: r.mobile, createdAt: Number(r.created_at) }));
}
/**
 * Resolve broadcast recipients for a segment, de-duplicated by phone number and
 * with opted-out numbers removed. Each recipient carries a relevant coupon code
 * so messages can use the [CODE] token.
 *
 * Segments:
 *   all          — everyone who has registered
 *   redeemed     — has redeemed at least one coupon
 *   unused       — holds a live (active, unredeemed) winning coupon
 *   non-redeemed — has never redeemed any coupon
 */
export async function getBroadcastRecipients(segment) {
  const [users, spins, optOuts] = await Promise.all([listUsers(), listSpins(), listOptOuts()]);
  const blocked = new Set(optOuts.map((o) => o.mobile));

  // Group everything by phone number.
  const byMobile = new Map();
  for (const u of users) {
    if (!byMobile.has(u.mobile)) byMobile.set(u.mobile, { mobile: u.mobile, name: u.name, spins: [] });
    // Keep the most recently registered name.
    byMobile.get(u.mobile).name = u.name;
  }
  for (const s of spins) {
    if (!s.userMobile) continue;
    if (!byMobile.has(s.userMobile)) byMobile.set(s.userMobile, { mobile: s.userMobile, name: s.userName, spins: [] });
    byMobile.get(s.userMobile).spins.push(s);
  }

  const recipients = [];
  for (const r of byMobile.values()) {
    if (blocked.has(r.mobile)) continue;
    const wins = r.spins.filter((s) => s.isWin);
    const redeemed = wins.filter((s) => s.status === "redeemed");
    const unused = wins.filter((s) => s.status === "active");

    let include = false;
    let code = null;
    if (segment === "all") {
      include = true;
      code = unused.at(-1)?.code || wins.at(-1)?.code || null;
    } else if (segment === "redeemed") {
      include = redeemed.length > 0;
      code = redeemed.at(-1)?.code || null;
    } else if (segment === "unused") {
      include = unused.length > 0;
      code = unused.at(-1)?.code || null;
    } else if (segment === "non-redeemed") {
      include = redeemed.length === 0;
      code = unused.at(-1)?.code || null;
    }
    if (include) recipients.push({ mobile: r.mobile, name: r.name, code });
  }
  return recipients;
}

export async function setSpinWhatsApp(id, status, sentAt = null) {
  await query("UPDATE spins SET wa_status = :status, wa_sent_at = :sentAt WHERE id = :id", {
    id,
    status,
    sentAt,
  });
}

export async function setUserToken(userId, token) {
  await query("UPDATE users SET token = :token WHERE id = :id", { token, id: userId });
}
export async function getUserByToken(token) {
  if (!token) return null;
  const rows = await query("SELECT * FROM users WHERE token = :token LIMIT 1", { token });
  return rows[0] ? mapUser(rows[0]) : null;
}

/* ---------- Spins ---------- */
export async function pickSegment() {
  const segments = await listSegments();
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
  if (total <= 0) return segments[Math.floor(Math.random() * segments.length)];
  let roll = Math.random() * total;
  for (const s of segments) {
    roll -= Number(s.weight) || 0;
    if (roll <= 0) return s;
  }
  return segments[segments.length - 1];
}

function randomCode(prefix) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s}`;
}

export async function recordSpin({ user, segment }) {
  let coupon = null;
  if (segment.couponId) {
    const rows = await query(
      "SELECT * FROM coupons WHERE id = :id AND active = 1",
      { id: segment.couponId }
    );
    coupon = rows[0] ? mapCoupon(rows[0]) : null;
  }
  const isWin = Boolean(coupon);
  const now = Date.now();
  const segments = await listSegments();
  const spin = {
    id: uid("spin"),
    userId: user?.id || null,
    userName: user?.name || "Guest",
    userMobile: user?.mobile || "",
    segmentId: segment.id,
    segmentIndex: segments.findIndex((s) => s.id === segment.id),
    label: segment.label,
    couponId: coupon?.id || null,
    couponTitle: coupon?.title || segment.label,
    product: coupon?.product || "",
    code: !isWin
      ? null
      : coupon.codeType === "static" && coupon.staticCode
        ? coupon.staticCode
        : randomCode(coupon.codePrefix),
    isWin: isWin ? 1 : 0,
    status: isWin ? "active" : "no-win",
    // Wins start "pending" WhatsApp delivery; non-wins are not messaged.
    waStatus: isWin ? "pending" : "skipped",
    waSentAt: null,
    spunAt: now,
    expiresAt: isWin ? now + coupon.validityDays * 86400000 : null,
  };
  await query(
    `INSERT INTO spins
       (id, user_id, user_name, user_mobile, segment_id, segment_index, label,
        coupon_id, coupon_title, product, code, is_win, status, wa_status, wa_sent_at, spun_at, expires_at)
     VALUES
       (:id, :userId, :userName, :userMobile, :segmentId, :segmentIndex, :label,
        :couponId, :couponTitle, :product, :code, :isWin, :status, :waStatus, :waSentAt, :spunAt, :expiresAt)`,
    spin
  );
  return mapSpin({
    ...spin,
    user_id: spin.userId,
    user_name: spin.userName,
    user_mobile: spin.userMobile,
    segment_id: spin.segmentId,
    segment_index: spin.segmentIndex,
    coupon_id: spin.couponId,
    coupon_title: spin.couponTitle,
    is_win: spin.isWin,
    wa_status: spin.waStatus,
    wa_sent_at: spin.waSentAt,
    spun_at: spin.spunAt,
    expires_at: spin.expiresAt,
  });
}

export async function listSpins() {
  const rows = await query("SELECT * FROM spins ORDER BY spun_at ASC");
  return rows.map(mapSpin);
}

// How many times a given phone number has spun since `sinceMs` (epoch ms).
// Used to enforce the "max spins per customer" campaign rule.
export async function countSpinsByMobileSince(mobile, sinceMs) {
  const [row] = await query(
    "SELECT COUNT(*) AS n FROM spins WHERE user_mobile = :mobile AND spun_at >= :since",
    { mobile: normalizeMobile(mobile), since: sinceMs }
  );
  return Number(row.n);
}
// A customer's winning coupons, newest first, for the "My coupons" wallet.
// An active coupon past its expiry is reported as "expired".
export async function listCouponsByMobile(mobile) {
  const rows = await query(
    "SELECT * FROM spins WHERE user_mobile = :mobile AND is_win = 1 ORDER BY spun_at DESC",
    { mobile: normalizeMobile(mobile) }
  );
  const now = Date.now();
  return rows.map((r) => {
    const s = mapSpin(r);
    const expired = s.status === "expired" || (s.status === "active" && s.expiresAt && s.expiresAt < now);
    return {
      id: s.id,
      title: s.couponTitle,
      product: s.product,
      code: s.code,
      // Client looks the prize image up from /api/config's segments.
      segmentId: s.segmentId,
      status: expired ? "expired" : s.status === "redeemed" ? "redeemed" : "active",
      spunAt: s.spunAt,
      expiresAt: s.expiresAt,
    };
  });
}
export async function updateSpinStatus(id, status) {
  // Keep the claim timestamp in step with manual status changes in Records:
  // stamped when marked redeemed, cleared if it's ever moved back.
  await query(
    "UPDATE spins SET status = :status, redeemed_at = :redeemedAt WHERE id = :id",
    { id, status, redeemedAt: status === "redeemed" ? Date.now() : null }
  );
  const rows = await query("SELECT * FROM spins WHERE id = :id", { id });
  return rows[0] ? mapSpin(rows[0]) : null;
}

/* ---------- Counter redemption (QR scan / manual code) ---------- */
// A claimable coupon is one winning spin. Its *effective* status folds in
// wall-clock expiry, so an "active" row past expires_at already reads
// "expired" everywhere (same rule as listCouponsByMobile).
const effectiveClaimStatus = (s, now = Date.now()) =>
  s.status === "active" && s.expiresAt && s.expiresAt < now ? "expired" : s.status;

const mapClaim = (r, now = Date.now()) => {
  const s = mapSpin(r);
  return {
    id: s.id,
    code: s.code,
    title: s.couponTitle,
    product: s.product,
    status: effectiveClaimStatus(s, now),
    userName: s.userName,
    userMobile: s.userMobile,
    spunAt: s.spunAt,
    expiresAt: s.expiresAt,
    redeemedAt: s.redeemedAt,
  };
};

export async function findClaimById(id) {
  const rows = await query("SELECT * FROM spins WHERE id = :id AND is_win = 1 LIMIT 1", { id });
  return rows[0] ? mapClaim(rows[0]) : null;
}

// Codes are typed/spoken at counters, so match case-insensitively with
// spaces removed ("ccb - v3ht" finds CCB-V3HT). A static-code coupon can
// legitimately match several customers — callers get every match and the
// admin picks whose coupon this is.
export async function findClaimsByCode(code) {
  const rows = await query(
    "SELECT * FROM spins WHERE is_win = 1 AND UPPER(REPLACE(code, ' ', '')) = :code ORDER BY spun_at DESC",
    { code: String(code || "").toUpperCase().replace(/\s/g, "") }
  );
  return rows.map((r) => mapClaim(r));
}

/**
 * Approves a claim: active → redeemed, atomically, so two counters scanning
 * the same QR at once can't both succeed. Returns { outcome, claim } where
 * outcome is "claimed" | "already-redeemed" | "expired" | "not-found".
 */
export async function claimSpin(id) {
  const claim = await findClaimById(id);
  if (!claim) return { outcome: "not-found", claim: null };
  if (claim.status === "redeemed") return { outcome: "already-redeemed", claim };
  if (claim.status === "expired") {
    // Persist the lazy expiry so lists agree with what the counter saw.
    await query("UPDATE spins SET status = 'expired' WHERE id = :id AND status = 'active'", { id });
    return { outcome: "expired", claim };
  }
  const now = Date.now();
  const result = await query(
    `UPDATE spins SET status = 'redeemed', redeemed_at = :now
     WHERE id = :id AND status = 'active' AND (expires_at IS NULL OR expires_at > :now)`,
    { id, now }
  );
  if (!result?.affectedRows) {
    const again = await findClaimById(id);
    return { outcome: again?.status === "redeemed" ? "already-redeemed" : "expired", claim: again };
  }
  return { outcome: "claimed", claim: { ...claim, status: "redeemed", redeemedAt: now } };
}

export async function stats() {
  const [row] = await query(`
    SELECT
      (SELECT COUNT(*) FROM users)  AS users,
      (SELECT COUNT(*) FROM spins)  AS spins,
      (SELECT COUNT(*) FROM spins WHERE is_win = 1) AS wins,
      (SELECT COUNT(*) FROM spins WHERE status = 'redeemed') AS redeemed,
      (SELECT COUNT(*) FROM coupons) AS coupons
  `);
  return {
    users: Number(row.users),
    spins: Number(row.spins),
    wins: Number(row.wins),
    redeemed: Number(row.redeemed),
    coupons: Number(row.coupons),
  };
}
