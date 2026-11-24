"use client";

/**
 * All SFX are synthesized with Web Audio — no audio files. Hits are scheduled
 * on the audio clock at the exact times a divider passes the pointer (see
 * spinCrossings), so sound stays locked to the picture.
 *
 * Each voice is a pure builder `(ac, out, at)`, so the same code can render
 * into an OfflineAudioContext for level checks.
 */

const KEY = "scratchMuted";
let ctx = null;
let master = null;
let scheduled = [];

export function isMuted() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {}
  if (muted) cancel();
}

/** Master bus: gain into a gentle compressor so stacked voices never clip. */
export function createBus(ac) {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  const gain = ac.createGain();
  gain.gain.value = 0.6;
  gain.connect(comp).connect(ac.destination);
  return gain;
}

/** Create/resume the context. Call synchronously inside a user gesture. */
export function unlock() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = createBus(ctx);
  }
  if (ctx.state === "suspended") ctx.resume();
}

function track(node) {
  if (!ctx || node.context !== ctx) return;
  scheduled.push(node);
  node.onended = () => {
    scheduled = scheduled.filter((n) => n !== node);
  };
}

export function cancel() {
  scheduled.forEach((n) => {
    try {
      n.stop();
    } catch {}
  });
  scheduled = [];
}

/* ---------- voices ---------- */

const noiseCache = new WeakMap();
function noise(ac, seconds) {
  const key = `${seconds}`;
  let byLen = noiseCache.get(ac);
  if (!byLen) noiseCache.set(ac, (byLen = {}));
  if (byLen[key]) return byLen[key];
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  // Seeded LCG so the timbre is identical every time.
  let s = 1234567;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    data[i] = (s / 4294967296) * 2 - 1;
  }
  return (byLen[key] = buf);
}

/** Envelope helper: fast attack, exponential decay. */
function env(ac, out, at, peak, attack, decay) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(out);
  return g;
}

function osc(ac, dest, at, dur, freq, type = "sine", detune = 0) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.detune.value = detune;
  o.connect(dest);
  o.start(at);
  o.stop(at + dur + 0.05);
  track(o);
  return o;
}

/** Pointer click as a divider passes. */
export function tick(ac, out, at, gain = 0.5) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac, 0.05);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3200;
  bp.Q.value = 2.5;
  src.connect(bp).connect(env(ac, out, at, gain, 0.001, 0.035));
  src.start(at);
  src.stop(at + 0.05);
  track(src);
}

/** Bell "ding" when the wheel lands on a prize. */
export function landDing(ac, out, at) {
  const g = env(ac, out, at, 0.32, 0.004, 0.9);
  osc(ac, g, at, 1, 1318.5); // E6
  osc(ac, env(ac, out, at, 0.1, 0.004, 0.5), at, 0.6, 3955.5); // bell overtone
}

/**
 * Win fanfare, starting exactly as the "YOU WON" card opens (~1.5s):
 * brassy major-chord stab → rising sparkle arpeggio → shimmer tail.
 * Nothing else plays between the landing ding and this.
 */
export function winFanfare(ac, out, at) {
  // 1. Chord stab: C major (C4 E4 G4 C5), detuned saw pairs through a
  //    closing low-pass for a warm brass feel.
  const t = at;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(5200, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + 0.9);
  lp.connect(env(ac, out, t, 0.24, 0.012, 1.0));
  for (const f of [261.63, 329.63, 392.0, 523.25]) {
    osc(ac, lp, t, 1.05, f, "sawtooth", -7);
    osc(ac, lp, t, 1.05, f, "sawtooth", 7);
  }
  // Sub thump under the stab.
  const sub = ac.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(130.8, t);
  sub.frequency.exponentialRampToValueAtTime(65.4, t + 0.25);
  sub.connect(env(ac, out, t, 0.35, 0.005, 0.3));
  sub.start(t);
  sub.stop(t + 0.4);
  track(sub);

  // 2. Sparkle: rising arpeggio C6 E6 G6 C7 E7 G7.
  [1046.5, 1318.5, 1568.0, 2093.0, 2637.0, 3136.0].forEach((f, i) => {
    const ti = t + 0.08 + i * 0.065;
    osc(ac, env(ac, out, ti, 0.11, 0.003, 0.45), ti, 0.5, f, "triangle");
  });

  // 3. Shimmer: high-passed noise swell that tails off.
  const sh = ac.createBufferSource();
  sh.buffer = noise(ac, 1.5);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const shG = ac.createGain();
  shG.gain.setValueAtTime(0.0001, t + 0.1);
  shG.gain.exponentialRampToValueAtTime(0.06, t + 0.35);
  shG.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  sh.connect(hp).connect(shG).connect(out);
  sh.start(t + 0.1);
  sh.stop(t + 1.55);
  track(sh);
}

/** Soft descending two-note "so close". */
export function loseTone(ac, out, at) {
  osc(ac, env(ac, out, at, 0.18, 0.008, 0.28), at, 0.3, 392, "triangle");
  osc(ac, env(ac, out, at + 0.25, 0.16, 0.008, 0.5), at + 0.25, 0.55, 311.13, "triangle");
}

/**
 * Firework sounds, synthesized to stand in for the sampled lift / burst /
 * crackle recordings the classic canvas-fireworks demo plays. The demo
 * randomizes each sample's playback rate (slightly slower = deeper), so
 * these take the same liberty with filter sweeps and pitches — no two
 * shells sound identical.
 *
 * lift:      rising whoosh + a thin whistle that climbs with the comet
 * burst:     deep boom (sine drop + low-passed noise), a bright crack
 *            transient, a sizzling tail, and — for crackle/crossette
 *            shells and faintly for every shell — a scatter of delayed
 *            crackle pops
 * burstSmall: the floral / falling-leaves mini-burst (demo: burst-sm)
 * crackle:   a dedicated pop scatter (demo: crackle / crackle-sm)
 */
export function fireworkLaunch(ac, out, at) {
  const rate = 0.85 + Math.random() * 0.1; // demo lift playbackRate 0.85–0.95

  // Whoosh: band-passed noise sweeping up with the shell.
  const src = ac.createBufferSource();
  src.buffer = noise(ac, 0.6);
  src.playbackRate.value = rate;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(500 * rate, at);
  bp.frequency.exponentialRampToValueAtTime(2400 * rate, at + 0.42);
  bp.Q.value = 1.2;
  src.connect(bp).connect(env(ac, out, at, 0.16, 0.03, 0.4));
  src.start(at);
  src.stop(at + 0.48);
  track(src);

  // Whistle: a quiet sine that rises as the comet climbs, with a wobble.
  const whistle = ac.createOscillator();
  whistle.type = "sine";
  whistle.frequency.setValueAtTime(640 * rate, at);
  whistle.frequency.exponentialRampToValueAtTime(1180 * rate, at + 0.4);
  const wobble = ac.createOscillator();
  wobble.frequency.value = 28;
  const wobbleGain = ac.createGain();
  wobbleGain.gain.value = 14;
  wobble.connect(wobbleGain).connect(whistle.frequency);
  whistle.connect(env(ac, out, at, 0.045, 0.06, 0.36));
  whistle.start(at);
  whistle.stop(at + 0.46);
  wobble.start(at);
  wobble.stop(at + 0.46);
  track(whistle);
  track(wobble);
}

/** One tiny crackle pop at `at`. */
function cracklePop(ac, out, at, peak) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac, 0.04);
  src.playbackRate.value = 0.9 + Math.random() * 0.3;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2800 + Math.random() * 2200;
  src.connect(hp).connect(env(ac, out, at, peak, 0.001, 0.03 + Math.random() * 0.03));
  src.start(at);
  src.stop(at + 0.08);
  track(src);
}

/** A scatter of crackle pops over ~0.6s (the demo's crackle sound bed). */
export function fireworkCrackle(ac, out, at, count = 18, peak = 0.05) {
  for (let i = 0; i < count; i++) {
    cracklePop(ac, out, at + 0.03 + Math.random() * 0.6, peak * (0.4 + Math.random() * 0.6));
  }
}

/** Firework burst. `size` (0-1) scales depth/loudness like the demo's shell-size sound scaling. */
export function fireworkBurst(ac, out, at, size = 1, { crackle = false } = {}) {
  const rate = 0.8 + Math.random() * 0.1; // demo burst playbackRate 0.8–0.9

  // Boom body: sine dropping into the sub range.
  const sub = ac.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime((110 + size * 60) * rate, at);
  sub.frequency.exponentialRampToValueAtTime(30, at + 0.5);
  sub.connect(env(ac, out, at, 0.3 + size * 0.3, 0.004, 0.5));
  sub.start(at);
  sub.stop(at + 0.55);
  track(sub);

  // Boom air: noise through a closing low-pass.
  const boom = ac.createBufferSource();
  boom.buffer = noise(ac, 0.6);
  boom.playbackRate.value = rate;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1400, at);
  lp.frequency.exponentialRampToValueAtTime(110, at + 0.45);
  boom.connect(lp).connect(env(ac, out, at, 0.22 + size * 0.2, 0.003, 0.42));
  boom.start(at);
  boom.stop(at + 0.5);
  track(boom);

  // Bright crack transient.
  const crack = ac.createBufferSource();
  crack.buffer = noise(ac, 0.3);
  crack.playbackRate.value = 0.85 + Math.random() * 0.2;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1400 + size * 700;
  bp.Q.value = 0.8;
  crack.connect(bp).connect(env(ac, out, at, 0.14 + size * 0.16, 0.002, 0.18));
  crack.start(at);
  crack.stop(at + 0.3);
  track(crack);

  // Sizzling tail.
  const sizzle = ac.createBufferSource();
  sizzle.buffer = noise(ac, 1);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5000;
  const sizzleG = ac.createGain();
  sizzleG.gain.setValueAtTime(0.0001, at + 0.05);
  sizzleG.gain.exponentialRampToValueAtTime(0.025 + size * 0.035, at + 0.12);
  sizzleG.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
  sizzle.connect(hp).connect(sizzleG).connect(out);
  sizzle.start(at + 0.05);
  sizzle.stop(at + 0.95);
  track(sizzle);

  // Every burst crackles a little; crackle shells crackle a lot.
  fireworkCrackle(ac, out, at, crackle ? 22 : 7, crackle ? 0.055 : 0.028);
}

/** Small burst for floral / falling-leaves star deaths. */
export function fireworkBurstSmall(ac, out, at) {
  const rate = 0.8 + Math.random() * 0.2; // demo burst-sm playbackRate 0.8–1.0
  const src = ac.createBufferSource();
  src.buffer = noise(ac, 0.25);
  src.playbackRate.value = rate;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1700 * rate;
  bp.Q.value = 0.9;
  src.connect(bp).connect(env(ac, out, at, 0.07, 0.002, 0.16));
  src.start(at);
  src.stop(at + 0.25);
  track(src);

  const sub = ac.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(140 * rate, at);
  sub.frequency.exponentialRampToValueAtTime(55, at + 0.16);
  sub.connect(env(ac, out, at, 0.06, 0.003, 0.16));
  sub.start(at);
  sub.stop(at + 0.2);
  track(sub);
}

/** Fire-and-forget triggers for FireworksEngine — no-op silently if muted or not unlocked yet. */
export function playFireworkLaunch() {
  if (!ctx || isMuted()) return;
  if (ctx.state === "suspended") ctx.resume();
  if (ctx.state !== "running") return;
  fireworkLaunch(ctx, master, ctx.currentTime);
}

/** `size` 0-1 scales the boom; `crackle` adds the crackle-shell pop scatter. */
export function playFireworkBurst(size = 1, { crackle = false } = {}) {
  if (!ctx || isMuted()) return;
  if (ctx.state === "suspended") ctx.resume();
  if (ctx.state !== "running") return;
  fireworkBurst(ctx, master, ctx.currentTime, Math.min(Math.max(size, 0), 1), { crackle });
}

export function playFireworkCrackle() {
  if (!ctx || isMuted()) return;
  if (ctx.state === "suspended") ctx.resume();
  if (ctx.state !== "running") return;
  fireworkCrackle(ctx, master, ctx.currentTime, 16, 0.05);
}

let lastSmallBurstAt = -1;
/** Throttled like the demo (20ms) — floral shells rain these. */
export function playFireworkBurstSmall() {
  if (!ctx || isMuted()) return;
  if (ctx.state === "suspended") ctx.resume();
  if (ctx.state !== "running") return;
  const now = ctx.currentTime;
  if (now - lastSmallBurstAt < 0.02) return;
  lastSmallBurstAt = now;
  fireworkBurstSmall(ctx, master, now);
}

/**
 * Schedule a whole spin. Times are seconds into the spin: `crossings` are the
 * divider passes, `restAt` is when the wheel settles and `revealAt` is when
 * the prize card opens (the fanfare lands there). `elapsed` is how far into
 * the spin we already are.
 */
export function scheduleSpin({ crossings, elapsed = 0, restAt, revealAt = restAt, win }) {
  if (!ctx || isMuted()) return;
  cancel();
  const base = ctx.currentTime - elapsed;
  let last = -1;
  for (const c of crossings) {
    if (c < elapsed || c - last < 0.028) continue;
    last = c;
    // Ticks get slightly louder as the wheel slows, so the final clicks land.
    tick(ctx, master, base + c, 0.35 + 0.45 * (c / restAt));
  }
  if (win) {
    landDing(ctx, master, base + restAt + 0.02);
    winFanfare(ctx, master, base + revealAt);
  } else {
    loseTone(ctx, master, base + restAt + 0.05);
  }
}

/* ---------- scratch card ---------- */

/** Short gritty rasp — one per scratch stroke segment. */
export function scratchRasp(ac, out, at, gain = 0.09) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac, 0.09);
  src.playbackRate.value = 0.8 + Math.random() * 0.5;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400 + Math.random() * 1600;
  bp.Q.value = 0.8;
  src.connect(bp).connect(env(ac, out, at, gain, 0.004, 0.07));
  src.start(at);
  src.stop(at + 0.09);
  track(src);
}

let lastScratchAt = -1;
/** Throttled scratch sound for pointer moves; silent if muted or locked. */
export function playScratch() {
  if (!ctx || isMuted()) return;
  if (ctx.state !== "running") return;
  const t = ctx.currentTime;
  if (t - lastScratchAt < 0.055) return;
  lastScratchAt = t;
  scratchRasp(ctx, master, t);
}

/**
 * The cover is gone: ding right away, then the fanfare (or the soft "so
 * close") lands `revealIn` seconds later, as the result card opens.
 */
export function scheduleReveal({ revealIn = 1, win }) {
  if (!ctx || isMuted()) return;
  const t = ctx.currentTime;
  if (win) {
    landDing(ctx, master, t + 0.02);
    winFanfare(ctx, master, t + revealIn);
  } else {
    loseTone(ctx, master, t + 0.05);
  }
}
