"use client";

import styles from "./CardLoader.module.css";

/**
 * Scratch-card loader for the admin: a coin rubs the foil off a mini card.
 *
 * `label` is announced to screen readers; the visual caption is decorative.
 * Set `fullscreen` for the initial boot state, or leave it off to drop the
 * card inline inside a panel.
 */
export default function CardLoader({ label = "Loading", caption, size = 120, fullscreen = false }) {
  return (
    <div className={fullscreen ? styles.fullscreen : styles.inline} role="status" aria-live="polite">
      <div className={styles.stage} style={{ "--card-size": `${size}px` }}>
        <div className={styles.card} aria-hidden="true">
          <div className={styles.prize}>WIN!</div>
          <span className={styles.foil} />
          <span className={styles.coin}>🪙</span>
        </div>
      </div>

      {/* The caption is decorative: `label` is the single accessible name, so
          the visible text is hidden from AT to avoid a doubled announcement. */}
      {caption !== null && (
        <p className={styles.caption} aria-hidden="true">
          <span className={styles.captionText}>{caption ?? label}</span>
          <span className={styles.track}>
            <span className={styles.trackFill} />
          </span>
        </p>
      )}

      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}
