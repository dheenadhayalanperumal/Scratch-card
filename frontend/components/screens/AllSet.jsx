import Button from "@/components/Button";
import CouponCard from "@/components/CouponCard";
import styles from "./AllSet.module.css";

export default function AllSet({ name, reward, image, onDone }) {
  return (
    <div className={`${styles.wrap} reveal`}>
      <div className={styles.check} aria-hidden>
        <svg viewBox="0 0 24 24" width="40" height="40">
          <path
            d="M4 12.5l5 5L20 6.5"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className={styles.title}>You&rsquo;re all set, {name || "friend"}!</h2>
      <p className={styles.sub}>
        Your reward <strong>{reward.label}</strong> is reserved. We&rsquo;ve texted code{" "}
        <strong>{reward.code}</strong> to your phone.
      </p>

      <CouponCard
        title={`${reward.label} Coupon`}
        store={reward.store}
        validUntil={reward.validUntil}
        code={reward.code}
        image={image}
      />

      <div className={styles.foot}>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
