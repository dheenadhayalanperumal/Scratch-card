import styles from "./Sheet.module.css";

/**
 * Bottom sheet that slides up over the scratch card. Used for the lead form and OTP step.
 */
export default function Sheet({ children, className = "" }) {
  return (
    <div className={`${styles.sheet} ${className}`}>
      <span className={styles.grabber} />
      {children}
    </div>
  );
}
