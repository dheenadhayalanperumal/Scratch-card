"use client";

import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { useEffect, useRef } from "react";
import { useReducedMotion, useTime } from "@/lib/clock";
import { easeOutBack, easeOutCubic, easeOutQuint, lerp, progress } from "@/lib/motion";
import styles from "./LoseModal.module.css";

const NOTCHES = 12;
const STEP = 360 / NOTCHES;
const TARGET = 0; // the glowing notch, at 12 o'clock
const REST = TARGET - STEP * 0.62; // needle stops just short of it
const DIAL_R = 46;

/**
 * "Better luck next time", painted from the shared clock relative to `startAt`:
 * a mini dial whose needle creeps towards the lit notch and stops a hair
 * short, then the headline, note and next-card ticket rise in.
 *
 * `spinLimit` is the campaign's `maxSpinsPer` ("day" | "week" | "unlimited")
 * so the "next card" copy matches the real rule; defaults to "day".
 */
const NEXT_SPIN = {
  day: { when: "Tomorrow", note: "You get a fresh card every day — come back tomorrow." },
  week: { when: "Next week", note: "You get a fresh card every week — come back next week." },
  unlimited: { when: "Available now", note: "Your next card is ready whenever you are." },
};

export default function LoseModal({ onDone, startAt = 0, spinLimit = "day" }) {
  const next = NEXT_SPIN[spinLimit] || NEXT_SPIN.day;
  const doneRef = useRef(null);

  // Move focus into the dialog on open so keyboard / screen-reader users land
  // on it. preventScroll: the button starts below its overflow mask, and a
  // plain focus() would scroll the mask and break the rise-in.
  useEffect(() => {
    doneRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, []);

  const t = useTime();
  const reduced = useReducedMotion();
  const tau = reduced ? 99 : t - startAt;

  const open = easeOutCubic(progress(tau, 0, 0.55));
  const dial = easeOutBack(progress(tau, 0.15, 0.5), 1.4);

  // Sweep in, then a tiny hopeful nudge forward that falls back.
  const sweep = easeOutQuint(progress(tau, 0.25, 1.1));
  const nudge = Math.sin(Math.PI * progress(tau, 1.3, 0.45)) * STEP * 0.22;
  const needle = lerp(REST - 300, REST, sweep) + nudge;
  const glow = 0.55 + 0.45 * Math.sin(tau * 3.2);

  const title = 1 - easeOutCubic(progress(tau, 0.55, 0.55));
  const accentLine = 1 - easeOutCubic(progress(tau, 0.68, 0.55));
  const note = 1 - easeOutCubic(progress(tau, 0.85, 0.5));
  const ticket = easeOutBack(progress(tau, 1.0, 0.55), 1.3);
  const done = 1 - easeOutCubic(progress(tau, 1.2, 0.5));

  const kicker = "SO CLOSE";

  return (
    <Modal
      label="Better luck next time — no reward on this card"
      overlayStyle={{ opacity: easeOutCubic(progress(tau, 0, 0.3)) }}
      cardStyle={{ clipPath: `circle(${open * 120}% at 50% 22%)` }}
    >
      <div className={styles.dialWrap} style={{ transform: `scale(${dial})` }} aria-hidden>
        <svg viewBox="-60 -60 120 120" className={styles.dial}>
          <circle r={DIAL_R + 8} className={styles.face} />
          {Array.from({ length: NOTCHES }, (_, i) => {
            const lit = i * STEP === TARGET;
            return (
              <line
                key={i}
                x1="0"
                y1={-DIAL_R + (lit ? 0 : 3)}
                x2="0"
                y2={-DIAL_R + 11}
                transform={`rotate(${i * STEP})`}
                className={lit ? styles.lit : styles.tick}
                style={lit ? { opacity: glow } : undefined}
              />
            );
          })}
          <circle cx="0" cy={-DIAL_R - 1} r="3.2" className={styles.spark} style={{ opacity: glow }} />
          <g transform={`rotate(${needle})`}>
            <path d="M0 -38 L4.2 0 L0 6 L-4.2 0 Z" className={styles.needle} />
          </g>
          <circle r="7" className={styles.hub} />
          <circle r="2.4" className={styles.hubDot} />
        </svg>
      </div>

      <p className={styles.kicker} aria-hidden>
        {Array.from(kicker).map((ch, i) => {
          const p = 1 - easeOutBack(progress(tau, 0.4 + i * 0.035, 0.4), 1.6);
          return (
            <span key={i} style={{ transform: `translateY(${p * 110}%)` }}>
              {ch === " " ? "\u00a0" : ch}
            </span>
          );
        })}
      </p>

      <h2 className={styles.title}>
        <span className={styles.mask}>
          <span style={{ transform: `translateY(${title * 105}%)` }}>Better luck</span>
        </span>{" "}
        <span className={styles.mask}>
          <span className={styles.accent} style={{ transform: `translateY(${accentLine * 105}%)` }}>
            next time
          </span>
        </span>
      </h2>

      <p className={styles.note} style={{ transform: `translateY(${note * 12}px)`, opacity: 1 - note }}>
        So close to a prize this time. {next.note}
      </p>

      <div
        className={styles.ticket}
        style={{ transform: `translateY(${(1 - ticket) * 18}px) scale(${0.92 + ticket * 0.08})`, opacity: Math.min(1, ticket * 1.4) }}
      >
        <span className={styles.ticketIcon} aria-hidden>
          ↻
        </span>
        <span className={styles.ticketText}>
          <span className={styles.ticketLabel}>Next card</span>{" "}
          <span className={styles.ticketValue}>{next.when}</span>
        </span>
        <span className={styles.stub} aria-hidden>
          1×
        </span>
      </div>

      <div className={styles.doneMask} ref={doneRef}>
        <div style={{ transform: `translateY(${done * 110}%)` }}>
          <Button onClick={onDone} className={styles.done}>
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}
