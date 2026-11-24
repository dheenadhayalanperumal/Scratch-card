"use client";

import { useEffect, useState } from "react";
import FireworksCanvas from "./FireworksCanvas";
import ConfettiRain from "@/components/ConfettiRain";
import styles from "./WinCelebration.module.css";

const CONFETTI_PAIRS = [
  ["#f0588e", "#ffd27a"],
  ["#3b6fe5", "#ffffff"],
  ["#f7a53b", "#f5b544"],
  ["#21b85a", "#ffd27a"],
];
// Long enough for the slowest piece (duration + stagger delay) to finish
// fading before this unmounts itself and stops painting. For fireworks the
// bound is the volley in FireworksEngine: last shell launches at 2s, climbs
// for ~1.1s, then its stars burn for up to ~1.5s.
const LIFETIME_MS = 5200;

/**
 * One-shot celebratory burst shown behind the "You won" card. Denser and
 * shorter-lived than the ambient SeasonalParticles layer — mounting this
 * component *is* the trigger (WonModal mounts it only when reward.isWin),
 * and it unmounts itself once the burst has finished playing.
 */
export default function WinCelebration({ effect = "confetti" }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDone(true), LIFETIME_MS);
    return () => clearTimeout(t);
  }, []);

  if (done || effect === "none") return null;

  return (
    <div className={styles.layer} aria-hidden="true">
      <span className={styles.flashPulse} style={{ animationDuration: "0.6s" }} />
      {renderEffect(effect)}
    </div>
  );
}

function renderEffect(effect) {
  if (effect === "snow") return <Snow />;
  if (effect === "diyas") return <Diyas />;
  if (effect === "fireworks") return <Fireworks />;
  // Confetti wins get the canvas-confetti "makeItRain" side-cannon rain.
  return <ConfettiRain />;
}

// Gentle filler rain (used under the fireworks bursts) — not the headline
// effect, so it stays simple: pieces drift down from random points at top.
function ConfettiFiller({ count = 18 }) {
  return Array.from({ length: count }, (_, i) => {
    const [c1, c2] = CONFETTI_PAIRS[i % CONFETTI_PAIRS.length];
    return (
      <span
        key={i}
        className={styles.confetti}
        style={{
          left: `${Math.random() * 100}%`,
          width: 5 + Math.random() * 3,
          height: 9 + Math.random() * 5,
          "--c1": c1,
          "--c2": c2,
          "--sway": `${(Math.random() > 0.5 ? 1 : -1) * (24 + Math.random() * 40)}px`,
          "--spin": `${480 + Math.random() * 720}deg`,
          animationDelay: `${Math.random() * Math.random() * 0.4}s`,
          animationDuration: `${1.5 + Math.random() * 0.8}s`,
        }}
      />
    );
  });
}

function Twinkles({ count = 9 }) {
  return Array.from({ length: count }, (_, i) => (
    <span
      key={i}
      className={styles.twinkle}
      style={{
        left: `${8 + Math.random() * 84}%`,
        top: `${8 + Math.random() * 60}%`,
        animationDelay: `${Math.random() * 1.8}s`,
        animationDuration: `${1.1 + Math.random() * 0.6}s`,
      }}
    />
  ));
}

function Snow() {
  return (
    <>
      {Array.from({ length: 34 }, (_, i) => (
        <span
          key={i}
          className={styles.flake}
          style={{
            left: `${Math.random() * 100}%`,
            width: 4 + Math.random() * 7,
            height: 4 + Math.random() * 7,
            "--sway": `${(Math.random() > 0.5 ? 1 : -1) * (14 + Math.random() * 24)}px`,
            animationDelay: `${Math.random() * Math.random() * 0.6}s`,
            animationDuration: `${2.2 + Math.random() * 1.2}s`,
          }}
        />
      ))}
      <Twinkles />
    </>
  );
}

function Diyas() {
  return (
    <>
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className={styles.flame}
          style={{
            left: `${6 + Math.random() * 88}%`,
            width: 10 + Math.random() * 8,
            height: 10 + Math.random() * 8,
            "--sway": `${(Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 16)}px`,
            animationDelay: `${Math.random() * Math.random() * 0.7}s`,
            animationDuration: `${2 + Math.random() * 1.1}s`,
          }}
        />
      ))}
      <Twinkles />
    </>
  );
}

// Real particle-physics fireworks (comet launch + gravity/drag burst), not
// CSS clusters — see FireworksCanvas.jsx for the technique and why.
function Fireworks() {
  return (
    <>
      <FireworksCanvas />
      <ConfettiFiller count={14} />
    </>
  );
}
