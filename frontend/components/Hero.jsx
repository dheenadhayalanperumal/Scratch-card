"use client";

import { useReducedMotion, useTime } from "@/lib/clock";
import { easeOutBack, easeOutCubic, progress } from "@/lib/motion";
import styles from "./Hero.module.css";

const REEL_PERIOD = 2.6;
const REEL_ROLL = 0.45;

// Shrink long prize names so the reel line never wraps at phone width.
const fit = (label) => `${Math.min(38, Math.max(22, 330 / (String(label).length * 0.62)))}px`;

/**
 * Center-aligned headline whose second line is a slot reel: it rolls through
 * the prizes every 2.6s, rolls faster while the customer scratches, and locks
 * on the result once the card is revealed (`result`).
 */
export default function Hero({ badge = "Every card wins something", segments, sceneAt = 0, scratching = false, result = null }) {
  const t = useTime();
  const reduced = useReducedMotion();

  const data = Array.isArray(segments) ? segments : [];
  const prizes = data.map((s) => s.label).filter((l) => l && !/try again/i.test(l));
  const reel = prizes.length ? prizes : ["Your Reward"];

  let current;
  let previous = null;
  let roll = 1;
  const locked = Boolean(result);

  if (locked) {
    current = result.isWin ? result.label : "Try again";
  } else {
    const period = scratching ? 0.7 : REEL_PERIOD;
    const n = Math.floor(t / period);
    current = reel[n % reel.length];
    if (!reduced && n > 0 && reel.length > 1) {
      previous = reel[(n - 1) % reel.length];
      roll = easeOutBack(progress(t - n * period, 0, Math.min(REEL_ROLL, period * 0.6)), 1.2);
    }
  }

  // Entrance: each line wipes up out of its own mask, staggered.
  const wipe = (start) => (reduced ? 0 : 1 - easeOutCubic(progress(t, sceneAt + start, 0.6)));

  return (
    <div className={styles.hero}>
      {badge && (
        <p className={styles.kicker} style={{ transform: `translateX(${-110 * wipe(0.45)}%)` }}>
          {badge}
        </p>
      )}
      <h1 className={styles.title} aria-label="Scratch and win your reward">
        <span className={styles.line} aria-hidden>
          <span style={{ transform: `translateY(${105 * wipe(0.1)}%)` }}>Scratch &amp; win</span>
        </span>
        <span className={`${styles.line} ${styles.reel}`} aria-hidden>
          <span style={{ transform: `translateY(${105 * wipe(0.25)}%)` }}>
            {previous && roll < 1 && (
              <span className={styles.slot} style={{ fontSize: fit(previous), transform: `translateY(${-100 * roll}%)` }}>
                {previous}
              </span>
            )}
            <span
              className={`${styles.slot} ${locked ? styles.locked : ""} ${scratching && !locked ? styles.rolling : ""}`}
              style={{ fontSize: fit(current), transform: `translateY(${100 * (1 - roll)}%)` }}
            >
              {current}
            </span>
          </span>
        </span>
      </h1>
    </div>
  );
}
