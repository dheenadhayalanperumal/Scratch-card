import styles from "./Button.module.css";

/**
 * Primary gradient CTA used across the flow.
 * variants: "cta" (pink→orange gradient), "ghost", "light"
 */
export default function Button({
  children,
  variant = "cta",
  icon = null,
  loading = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${loading ? styles.loading : ""} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden />
      ) : (
        <>
          {icon && <span className={styles.icon}>{icon}</span>}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}
