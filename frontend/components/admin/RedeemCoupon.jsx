"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { adminApi } from "@/lib/api";
import Icon from "./Icon";
import styles from "./admin.module.css";

const fmt = (ms) =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/**
 * Turn a getUserMedia failure into something a person at the counter can act
 * on. The raw error name is kept at the end so support can tell "camera busy"
 * (NotReadableError) apart from "no camera" (NotFoundError) at a glance.
 */
function describeCameraError(e) {
  const name = e?.name || "Error";
  const detail = ` (${name}${e?.message ? `: ${e.message}` : ""})`;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return `Camera permission is blocked for this site. Tap the lock/site icon in the address bar → allow Camera → try again. Or type the code / upload a photo instead.${detail}`;
    case "SecurityError":
      return `The browser blocked the camera because this page isn't on a secure address. Open the admin on https:// or on the shop computer at localhost — or type the code / upload a photo instead.${detail}`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return `No camera was found on this device. Type the code or upload a photo of the QR instead.${detail}`;
    case "NotReadableError":
    case "TrackStartError":
      return `The camera is busy — another app or browser tab is using it. Close that app/tab, then tap "Start camera scan" again.${detail}`;
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return `This camera doesn't support the requested settings. Tap "Start camera scan" to retry with basic settings, or upload a photo of the QR.${detail}`;
    case "AbortError":
      return `The camera stopped before it could start. Tap "Start camera scan" to try again, or upload a photo of the QR.${detail}`;
    default:
      return `Couldn't start the camera on this device. Type the code or upload a photo of the QR instead.${detail}`;
  }
}

const STATUS = {
  active: {
    label: "Ready to claim",
    hint: "This coupon is unused and in date. Approve the claim when the customer is at the counter.",
  },
  redeemed: {
    label: "Already redeemed",
    hint: "This coupon has already been claimed. It can't be used again.",
  },
  expired: {
    label: "Expired",
    hint: "This coupon is past its validity date and can't be claimed.",
  },
};

/**
 * Counter redemption desk: scan the QR on a customer's coupon (camera or an
 * uploaded photo), or type the code, see whose it is and whether it's still
 * valid, then approve the claim. Approval goes through
 * POST /api/admin/redeem/claim, which flips active → redeemed atomically —
 * unlike the Records status dropdown, a second scan of the same QR reports
 * "already redeemed" instead of silently succeeding twice.
 */
export default function RedeemCoupon({ onChanged, spins = [] }) {
  const [camera, setCamera] = useState("idle"); // idle | starting | on | error
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [coupon, setCoupon] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [notFound, setNotFound] = useState("");
  const [notice, setNotice] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const fileRef = useRef(null);
  const pausedRef = useRef(false);
  const handledRef = useRef("");

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const lookup = useCallback(async (text) => {
    const value = String(text || "").trim();
    if (!value || busy) return;
    if (handledRef.current === value && coupon) return;
    handledRef.current = value;
    pausedRef.current = true;
    setBusy(true);
    setNotice("");
    setNotFound("");
    setCoupon(null);
    setCandidates([]);
    try {
      const data = await adminApi.lookupCoupon(value);
      if (data.ambiguous) {
        setCandidates(data.matches || []);
      } else {
        setCoupon(data.coupon);
      }
      // Counter staff only need the coupon card now — drop the live preview
      // so the camera LED goes off and the details aren't pushed below it.
      stopCamera();
      try {
        navigator.vibrate?.(40);
      } catch {}
    } catch (e) {
      setNotFound(e.message);
      pausedRef.current = false;
      handledRef.current = "";
    } finally {
      setBusy(false);
    }
  }, [busy, coupon, stopCamera]);

  const decodeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data || null;
  }, []);

  const startCamera = async () => {
    setCameraError("");
    // Camera APIs only exist on secure pages (https:// or localhost). On a
    // plain http://192.168.… address the browser hides them entirely, which
    // used to surface as a mystery failure — say so plainly instead.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setCamera("error");
      setCameraError(
        `Camera scanning is blocked on this address (${window.location.origin}) because it isn't secure. ` +
          "Open this admin on https://, or on the shop computer at http://localhost:3000 — the camera works there. " +
          "On this device you can still upload a photo of the QR or type the code below."
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("error");
      setCameraError("This browser can't open a camera here. Camera scanning needs HTTPS (or localhost) — type the code or upload a photo of the QR instead.");
      return;
    }
    // If permission was already denied, retrying just fails again — tell the
    // admin where to un-block it instead of showing a raw browser error.
    try {
      const perm = await navigator.permissions?.query({ name: "camera" });
      if (perm?.state === "denied") {
        setCamera("error");
        setCameraError("Camera permission is blocked for this site. Tap the lock/site icon in the address bar → allow Camera → then tap \"Start camera scan\" again. Or type the code / upload a photo instead.");
        return;
      }
    } catch {}
    setCamera("starting");
    // Loosest-last ladder: prefer the rear camera at a useful resolution,
    // then any camera at all. A permission denial won't change between
    // attempts, so stop at once; device/constraint failures fall through.
    const attempts = [
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: { ideal: "environment" } }, audio: false },
      { video: true, audio: false },
    ];
    let stream = null;
    let lastError = null;
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) {
        lastError = e;
        if (e?.name === "NotAllowedError" || e?.name === "SecurityError") break;
      }
    }
    if (!stream) {
      setCamera("error");
      setCameraError(describeCameraError(lastError));
      return;
    }
    try {
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCamera("on");
      pausedRef.current = false;
      timerRef.current = setInterval(() => {
        if (pausedRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
        const videoEl = videoRef.current;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const scale = Math.min(1, 960 / (videoEl.videoWidth || 960));
        canvas.width = Math.max(1, Math.round((videoEl.videoWidth || 640) * scale));
        canvas.height = Math.max(1, Math.round((videoEl.videoHeight || 480) * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const text = decodeCanvas();
        if (text) lookup(text);
      }, 160);
    } catch (e) {
      // Stream opened but the preview element wouldn't play it — release the
      // camera so the next attempt (and other apps) can use it.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCamera("error");
      setCameraError(describeCameraError(e));
    }
  };

  const scanPhoto = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const scale = Math.min(1, 1600 / (img.naturalWidth || 1600));
      canvas.width = Math.max(1, Math.round((img.naturalWidth || 640) * scale));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || 480) * scale));
      canvas.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const text = decodeCanvas();
      if (text) lookup(text);
      else {
        setNotFound("No QR code found in that photo. Try a closer, sharper shot — or type the code below the QR.");
        handledRef.current = "";
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setNotFound("That photo couldn't be read. Type the code below the QR instead.");
    };
    img.src = url;
  };

  const reset = () => {
    handledRef.current = "";
    pausedRef.current = false;
    setCoupon(null);
    setCandidates([]);
    setNotFound("");
    setNotice("");
    setManual("");
  };

  const claim = async () => {
    if (!coupon || coupon.status !== "active") return;
    setClaiming(true);
    setNotice("");
    try {
      const data = await adminApi.claimCoupon(coupon.id);
      setCoupon(data.coupon);
      setNotice("Claim approved — this coupon is now redeemed.");
      await onChanged?.();
    } catch (e) {
      setNotice(e.message);
      // Someone may have claimed it at another counter a moment ago — refresh.
      try {
        const data = await adminApi.lookupCoupon(`SPIN1:${coupon.id}:${coupon.code}`);
        if (data.coupon) setCoupon(data.coupon);
      } catch {}
      await onChanged?.();
    } finally {
      setClaiming(false);
    }
  };

  const status = coupon ? STATUS[coupon.status] || STATUS.active : null;
  const showingResult = Boolean(coupon) || candidates.length > 0;

  // Redeemed history — every winning spin already flipped to "redeemed",
  // newest claim first. Records predating the redeemed_at stamp fall back to
  // their spin time for ordering and show "—" for the claim time.
  const redeemed = (spins || [])
    .filter((s) => s.isWin && s.status === "redeemed")
    .sort((a, b) => (b.redeemedAt || b.spunAt) - (a.redeemedAt || a.spunAt));
  const lq = listQuery.trim().toLowerCase();
  const visibleRedeemed = lq
    ? redeemed.filter((s) =>
        [s.userName, s.userMobile, s.code, s.couponTitle, s.product].some((v) =>
          String(v || "").toLowerCase().includes(lq)
        )
      )
    : redeemed;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const redeemedToday = redeemed.filter((s) => (s.redeemedAt || 0) >= dayStart.getTime()).length;
  const redeemedCustomers = new Set(redeemed.map((s) => s.userMobile)).size;

  return (
    <>
    <div className={`${styles.redeemGrid} ${showingResult ? styles.redeemGridFocus : ""}`}>
      {!showingResult && (
      <section className={styles.card} aria-labelledby="scan-title">
        <div className={styles.couponHead}>
          <div>
            <h3 className={styles.cardTitle} id="scan-title">Scan coupon QR</h3>
            <p className={styles.cardDesc}>
              Point the camera at the QR on the customer&rsquo;s coupon. It opens here for approval automatically.
            </p>
          </div>
          <span className={`${styles.badge} ${camera === "on" ? styles.badgeOn : styles.badgeOff}`}>
            {camera === "on" ? "Camera on" : camera === "starting" ? "Starting…" : "Camera off"}
          </span>
        </div>

        <div className={styles.scannerBox}>
          <video ref={videoRef} className={styles.scannerVideo} playsInline muted aria-label="Camera view for scanning a coupon QR code" />
          {camera === "on" && (
            <>
              <span className={styles.scanFrame} aria-hidden="true" />
              <span className={styles.scanLine} aria-hidden="true" />
            </>
          )}
          {camera !== "on" && (
            <div className={styles.scannerIdle}>
              <Icon name="scan" size={44} />
              <p>{camera === "starting" ? "Opening camera…" : "Camera preview will appear here"}</p>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} hidden aria-hidden="true" />

        {cameraError && <p className={styles.redeemError} role="alert">{cameraError}</p>}

        <div className={styles.actions} style={{ marginTop: 14 }}>
          {camera === "on" ? (
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={stopCamera}>
              Stop camera
            </button>
          ) : (
            <button type="button" className={styles.btn} onClick={startCamera} disabled={camera === "starting"}>
              {camera === "starting" ? "Opening…" : "Start camera scan"}
            </button>
          )}
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => fileRef.current?.click()}>
            Upload QR photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            aria-label="Upload a photo of a coupon QR code"
            onChange={(e) => {
              scanPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className={styles.redeemDivider}><span>or enter the code manually</span></div>

        <form
          className={styles.manualRow}
          onSubmit={(e) => {
            e.preventDefault();
            handledRef.current = "";
            lookup(manual);
          }}
        >
          <input
            className={styles.input}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="e.g. CCB-V3HT"
            aria-label="Coupon code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className={styles.btn} disabled={busy || !manual.trim()}>
            {busy ? "Checking…" : "Check coupon"}
          </button>
        </form>
        <p className={styles.help}>
          The code is printed under the QR in the customer&rsquo;s wallet. Spaces and lower-case are fine.
        </p>
      </section>
      )}

      <section className={styles.card} aria-labelledby="claim-title" aria-live="polite">
        <h3 className={styles.cardTitle} id="claim-title">Coupon claim</h3>

        {candidates.length > 0 && (
          <div>
            <p className={styles.cardDesc}>
              This code was issued to <strong>{candidates.length} customers</strong> (static code). Pick the
              customer standing at the counter:
            </p>
            <div className={styles.candidateList}>
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={styles.candidate}
                  onClick={() => {
                    setCoupon(c);
                    setCandidates([]);
                  }}
                >
                  <span>
                    <strong>{c.userName}</strong>
                    <span className={styles.muted}> · +91 {c.userMobile}</span>
                    <span className={styles.candidateMeta}>{c.title} · won {fmt(c.spunAt)}</span>
                  </span>
                  <span className={`${styles.status} ${styles[`status${c.status}`]}`}>{c.status}</span>
                </button>
              ))}
            </div>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={reset} style={{ marginTop: 12 }}>
              Start over
            </button>
          </div>
        )}

        {!coupon && candidates.length === 0 && !notFound && (
          <div className={styles.claimEmpty}>
            <Icon name="ticket" size={40} />
            <p className={styles.emptyTitle}>No coupon checked yet</p>
            <ol className={styles.claimSteps}>
              <li>Scan the customer&rsquo;s QR (or type their code).</li>
              <li>Check the coupon status shown here.</li>
              <li>If it&rsquo;s ready, approve the claim — it redeems instantly and can&rsquo;t be scanned again.</li>
            </ol>
          </div>
        )}

        {notFound && candidates.length === 0 && (
          <div className={styles.claimEmpty}>
            <p className={styles.redeemError} role="alert">{notFound}</p>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={reset}>
              Try another code
            </button>
          </div>
        )}

        {coupon && (
          <div>
            <div className={styles.claimHead}>
              <div>
                <p className={styles.claimTitle}>{coupon.title}</p>
                {coupon.product && <p className={styles.muted}>{coupon.product}</p>}
              </div>
              <span className={`${styles.status} ${styles[`status${coupon.status}`]}`}>{status.label}</span>
            </div>

            <p className={styles.claimHint}>{status.hint}</p>

            <dl className={styles.claimFacts}>
              <div><dt>Customer</dt><dd>{coupon.userName}</dd></div>
              <div><dt>Mobile</dt><dd>+91 {coupon.userMobile}</dd></div>
              <div><dt>Code</dt><dd><span className={styles.code}>{coupon.code}</span></dd></div>
              <div><dt>Won on</dt><dd>{fmt(coupon.spunAt)}</dd></div>
              <div><dt>Valid till</dt><dd>{coupon.expiresAt ? fmt(coupon.expiresAt) : "No expiry"}</dd></div>
            </dl>

            {notice && (
              <p className={coupon.status === "redeemed" && notice.startsWith("Claim approved") ? styles.claimOk : styles.redeemError} role="status">
                {notice}
              </p>
            )}

            <div className={styles.actions}>
              {coupon.status === "active" ? (
                <button type="button" className={styles.btn} onClick={claim} disabled={claiming}>
                  {claiming ? "Approving…" : "✓ Approve claim"}
                </button>
              ) : (
                <button type="button" className={styles.btn} disabled>
                  {coupon.status === "redeemed" ? "Already redeemed" : "Can't be claimed"}
                </button>
              )}
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={reset}>
                Scan next coupon
              </button>
            </div>
          </div>
        )}
      </section>
    </div>

    <section className={`${styles.card} ${styles.redeemedCard}`} aria-labelledby="redeemed-title">
      <div className={styles.couponHead}>
        <div>
          <h3 className={styles.cardTitle} id="redeemed-title">Redeemed coupons</h3>
          <p className={styles.cardDesc}>
            Every coupon claimed at the counter, newest first — who claimed it, what they won, and when.
          </p>
        </div>
        <span className={`${styles.badge} ${styles.badgeOn}`}>{redeemed.length} redeemed</span>
      </div>

      <div className={styles.redeemedStats}>
        <div><strong>{redeemed.length}</strong><span>total claimed</span></div>
        <div><strong>{redeemedToday}</strong><span>claimed today</span></div>
        <div><strong>{redeemedCustomers}</strong><span>customers</span></div>
      </div>

      <div className={styles.searchRow}>
        <span className={styles.searchIcon} aria-hidden="true">🔍</span>
        <input
          className={styles.input}
          style={{ paddingLeft: 38 }}
          type="search"
          aria-label="Search redeemed coupons by name, phone, coupon, or code"
          placeholder="Search name, phone, coupon, or code…"
          value={listQuery}
          onChange={(e) => setListQuery(e.target.value)}
        />
        {listQuery && (
          <button type="button" className={styles.searchClear} onClick={() => setListQuery("")} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {visibleRedeemed.length === 0 ? (
        <div className={styles.empty}>
          {redeemed.length === 0
            ? "No coupons redeemed yet. Claimed coupons will appear here."
            : "No redeemed coupons match your search."}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Coupon</th>
                <th>Code</th>
                <th>Won on</th>
                <th>Redeemed on</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleRedeemed.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.userName || "—"}</strong>
                    <span className={styles.cellSub}>+91 {s.userMobile}</span>
                  </td>
                  <td>
                    {s.couponTitle || "—"}
                    {s.product && <span className={styles.cellSub}>{s.product}</span>}
                  </td>
                  <td>{s.code ? <span className={styles.code}>{s.code}</span> : "—"}</td>
                  <td className={styles.muted}>{fmt(s.spunAt)}</td>
                  <td className={styles.muted}>{s.redeemedAt ? fmt(s.redeemedAt) : "—"}</td>
                  <td><span className={`${styles.status} ${styles.statusredeemed}`}>Redeemed</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
    </>
  );
}
