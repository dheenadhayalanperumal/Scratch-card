// Seasonal skins for the public scratch page.
//
// Festivals are dynamic now: the admin creates any number of them in
// Branding, each a self-contained look —
//   { id, name, start, end, themeColor, accentColor, bgFrom, bgTo,
//     bgImage, particles, enabled }
// A festival inside its start/end date window goes live automatically; the
// admin can also activate one manually. liveFestival() resolves which one is
// live, festivalStyle() turns it into concrete colors/background/effect.
// Mirrors liveFestival()/normalizeFestivals() in backend/src/util.js.
//
// The fixed diwali/christmas/newyear presets below survive only as one-tap
// templates for new festivals and as the fallback for old settings shapes.

export const PARTICLE_IDS = ["none", "snow", "confetti", "diyas", "fireworks"];
export const PARTICLE_LABELS = {
  none: "None",
  snow: "Snowfall",
  confetti: "Confetti",
  diyas: "Floating diyas",
  fireworks: "Fireworks sparkle",
};

// One-tap starting points when adding a festival. `background` is kept for
// the legacy resolveThemeStyle() below; new code uses bgFrom/bgTo.
export const FESTIVAL_TEMPLATES = {
  custom: {
    name: "My festival",
    themeColor: "#7c3aed",
    accentColor: "#f5b544",
    bgFrom: "#2a1f49",
    bgTo: "#0a0814",
    particles: "confetti",
  },
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

/**
 * Which festival is live right now: one inside its date window wins
 * automatically (latest-starting when windows overlap); otherwise the
 * manually activated one (settings.activeFestivalId). Returns the festival
 * with `via: "schedule" | "manual"`, or null for the default brand look.
 * The server precomputes this into settings.liveFestival on /api/config;
 * the admin preview calls this directly on the raw settings.
 */
export function liveFestival(settings, now = new Date()) {
  if (settings?.liveFestival) return settings.liveFestival;
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

/** Turns a live festival into the concrete style the scratch page applies. */
export function festivalStyle(f) {
  if (!f) return null;
  const from = f.bgFrom || f.themeColor || "#2a1f49";
  const to = f.bgTo || "#0a0814";
  return {
    name: f.name,
    themeColor: f.themeColor,
    accentColor: f.accentColor,
    background: f.bgImage
      ? `url("${f.bgImage}") center / cover no-repeat`
      : `radial-gradient(circle at 50% -10%, ${from} 0%, ${to} 78%)`,
    particles: f.particles || "none",
  };
}

/* ---- Legacy fixed-theme helpers (pre-dynamic settings shapes) ---- */

export const FESTIVAL_THEME_IDS = ["diwali", "christmas", "newyear"];
export const THEME_IDS = ["default", ...FESTIVAL_THEME_IDS];

export const THEME_LABELS = {
  default: "Default (brand colors)",
  diwali: "Diwali",
  christmas: "Christmas",
  newyear: "New Year",
};

export const THEME_PRESETS = Object.fromEntries(
  FESTIVAL_THEME_IDS.map((id) => {
    const t = FESTIVAL_TEMPLATES[id];
    return [
      id,
      {
        background: `radial-gradient(circle at 50% -10%, ${t.bgFrom} 0%, ${t.bgTo} 100%)`,
        themeColor: t.themeColor,
        accentColor: t.accentColor,
        particles: t.particles,
      },
    ];
  })
);

export function effectiveTheme(theme, themeConfig, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  for (const id of FESTIVAL_THEME_IDS) {
    const w = themeConfig?.[id];
    if (w?.start && w?.end && today >= w.start && today <= w.end) return id;
  }
  return THEME_IDS.includes(theme) ? theme : "default";
}

export function resolveThemeStyle(themeId, themeConfig) {
  const preset = themeId && themeId !== "default" ? THEME_PRESETS[themeId] : null;
  if (!preset) return null;
  const cfg = themeConfig?.[themeId] || {};
  return {
    themeColor: cfg.themeColor || preset.themeColor,
    accentColor: cfg.accentColor || preset.accentColor,
    background: cfg.bgImage ? `url("${cfg.bgImage}") center / cover no-repeat` : preset.background,
    particles: cfg.particles || preset.particles,
  };
}
