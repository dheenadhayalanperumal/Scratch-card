"use client";

import { now, onTick } from "./clock";
import { clamp, lerp, spinAngle } from "./motion";

/**
 * Haptics that follow the wheel. One pure timeline of events is built from the
 * same divider-crossing grid as the tick sounds:
 *
 *   wind-up release → a pulse per divider (short & light while fast,
 *   longer & heavier as it slows) → landing thud → win/lose pattern.
 *
 * It is then played two ways:
 * - Android (navigator.vibrate): the whole spin as ONE vibrate pattern.
 * - iPhone (no vibrate API): Safari 18+ fires a system haptic tick when an
 *   <input type="checkbox" switch> is toggled, so we toggle a hidden one at
 *   each event time on the shared clock. iOS ticks have a single fixed
 *   strength, so speed shows up as spacing rather than pulse length.
 */

// Chrome truncates vibrate patterns longer than this; we stay under it.
const MAX_ENTRIES = 99;
// The motor needs a moment between pulses or they blur into one buzz.
const MIN_REST_MS = 12;
// iOS haptic ticks closer than this merge into one, so thin harder.
const IOS_SPACING = 0.07;

const hasVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function supported() {
  return hasVibrate() || isIOS();
}

/* ---------- iOS switch-toggle haptic ---------- */

// Same technique as the `ios-haptics` library: a throwaway hidden switch in
// <head>, clicked via its label, then removed. Clicking toggles the switch,
// which makes iOS 18+ Safari play its system haptic tick.
function iosTick() {
  if (typeof document === "undefined") return;
  try {
    const label = document.createElement("label");
    label.ariaHidden = "true";
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {}
}

/* ---------- timeline ---------- */

/** Angular speed (deg/s) `tau` seconds into the spin. */
function speedAt(tau, from, to, cfg) {
  const h = 0.004;
  return Math.abs(spinAngle(tau + h, from, to, cfg) - spinAngle(tau - h, from, to, cfg)) / (2 * h);
}

/** Pure: the spin's haptic events, `{ at (s into the spin), dur (ms) }`. */
export function buildSpinEvents({ crossings, from, to, cfg, restAt, revealAt, win }, spacing = 0.04) {
  const ticks = crossings.map((c) => {
    // 0 = crawling, 1 = full speed. Fast → 8ms flicks, slow → 34ms knocks.
    const fast = clamp((speedAt(c, from, to, cfg) - 60) / 1100);
    return { at: c, dur: Math.round(lerp(34, 8, fast)) };
  });

  const accents = [];
  if (cfg.windup > 0) accents.push({ at: cfg.windup, dur: 22 }); // launch
  accents.push({ at: restAt, dur: 60 }); // landing thud
  if (win) {
    // Celebration as the prize card opens: da-da … daaa.
    [
      [0, 40],
      [0.11, 40],
      [0.24, 130],
    ].forEach(([dt, dur]) => accents.push({ at: revealAt + dt, dur }));
  } else {
    accents.push({ at: restAt + 0.3, dur: 25 });
  }

  // At top speed dividers pass every ~20ms — more than a motor can render.
  // Keep ticks at least `spacing` apart: fast stretches thin into a rumble,
  // slow ones keep every click. Accents win over colliding ticks.
  const kept = [];
  let last = -Infinity;
  for (const t of ticks) {
    if (t.at - last < spacing) continue;
    if (accents.some((a) => Math.abs(a.at - t.at) < 0.08)) continue;
    kept.push(t);
    last = t.at;
  }
  return [...accents, ...kept].sort((a, b) => a.at - b.at);
}

/** Pure: Android vibrate pattern [vibrate, pause, vibrate, …] in ms. */
export function buildSpinPattern(opts) {
  for (let spacing = 0.04; spacing < 1; spacing += 0.01) {
    const pattern = toPattern(buildSpinEvents(opts, spacing));
    if (pattern.length <= MAX_ENTRIES) return pattern;
  }
  return toPattern(buildSpinEvents({ ...opts, crossings: [] }));
}

function toPattern(events) {
  const pattern = [];
  let cursor = 0; // ms
  for (const e of events) {
    const start = Math.round(e.at * 1000);
    const gap = start - cursor;
    if (pattern.length === 0) {
      pattern.push(0, Math.max(0, gap)); // pattern must begin with a vibrate entry
    } else if (gap < MIN_REST_MS) {
      continue; // would overlap the previous pulse
    } else {
      pattern.push(gap);
    }
    pattern.push(e.dur);
    cursor = start + e.dur;
  }
  return pattern;
}

/* ---------- playback ---------- */

let stopIOS = null;

export function cancel() {
  if (hasVibrate()) navigator.vibrate(0);
  stopIOS?.();
  stopIOS = null;
}

/**
 * Light confirmation tick for the tap itself. Call synchronously inside the
 * user's tap — iOS only honours the switch haptic reliably within a gesture.
 */
export function tap() {
  if (hasVibrate()) {
    try {
      navigator.vibrate(12);
    } catch {}
  } else if (isIOS()) {
    iosTick();
  }
}

/** Start the spin's haptics; `opts` times are relative to now. */
export function scheduleSpin(opts) {
  cancel();
  if (hasVibrate()) {
    try {
      navigator.vibrate(buildSpinPattern(opts));
    } catch {}
    return;
  }
  if (!isIOS()) return;

  // Every event — even long accents — becomes one tick; for iOS, "heavier"
  // reads as a lone tick after silence, which the thinning already gives.
  const events = buildSpinEvents(opts, IOS_SPACING);
  const t0 = now();
  let next = 0;
  stopIOS = onTick((t) => {
    // Fire whatever is due; if a frame was late, play only the latest
    // overdue event rather than a burst.
    let due = -1;
    while (next < events.length && t - t0 >= events[next].at) due = next++;
    if (due >= 0) iosTick();
    if (next >= events.length) {
      stopIOS?.();
      stopIOS = null;
    }
  });
}

/* ---------- scratch card ---------- */

let lastScratchBuzz = 0;
/** Tiny grain while scratching (Android); throttled so it reads as texture. */
export function scratch() {
  if (!hasVibrate()) return;
  const t = Date.now();
  if (t - lastScratchBuzz < 70) return;
  lastScratchBuzz = t;
  try {
    navigator.vibrate(6);
  } catch {}
}

/** Cover cleared: a firm thump, plus a celebratory pattern on a win. */
export function reveal(win) {
  if (hasVibrate()) {
    try {
      navigator.vibrate(win ? [30, 60, 30, 60, 90] : [40]);
    } catch {}
  } else if (isIOS()) {
    iosTick();
  }
}
