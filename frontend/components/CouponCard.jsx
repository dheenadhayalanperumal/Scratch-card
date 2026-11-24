import styles from "./CouponCard.module.css";

export default function CouponCard({ title, store, validUntil, code, image }) {
  return (
    <div className={styles.card}>
      {image ? (
        <div className={styles.icon}>
          <img src={image} alt={title || "Reward"} className={styles.iconImage} />
        </div>
      ) : (
        <div className={styles.icon} aria-hidden>
          ☕
        </div>
      )}
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        <p className={styles.store}>{store}</p>
        {validUntil && <p className={styles.valid}>Valid up to {validUntil}</p>}
      </div>
      <div className={styles.code}>{code}</div>
    </div>
  );
}
