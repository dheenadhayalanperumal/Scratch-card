// Pure motion functions: every value here is derived from a time (seconds)
// or an angle, never from state carried between frames.

/** Seeded PRNG — use instead of Math.random so every frame is reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (const ch of String(s ?? "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, p) => a + (b - a) * p;
/** 0→1 progress of `t` through the window [start, start + dur]. */
export const progress = (t, start, dur) => clamp((t - start) / dur);
export const mod = (v, m) => ((v % m) + m) % m;

export const easeOutCubic = (p) => 1 - (1 - p) ** 3;
export const easeOutQuint = (p) => 1 - (1 - p) ** 5;
export const easeInCubic = (p) => p * p * p;
export const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
export const easeOutBack = (p, s = 1.70158) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;

/* ---------- Wheel ---------- */

export const SPIN_FULL = { windup: 0.32, settle: 0.55, dur: 5.6, back: -14, overshoot: 4 };
export const SPIN_REDUCED = { windup: 0, settle: 0, dur: 1.2, back: 0, overshoot: 0 };
/** Pause between the wheel settling and the prize card appearing. */
export const REVEAL_DELAY = 1.0;

/**
 * Wheel angle `tau` seconds into a spin: a short wind-up against the spin
 * direction, a long decelerating run that slightly overshoots, then the pointer
 * catches and rocks the wheel back onto the target.
 */
export function spinAngle(tau, from, to, cfg = SPIN_FULL) {
  const { windup, settle, dur, back, overshoot } = cfg;
  if (tau <= 0) return from;
  if (tau >= dur) return to;
  if (tau < windup) return from + back * easeInOutCubic(tau / windup);
  const runEnd = dur - settle;
  if (tau < runEnd) {
    const p = (tau - windup) / (runEnd - windup);
    return lerp(from + back, to + overshoot, easeOutQuint(p));
  }
  return lerp(to + overshoot, to, easeInOutCubic((tau - runEnd) / settle));
}

/** Slow idle drift plus a small forward "tease" nudge every 4 seconds. */
export function idleOffset(tau) {
  if (tau <= 0) return 0;
  const period = 4;
  const n = Math.floor(tau / period);
  const nudge = easeOutBack(progress(tau - n * period, 2, 0.7), 2.4);
  return 3 * tau + 9 * (n + nudge);
}

/** Wheel rotation (deg) at time t for the page's current motion descriptor. */
export function wheelAngle(t, motion, reduced) {
  if (!motion) return 0;
  if (motion.kind === "spin") return spinAngle(t - motion.t0, motion.from, motion.to, motion.cfg);
  return motion.base + (reduced ? 0 : idleOffset(t - motion.since));
}

/** Times (s into the spin) when a divider passes the pointer — the tick grid. */
export function spinCrossings(from, to, step, cfg = SPIN_FULL) {
  const times = [];
  let prev = Math.floor(from / step);
  for (let ms = 1; ms <= cfg.dur * 1000; ms++) {
    const k = Math.floor(spinAngle(ms / 1000, from, to, cfg) / step);
    if (k !== prev) {
      times.push(ms / 1000);
      prev = k;
    }
  }
  return times;
}

/**
 * Pointer deflection (deg) as a pure function of wheel angle: an approaching
 * divider pushes the tip aside, and once it slips past the tip springs back.
 */
export function pointerFlex(angle, step) {
  const ph = mod(angle, step) / step; // 0 = a divider just passed
  if (ph > 0.86) return -20 * easeInCubic((ph - 0.86) / 0.14);
  return -20 * Math.exp(-ph * 28) * Math.cos(ph * 40);
}

/** Index of the segment under the pointer at a given wheel angle. */
export function segmentAtPointer(angle, count) {
  if (!count) return -1;
  return Math.floor(mod(-angle, 360) / (360 / count)) % count;
}

/** Rotation that lands segment `index` centred under the pointer, ≥6 turns past `from`. */
export function spinTarget(from, index, count, seed) {
  const step = 360 / count;
  const targetMod = mod(360 - (index * step + step / 2), 360);
  const delta = mod(targetMod - mod(from, 360), 360);
  const jitter = (mulberry32(seed)() - 0.5) * (step - 16);
  return from + 360 * 6 + delta + jitter;
}

/* ---------- Text ---------- */

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Code that resolves left to right out of seeded scramble noise. */
export function scrambleText(text, tau, { start = 0, stagger = 0.06, hold = 0.25 } = {}) {
  return Array.from(String(text || ""))
    .map((ch, i) => {
      if (!/[A-Z0-9]/i.test(ch)) return ch;
      const settleAt = start + hold + i * stagger;
      if (tau >= settleAt) return ch;
      if (tau < start) return " ";
      const rnd = mulberry32(i * 7919 + Math.floor(tau * 24))();
      return GLYPHS[Math.floor(rnd * GLYPHS.length)];
    })
    .join("");
}
