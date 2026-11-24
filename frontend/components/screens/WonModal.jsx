"use client";

import Modal from "@/components/Modal";
import Button from "@/components/Button";
import WinCelebration from "./WinCelebration";
import { useReducedMotion, useTime } from "@/lib/clock";
import { easeOutBack, easeOutCubic, progress, scrambleText } from "@/lib/motion";
import styles from "./WonModal.module.css";

/**
 * Prize reveal, painted from the shared clock relative to `startAt`:
 * card wipes open from the centre, badge springs in, kicker letters rise one
 * by one, prize name wipes up, then the code resolves out of scramble noise.
 * `particleEffect` picks the win-celebration burst style (see WinCelebration).
 */
export default function WonModal({ reward, image, onDone, startAt = 0, particleEffect }) {
  const t = useTime();
  const reduced = useReducedMotion();
  const tau = reduced ? 99 : t - startAt;
  const won = reward.isWin;

  const open = easeOutCubic(progress(tau, 0, 0.55));
  const badge = easeOutBack(progress(tau, 0.2, 0.55), 2);
  const prize = 1 - easeOutCubic(progress(tau, 0.5, 0.5));
  const note = 1 - easeOutCubic(progress(tau, 0.65, 0.5));
  const done = 1 - easeOutCubic(progress(tau, won ? 1.5 : 0.9, 0.5));

  const kicker = won ? "YOU WON" : "SO CLOSE";
  const code = formatCode(reward.code);

  return (
    <Modal
      label={won ? `You won ${reward.label}` : "No reward this time"}
      overlayStyle={{ opacity: easeOutCubic(progress(tau, 0, 0.3)) }}
      cardStyle={{ clipPath: `circle(${open * 120}% at 50% 22%)` }}
      overlayChildren={won ? <WinCelebration effect={particleEffect} /> : null}
    >
      <div
        className={styles.badge}
        style={{ transform: `scale(${badge}) rotate(${(1 - badge) * -40}deg)` }}
        aria-hidden={!(won && image)}
      >
        {won && image ? (
          <img src={image} alt={reward.label || "Your reward"} className={styles.prizeImage} />
        ) : (
          "☕"
        )}
      </div>

      <p className={styles.kicker} aria-label={kicker}>
        {Array.from(kicker).map((ch, i) => {
          const p = 1 - easeOutBack(progress(tau, 0.32 + i * 0.035, 0.4), 1.6);
          return (
            <span key={i} aria-hidden style={{ transform: `translateY(${p * 110}%)` }}>
              {ch === " " ? " " : ch}
            </span>
          );
        })}
      </p>

      <div className={styles.mask}>
        <h2 className={styles.prize} style={{ transform: `translateY(${prize * 105}%)` }}>
          {won ? reward.label : "Try Again"}
        </h2>
      </div>

      <p className={styles.note} style={{ transform: `translateY(${note * 12}px)`, clipPath: `inset(0 0 ${note * 100}% 0)` }}>
        {won
          ? "Show this code at the counter to redeem your reward."
          : "No reward this time — but check back tomorrow for another card."}
      </p>

      {won && (
        <div className={styles.code} aria-label={`Code ${code}`}>
          {/* Fixed-width cells so the scramble never changes the line width */}
          {Array.from(scrambleText(code, tau, { start: 0.8 })).map((ch, i) => (
            <span key={i} aria-hidden className={code[i] === " " ? styles.gap : styles.cell}>
              {ch}
            </span>
          ))}
        </div>
      )}

      <div className={styles.doneMask}>
        <div style={{ transform: `translateY(${done * 110}%)` }}>
          <Button onClick={onDone} className={styles.done}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function formatCode(code) {
  if (!code) return "";
  const [prefix, rest] = code.split("-");
  return rest ? `${prefix} - ${rest}` : prefix;
}
