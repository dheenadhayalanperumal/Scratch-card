import styles from "./Header.module.css";

export default function Header({ brandName = "", logoText, logoImage, soundOn, onToggleSound, onOpenCoupons }) {
  const initials = (logoText || brandName || "").slice(0, 4);
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          {logoImage ? (
            <img className={styles.logoImg} src={logoImage} alt={brandName} />
          ) : (
            <span className={styles.logoText}>{initials}</span>
          )}
        </div>
        <span className={styles.brandName}>{brandName}</span>
      </div>
      <div className={styles.actions}>
      {onOpenCoupons && (
        <button type="button" className={styles.sound} onClick={onOpenCoupons} aria-label="My coupons">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M14.5 6.5v11" stroke="currentColor" strokeWidth="1.6" strokeDasharray="1.6 2" />
          </svg>
        </button>
      )}
      {onToggleSound && (
        <button
          type="button"
          className={styles.sound}
          onClick={onToggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? "Mute sound and vibration" : "Turn on sound and vibration"}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
            {soundOn ? (
              <path
                d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            ) : (
              <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            )}
          </svg>
        </button>
      )}
      </div>
    </header>
  );
}
