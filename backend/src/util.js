// Small shared helpers.

// Normalize any phone input to the bare last-10-digit local number, so the
// same number compares equal everywhere it is stored or looked up
// (users, spins, opt-outs).
export const normalizeMobile = (m) => String(m || "").replace(/\D/g, "").slice(-10);

// Customer names are shown in the admin tables and interpolated into WhatsApp
// templates, so keep them short and free of control characters.
export const NAME_MAX_LEN = 30;

// Cap the raw input before any regex runs, so a megabyte-long body can't make
// us do megabyte-long passes. Generous enough that no real name is affected.
const NAME_INPUT_CAP = NAME_MAX_LEN * 10;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Strip control chars, collapse whitespace, and clamp to NAME_MAX_LEN.
 * Clamping counts code points, so an astral character costs one character
 * rather than two and a surrogate pair is never split in half.
 *
 * frontend/lib/validation.js mirrors this exactly — change both together.
 */
export const normalizeName = (n) => {
  const cleaned = String(n ?? "")
    .slice(0, NAME_INPUT_CAP)
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  // .trim() again because the clamp may leave a trailing space.
  return Array.from(cleaned).slice(0, NAME_MAX_LEN).join("").trim();
};

/**
 * Validate an already-normalized name.
 * Returns an error message, or null when the name is acceptable.
 */
export function validateName(name) {
  if (!name) return "Please enter your name.";
  // No minimum beyond one letter — single-character given names are legitimate.
  if (!/\p{L}/u.test(name)) return "Name must contain at least one letter.";
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u.test(name))
    return "Name can only contain letters, spaces, apostrophes, hyphens and periods.";
  return null;
}

/* ---------- Seasonal theme ---------- */
export const FESTIVAL_THEME_IDS = ["diwali", "christmas", "newyear"];
export const THEME_IDS = ["default", ...FESTIVAL_THEME_IDS];

export const PARTICLE_IDS = ["none", "snow", "confetti", "diyas", "fireworks"];

// Built-in festival looks, used as one-tap templates when the admin adds a
// festival and to synthesize list entries for databases created before the
// dynamic festivals list existed. bgFrom/bgTo are the background gradient
// stops used when no background image is uploaded.
export const FESTIVAL_PRESETS = {
  diwali: {
    name: "Diwali",
    themeColor: "#b3261e",
    accentColor: "#f5b544",
    bgFrom: "#6b2410",
    bgTo: "#180602",
    particles: "fireworks",
  },
  christmas: {
    name: "Christmas",
    themeColor: "#1a6b43",
    accentColor: "#e63946",
    bgFrom: "#0d3f2e",
    bgTo: "#04140e",
    particles: "snow",
  },
  newyear: {
    name: "New Year",
    themeColor: "#2a1f49",
    accentColor: "#d4af37",
    bgFrom: "#2a1f49",
    bgTo: "#0a0814",
    particles: "confetti",
  },
};

export const MAX_FESTIVALS = 24;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// Same cap as the brand logo upload (frontend enforces 1.5MB raw file size,
// which lands here as a slightly larger base64 string).
const MAX_THEME_BG_CHARS = 1_500_000;

/**
 * Resolves which theme is actually live right now: a scheduled festival
 * window beats the admin's manual pick while it's active, so nobody has to
 * remember to flip the skin back after the festival ends.
 * `themeConfig` is `{ [themeId]: { start: "YYYY-MM-DD", end: "YYYY-MM-DD", ... } }`.
 * Frontend lib/theme.js mirrors this exactly — change both together.
 */
export function effectiveTheme(theme, themeConfig, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  for (const id of FESTIVAL_THEME_IDS) {
    const w = themeConfig?.[id];
    if (w?.start && w?.end && today >= w.start && today <= w.end) return id;
  }
  return THEME_IDS.includes(theme) ? theme : "default";
}

/** Returns an error message, or null when the theme configuration is well-formed. */
export function validateThemeConfig(themeConfig) {  if (themeConfig == null) return null;
  if (typeof themeConfig !== "object" || Array.isArray(themeConfig)) return "Invalid theme configuration.";
  for (const [id, cfg] of Object.entries(themeConfig)) {
    if (!FESTIVAL_THEME_IDS.includes(id)) return `Unknown theme "${id}" in configuration.`;
    if (cfg == null) continue;
    if (typeof cfg !== "object") return `Invalid configuration for "${id}".`;
    const { start, end, themeColor, accentColor, bgImage, particles } = cfg;
    if (start || end) {
      if (!DATE_RE.test(start) || !DATE_RE.test(end)) return `"${id}" dates must be in YYYY-MM-DD format.`;
      if (start > end) return `"${id}"'s start date must be before its end date.`;
    }
    if (themeColor != null && !HEX_COLOR_RE.test(themeColor)) return `"${id}" theme color must be a hex color like #aabbcc.`;
    if (accentColor != null && !HEX_COLOR_RE.test(accentColor)) return `"${id}" accent color must be a hex color like #aabbcc.`;
    if (particles != null && !PARTICLE_IDS.includes(particles))
      return `"${id}" particle effect must be one of: ${PARTICLE_IDS.join(", ")}.`;
    if (bgImage != null && (typeof bgImage !== "string" || bgImage.length > MAX_THEME_BG_CHARS))
      return `"${id}" background image is too large.`;
  }
  return null;
}

/**
 * The dynamic festivals list (settings.festivals): admin-created skins, any
 * number of them, each a self-contained look —
 *   { id, name, start, end, themeColor, accentColor, bgFrom, bgTo,
 *     bgImage, particles, enabled }
 * start/end are "YYYY-MM-DD" (either may be blank = no schedule).
 *
 * Databases from before this list existed stored fixed per-festival overrides
 * in theme_config keyed by diwali/christmas/newyear, plus a manual pick in
 * settings.theme. When the festivals column has never been written (null),
 * synthesize equivalent list entries from that legacy shape so existing shops
 * keep their skins; once the admin saves the list (even empty), it's law.
 */
export function normalizeFestivals(raw, theme, themeConfig) {
  if (raw != null && raw !== "") {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [];
  }
  return FESTIVAL_THEME_IDS.map((id) => {
    const preset = FESTIVAL_PRESETS[id];
    const cfg = themeConfig?.[id] || {};
    return {
      id,
      name: preset.name,
      start: cfg.start || "",
      end: cfg.end || "",
      themeColor: cfg.themeColor || preset.themeColor,
      accentColor: cfg.accentColor || preset.accentColor,
      bgFrom: preset.bgFrom,
      bgTo: preset.bgTo,
      bgImage: cfg.bgImage || null,
      particles: cfg.particles || preset.particles,
      enabled: true,
    };
  });
}

/**
 * Which festival is live right now. A festival inside its date window wins
 * automatically (the latest-starting one, if windows overlap); outside any
 * window, the admin's manually activated festival (activeFestivalId, or the
 * legacy settings.theme pick) applies. Returns the festival plus `via`:
 * "schedule" | "manual", or null for the default brand look.
 * Frontend lib/theme.js mirrors this — change both together.
 */
export function liveFestival(settings, now = new Date()) {
  const list = (settings?.festivals || []).filter((f) => f && f.enabled !== false);
  const today = now.toISOString().slice(0, 10);
  const scheduled = list
    .filter((f) => f.start && f.end && today >= f.start && today <= f.end)
    .sort((a, b) => String(b.start).localeCompare(String(a.start)));
  if (scheduled[0]) return { ...scheduled[0], via: "schedule" };
  const manualId = settings?.activeFestivalId || settings?.theme;
  const manual = list.find((f) => f.id === manualId);
  if (manual) return { ...manual, via: "manual" };
  return null;
}

/** Returns an error message, or null when the festivals list is well-formed. */
export function validateFestivals(festivals) {
  if (festivals == null) return null;
  if (!Array.isArray(festivals)) return "Festivals must be a list.";
  if (festivals.length > MAX_FESTIVALS) return `You can keep at most ${MAX_FESTIVALS} festivals. Delete one first.`;
  const seen = new Set();
  for (const f of festivals) {
    if (!f || typeof f !== "object") return "Invalid festival entry.";
    if (!f.id || typeof f.id !== "string") return "Every festival needs an id.";
    if (seen.has(f.id)) return "Two festivals share the same id — reload and try again.";
    seen.add(f.id);
    const name = String(f.name || "").trim();
    if (!name) return "Every festival needs a name.";
    if (name.length > 60) return `Festival name "${name.slice(0, 20)}…" is too long (60 characters max).`;
    if ((f.start && !DATE_RE.test(f.start)) || (f.end && !DATE_RE.test(f.end)))
      return `"${name}" dates must be in YYYY-MM-DD format.`;
    if (f.start && f.end && f.start > f.end) return `"${name}"'s start date must be before its end date.`;
    for (const key of ["themeColor", "accentColor", "bgFrom", "bgTo"]) {
      if (f[key] != null && f[key] !== "" && !HEX_COLOR_RE.test(f[key]))
        return `"${name}" ${key} must be a hex color like #aabbcc.`;
    }
    if (f.particles != null && f.particles !== "" && !PARTICLE_IDS.includes(f.particles))
      return `"${name}" particle effect must be one of: ${PARTICLE_IDS.join(", ")}.`;
    if (f.bgImage != null && (typeof f.bgImage !== "string" || f.bgImage.length > MAX_THEME_BG_CHARS))
      return `"${name}" background image is too large.`;
  }
  return null;
}

/**
 * Run `fn` over `items` with at most `limit` in flight at once, preserving
 * result order. Keeps broadcasts from firing hundreds of simultaneous (or fully
 * serial) network calls.
 */
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
