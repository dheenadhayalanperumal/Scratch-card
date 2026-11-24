"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

// The "makeItRain" celebration from the classic canvas-confetti demo, kept
// exactly as specified: two side cannons (left firing at 60°, right at
// 120°) spraying 2 particles a frame for 2 seconds, red & white.
// The library instance is bound to our own canvas inside the phone frame
// instead of its default full-window canvas, so the rain stays inside the
// device on desktop instead of covering the whole browser.
const COLORS = ["#bb0000", "#ffffff"];
const RAIN_MS = 2 * 1000;

export function makeItRain(instance, isStopped) {
  const end = Date.now() + RAIN_MS;

  (function frame() {
    if (isStopped()) return;
    instance({
      particleCount: 2,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: COLORS,
    });
    instance({
      particleCount: 2,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: COLORS,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}

/**
 * Fires makeItRain once on mount — used only on the coupon (win) screen's
 * celebration, not as a home-page ambient effect. (repeatMs > 0 would keep
 * re-firing on an interval; no current caller uses it.)
 */
export default function ConfettiRain({ repeatMs = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stopped = false;
    const instance = confetti.create(canvas, { resize: true, useWorker: false });

    makeItRain(instance, () => stopped);
    const timer = repeatMs > 0 ? setInterval(() => makeItRain(instance, () => stopped), repeatMs) : null;

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      instance.reset();
    };
  }, [repeatMs]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
