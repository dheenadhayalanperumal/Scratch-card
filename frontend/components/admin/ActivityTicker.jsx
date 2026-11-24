"use client";

import { useRef, useState } from "react";
import { now, useReducedMotion, useTime } from "@/lib/clock";
import { easeOutCubic, progress } from "@/lib/motion";
import { truncate } from "@/lib/format";
import styles from "./admin.module.css";

const PERIOD = 3; // a new event rolls in every 3s
const ROLL = 0.42;
const DEPTH = 8; // how many of the latest spins to cycle through

function ago(ms) {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function describe(s) {
  const who = truncate(s.userName) || "Someone";
  return s.isWin ? (
    <>
      <strong>{who}</strong> won <strong>{s.couponTitle}</strong>
      <span className={styles.tickerWhen}> · {ago(s.spunAt)}</span>
    </>
  ) : (
    <>
      <strong>{who}</strong> spun, no win
      <span className={styles.tickerWhen}> · {ago(s.spunAt)}</span>
    </>
  );
}

/**
 * One-line live feed under the page title: rolls through the latest spins like
 * a departure board. Hover or focus pauses it so a line can be read.
 */
export default function ActivityTicker({ spins }) {
  const t = useTime();
  const reduced = useReducedMotion();
  const [pausedAt, setPausedAt] = useState(null);
  const offset = useRef(0);

  const latest = [...(spins || [])].sort((a, b) => (b.spunAt || 0) - (a.spunAt || 0)).slice(0, DEPTH);
  if (!latest.length) return <p className={styles.subtitle}>Waiting for the first scratch…</p>;

  const clock = (pausedAt ?? t) - offset.current;
  const n = Math.floor(clock / PERIOD);
  const cur = latest[n % latest.length];
  const prev = n > 0 && latest.length > 1 ? latest[(n - 1) % latest.length] : null;
  const roll = reduced || !prev ? 1 : easeOutCubic(progress(clock - n * PERIOD, 0, ROLL));

  const pause = () => setPausedAt((p) => p ?? now());
  const resume = () => {
    if (pausedAt != null) offset.current += now() - pausedAt;
    setPausedAt(null);
  };

  return (
    <div
      className={styles.ticker}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      tabIndex={0}
      aria-label="Latest activity"
    >
      <span className={`${styles.tickerDot} ${pausedAt != null ? styles.tickerDotPaused : ""}`} aria-hidden="true" />
      <span className={styles.tickerReel}>
        {prev && roll < 1 && (
          <span className={styles.tickerLine} style={{ transform: `translateY(${-100 * roll}%)` }} aria-hidden="true">
            {describe(prev)}
          </span>
        )}
        <span className={styles.tickerLine} style={{ transform: `translateY(${100 * (1 - roll)}%)` }}>
          {describe(cur)}
        </span>
      </span>
    </div>
  );
}
