"use client";

import { useMemo } from "react";
import styles from "./SeasonalParticles.module.css";
import FireworksEngine from "./FireworksEngine";

const COUNTS = { snow: 40, confetti: 16, diyas: 11 };
const CONFETTI_PAIRS = [
  ["#f0588e", "#ffd27a"],
  ["#3b6fe5", "#ffffff"],
  ["#f7a53b", "#f5b544"],
  ["#21b85a", "#ffd27a"],
];

// Decorative only. Snow/confetti/diyas are CSS-keyframe particles with
// randomized per-instance CSS variables (sway distance, spin amount, color
// pair, ...) so a handful of shared keyframes still read as organic rather
// than a single repeating tile. "fireworks" is the real canvas simulation
// from the reference demo (FireworksEngine) — CSS sparks can't do comet
// launches, trails, glitter or gravity, which is exactly what made the old
// effect read as fake next to it.
// globals.css disables all animation under prefers-reduced-motion, and the
// layer itself is hidden there too (see SeasonalParticles.module.css).
export default function SeasonalParticles({ effect }) {
  // Hooks first, unconditionally — the fireworks branch returns early below.
  const particles = useMemo(() => {
    const count = COUNTS[effect];
    if (!count) return [];
    return Array.from({ length: count }, (_, i) => {
      const base = {
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 6,
        duration: 6 + Math.random() * 6,
      };
      if (effect === "snow") {
        // Real ❄ glyphs like the classic script: 10–20px flakes, 5–10s
        // falls, negative delay so the sky is already full on first paint
        // instead of every flake starting at the top together.
        const size = 10 + Math.random() * 10;
        const duration = 5 + Math.random() * 5;
        return {
          ...base,
          size,
          duration,
          delay: -Math.random() * duration,
          depth: size > 15 ? 0.95 : 0.55,
          sway: 12 + Math.random() * 20,
          drift: (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 30),
        };
      }
      if (effect === "confetti") {
        const [c1, c2] = CONFETTI_PAIRS[i % CONFETTI_PAIRS.length];
        return {
          ...base,
          width: 5 + Math.random() * 3,
          height: 9 + Math.random() * 5,
          c1, c2,
          sway: (Math.random() > 0.5 ? 1 : -1) * (20 + Math.random() * 30),
          spin: 360 + Math.random() * 540,
          duration: 7 + Math.random() * 6,
        };
      }
      if (effect === "diyas") {
        const size = 9 + Math.random() * 7;
        return { ...base, size, sway: (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 14), duration: 5 + Math.random() * 4 };
      }
      return base;
    });
  }, [effect]);

  if (effect === "fireworks") {
    return (
      <div className={styles.layer} aria-hidden="true">
        <FireworksEngine mode="ambient" />
      </div>
    );
  }

  // Confetti on the home page stays the gentle CSS rain below — the
  // canvas-confetti "makeItRain" cannons are reserved for the coupon
  // (win) screen only, per the shop's preference.

  if (particles.length === 0) return null;

  return (
    <div className={styles.layer} aria-hidden="true">
      {particles.map((p) => (
            <span
              key={p.id}
              className={styles[effect]}
              style={{
                left: `${p.left}%`,
                width: effect === "snow" ? undefined : p.size ?? p.width,
                height: effect === "snow" ? undefined : p.size ?? p.height,
                fontSize: effect === "snow" ? p.size : undefined,
                "--op": effect === "snow" ? p.depth : undefined,
                "--sway": p.sway !== undefined ? `${p.sway}px` : undefined,
                "--drift": p.drift !== undefined ? `${p.drift}px` : undefined,
                "--spin": p.spin !== undefined ? `${p.spin}deg` : undefined,
                "--c1": p.c1,
                "--c2": p.c2,
                filter: effect === "snow" && p.depth < 0.7 ? "blur(0.8px)" : undefined,
                animationDelay: `${p.delay}s, ${p.delay}s`,
                animationDuration: `${p.duration}s, ${p.duration * 0.6}s`,
              }}
            >
              {effect === "snow" ? "❄" : null}
            </span>
          ))}
    </div>
  );
}
