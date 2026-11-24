"use client";

import { useRef } from "react";
import styles from "./OtpInput.module.css";

/**
 * Fixed-length numeric OTP entry with auto-advance, backspace and paste support.
 */
export default function OtpInput({ length = 4, value, onChange, error }) {
  const refs = useRef([]);

  const setDigit = (i, digit) => {
    const next = value.split("");
    next[i] = digit;
    onChange(next.join("").slice(0, length));
  };

  const handleChange = (i, raw) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    setDigit(i, digit);
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        setDigit(i, "");
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
        setDigit(i - 1, "");
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(digits);
    refs.current[Math.min(digits.length, length - 1)]?.focus();
  };

  return (
    <div>
      <div
        className={styles.row}
        style={{ "--otp-count": length }}
        onPaste={handlePaste}
      >
        {Array.from({ length }).map((_, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            className={`${styles.cell} ${value[i] ? styles.filled : ""} ${error ? styles.cellError : ""}`}
            inputMode="numeric"
            maxLength={1}
            value={value[i] || ""}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
