"use client";

import { useReducedMotion, useTime } from "@/lib/clock";
import { easeOutCubic, progress } from "@/lib/motion";

/** Slides its children up from below the fold at clock time `at` (no fade). */
export default function Lift({ at = 0, distance = 160, className, children }) {
  const t = useTime();
  const reduced = useReducedMotion();
  const p = reduced ? 1 : easeOutCubic(progress(t, at, 0.7));
  return (
    <div className={className} style={p < 1 ? { transform: `translateY(${distance * (1 - p)}px)` } : undefined}>
      {children}
    </div>
  );
}
