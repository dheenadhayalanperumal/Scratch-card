"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import OtpInput from "@/components/OtpInput";
import Button from "@/components/Button";
import styles from "./SheetContent.module.css";

export default function OtpStep({ mobile, devOtp, loading, error, onVerify, onResend }) {
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const handleResend = async () => {
    await onResend();
    setSeconds(30);
    setCode("");
  };

  return (
    <Sheet>
      <div className={styles.body}>
        <h2 className={styles.title}>Almost there</h2>
        <p className={styles.otpSub}>
          Enter the code we&rsquo;ve sent to <strong>+91 {mobile}</strong>
        </p>

        <OtpInput length={4} value={code} onChange={setCode} error={error} />

        {devOtp && (
          <p className={styles.hint}>
            Demo code: <strong>{devOtp}</strong>
          </p>
        )}

        <button
          type="button"
          className={styles.resend}
          onClick={handleResend}
          disabled={seconds > 0}
        >
          {seconds > 0 ? `Resend code in ${seconds}s` : "Resend Code"}
        </button>

        <Button
          onClick={() => onVerify(code)}
          loading={loading}
          disabled={code.length < 4}
          icon="🪙"
          className={styles.cta}
        >
          Verify &amp; Scratch
        </Button>
      </div>
    </Sheet>
  );
}
