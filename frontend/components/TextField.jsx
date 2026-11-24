import { useId } from "react";
import styles from "./TextField.module.css";

/**
 * Labelled text input. Optional `prefix` renders a fixed adornment (e.g. +91).
 * When `error` is set the field is flagged to assistive tech and the message
 * is announced via aria-describedby.
 */
export default function TextField({ label, prefix, error, className = "", ...props }) {
  const errorId = useId();
  return (
    <label className={`${styles.wrap} ${className}`}>
      {label && <span className={styles.label}>{label}</span>}
      <span className={`${styles.field} ${error ? styles.fieldError : ""}`}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <input
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
      </span>
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
