"use client";

import { useEffect, useState } from "react";
import { adminApi, setAdminToken } from "@/lib/api";
import OtpInput from "@/components/OtpInput";
import styles from "./admin.module.css";

/**
 * Admin sign-in with the same OTP method as customers: enter a 10-digit
 * mobile, get a 4-digit code, verify. On success the 12h admin token is
 * stored (lib/api attaches it to every /api/admin call) and onLogin fires so
 * the layout can load the panel.
 */
export default function AdminLogin({ onLogin }) {
  const [step, setStep] = useState("mobile"); // mobile | otp
  const [mobile, setMobile] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [devOtp, setDevOtp] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const digits = mobile.replace(/\D/g, "").slice(-10);

  const sendCode = async (e) => {
    e?.preventDefault();
    if (busy || digits.length !== 10) return;
    setBusy(true);
    setError("");
    try {
      const data = await adminApi.requestAdminOtp(digits);
      setSessionId(data.sessionId);
      setDevOtp(data.devOtp);
      setMobile(data.mobile);
      setCode("");
      setStep("otp");
      setSeconds(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || seconds > 0 || !sessionId) return;
    setBusy(true);
    setError("");
    try {
      const data = await adminApi.resendAdminOtp(sessionId);
      setDevOtp(data.devOtp);
      setCode("");
      setSeconds(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (busy || code.length !== 4) return;
    setBusy(true);
    setError("");
    try {
      const data = await adminApi.verifyAdminOtp(sessionId, code);
      setAdminToken(data.token);
      onLogin(data.mobile);
    } catch (err) {
      setError(err.message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <div className={styles.loginMark} aria-hidden="true">🎡</div>
        <h1 className={styles.loginTitle}>Admin sign in</h1>
        <p className={styles.loginSub}>
          {step === "mobile"
            ? "Enter your admin mobile number and we'll send you a one-time code."
            : `Enter the 4-digit code sent to +91 ${mobile}.`}
        </p>

        {step === "mobile" ? (
          <form onSubmit={sendCode}>
            <label className={styles.label} htmlFor="admin-mobile">Mobile number</label>
            <div className={styles.loginMobileRow}>
              <span className={styles.loginPrefix}>+91</span>
              <input
                id="admin-mobile"
                className={styles.input}
                inputMode="numeric"
                autoComplete="tel"
                placeholder="00000 00000"
                maxLength={13}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/[^\d\s]/g, ""))}
                autoFocus
              />
            </div>
            {error && <p className={styles.redeemError} role="alert">{error}</p>}
            <button type="submit" className={`${styles.btn} ${styles.loginBtn}`} disabled={busy || digits.length !== 10}>
              {busy ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <OtpInput length={4} value={code} onChange={setCode} error={null} />
            {devOtp && (
              <p className={styles.loginDemo}>
                Demo code: <strong>{devOtp}</strong>
              </p>
            )}
            {error && <p className={styles.redeemError} role="alert">{error}</p>}
            <button type="submit" className={`${styles.btn} ${styles.loginBtn}`} disabled={busy || code.length !== 4}>
              {busy ? "Verifying…" : "Verify & sign in"}
            </button>
            <div className={styles.loginLinks}>
              <button type="button" className={styles.loginLink} onClick={resend} disabled={busy || seconds > 0}>
                {seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
              </button>
              <button
                type="button"
                className={styles.loginLink}
                onClick={() => {
                  setStep("mobile");
                  setError("");
                  setCode("");
                }}
              >
                Use a different number
              </button>
            </div>
          </form>
        )}
      </div>
      <p className={styles.loginFoot}>Authorised staff only. Codes expire in 10 minutes.</p>
    </div>
  );
}
