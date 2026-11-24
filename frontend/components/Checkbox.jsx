import styles from "./Checkbox.module.css";

export default function Checkbox({ checked, onChange, children }) {
  return (
    <label className={styles.wrap}>
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.box} aria-hidden>
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path
            d="M2.5 8.5l3.2 3.2L13.5 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className={styles.text}>{children}</span>
    </label>
  );
}
