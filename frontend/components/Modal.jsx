import styles from "./Modal.module.css";

/**
 * Centered modal card on a dimmed overlay. Used for the "You won" reveal.
 * Pass `cardStyle` to drive the card's motion yourself (disables the CSS pop).
 * `overlayChildren` renders as a sibling of the dimmed backdrop, not inside
 * it — deliberately, so a decorative layer (e.g. the win celebration burst)
 * never inherits the backdrop's blur (see .celebration in Modal.module.css).
 */
export default function Modal({ children, cardStyle, overlayStyle, label, overlayChildren }) {
  return (
    <>
      <div className={`${styles.overlay} ${cardStyle ? styles.manual : ""}`} style={overlayStyle} role="dialog" aria-modal="true" aria-label={label}>
        <div className={`${styles.card} ${cardStyle ? styles.manual : ""}`} style={cardStyle}>
          {children}
        </div>
      </div>
      {overlayChildren && <div className={styles.celebration}>{overlayChildren}</div>}
    </>
  );
}
