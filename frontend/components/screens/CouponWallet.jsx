"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import QrCode from "@/components/QrCode";
import { RENDER_MODE, useEntrance } from "@/lib/clock";
import { easeOutCubic } from "@/lib/motion";
import { api } from "@/lib/api";
import styles from "./CouponWallet.module.css";

const TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
  { id: "redeemed", label: "Redeemed" },
];

const EMPTY = {
  all: ["No coupons yet", "Scratch a card — every prize you win lands here."],
  active: ["Nothing to redeem", "Win a prize and it will show up here, ready to use."],
  expired: ["No expired coupons", "Nice — you haven't let a reward slip away."],
  redeemed: ["Nothing redeemed yet", "Show a code at the counter and it moves here."],
};

/**
 * "My coupons" wallet — every coupon the signed-in customer has won, filterable
 * by status. Rows follow the Streaks rewards wallet: icon tile, title, code and
 * a status pill; tapping one opens its code.
 */
export default function CouponWallet({ token, segments, brand, onClose, onLogout }) {
  const [coupons, setCoupons] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  // Render mode has no rAF, so the clock never advances on its own — paint the
  // settled frame there instead of leaving the whole wallet at opacity 0.
  const entrance = useEntrance(0.45);
  const enter = RENDER_MODE ? 1 : easeOutCubic(entrance);
  const backRef = useRef(null);
  const panelRef = useRef(null);

  const load = () => {
    setError("");
    setCoupons(null);
    api
      .myCoupons(token)
      .then((d) => setCoupons(d.coupons))
      .catch((e) => setError(e.message));
  };

  useEffect(load, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => backRef.current?.focus({ preventScroll: true }), []);

  // The device frame can be taller than the viewport (short phones, or the
  // page was scrolled to the card). Bring the wallet's top into view and
  // lock page scroll while it is open so the header and logo can't sit
  // off-screen; restore the customer's scroll position on close.
  useEffect(() => {
    const root = document.documentElement;
    const y = window.scrollY;
    // Measure the containing box (same as the panel at inset 0) — the panel
    // itself is still translated by its entrance on this first frame.
    const r = (panelRef.current?.offsetParent || panelRef.current)?.getBoundingClientRect();
    if (r && (r.top < 0 || (r.top > 0 && r.bottom > window.innerHeight))) {
      window.scrollTo(0, Math.max(0, y + r.top));
    }
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
      window.scrollTo(0, y);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && (open ? setOpen(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const images = useMemo(() => Object.fromEntries((segments || []).map((s) => [s.id, s.image])), [segments]);
  const counts = useMemo(() => {
    const c = { all: coupons?.length || 0, active: 0, expired: 0, redeemed: 0 };
    coupons?.forEach((x) => c[x.status]++);
    return c;
  }, [coupons]);
  const shown = coupons?.filter((c) => tab === "all" || c.status === tab) || [];

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      style={{ opacity: enter, transform: `translateY(${(1 - enter) * 24}px)` }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-title"
    >
      {/* Capped at the viewport height so the header and tabs stay visible,
          only the list scrolls, and the detail modal centres on screen. */}
      <div className={styles.frame}>
      <header className={styles.head}>
        <button ref={backRef} type="button" className={styles.back} onClick={onClose} aria-label="Back to the scratch card">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          <p className={styles.kicker}>Your rewards</p>
          <h2 id="wallet-title" className={styles.title}>
            My coupons
          </h2>
        </div>
        {(brand?.logoImage || brand?.logoText || brand?.brandName) && (
          <span className={styles.brandLogo} aria-hidden>
            <Thumb src={brand.logoImage} fallback={(brand.logoText || brand.brandName || "★").slice(0, 4)} />
          </span>
        )}
      </header>

      {coupons && counts.active > 0 && (
        <p className={styles.summary}>
          <strong>{counts.active}</strong> ready to use
        </p>
      )}

      <div className={styles.tabs} role="tablist" aria-label="Filter coupons">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {coupons && <span className={styles.count}>{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      <div className={styles.list} role="tabpanel" aria-busy={!coupons && !error}>
        {error ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Couldn’t load your coupons</p>
            <p className={styles.emptyText}>{error}</p>
            <button type="button" className={styles.retry} onClick={load}>
              Try again
            </button>
          </div>
        ) : !coupons ? (
          [0, 1, 2].map((i) => <div key={i} className={styles.skeleton} aria-hidden />)
        ) : shown.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden>
              🎟️
            </span>
            <p className={styles.emptyTitle}>{EMPTY[tab][0]}</p>
            <p className={styles.emptyText}>{EMPTY[tab][1]}</p>
          </div>
        ) : (
          shown.map((c, i) => (
            <CouponRow key={c.id} coupon={c} image={images[c.segmentId]} index={i} onOpen={() => setOpen(c)} />
          ))
        )}
        {/* Deliberately quiet: sits at the end of the list, muted text only.
            Two taps, so a stray touch while scrolling can't sign anyone out. */}
        {onLogout && (
          <button
            type="button"
            className={styles.logout}
            onClick={() => (confirmLogout ? onLogout() : setConfirmLogout(true))}
            onBlur={() => setConfirmLogout(false)}
          >
            {confirmLogout ? "Tap again to log out" : "Log out"}
          </button>
        )}
      </div>

      {open && <CouponDetail coupon={open} image={images[open.segmentId]} onClose={() => setOpen(null)} />}
      </div>
    </section>
  );
}

function CouponRow({ coupon: c, image, index, onOpen }) {
  const entrance = useEntrance(0.4, Math.min(index, 8) * 0.04);
  const p = RENDER_MODE ? 1 : easeOutCubic(entrance);
  return (
    <button
      type="button"
      className={`${styles.chip} ${styles[c.status]}`}
      onClick={onOpen}
      style={{ opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}
    >
      <span className={styles.icon}>
        <Thumb src={image} />
      </span>
      <span className={styles.body}>
        <span className={styles.chipTitle}>{c.title}</span>
        <span className={styles.code}>{c.code || "—"}</span>
        <span className={styles.meta}>{metaLine(c)}</span>
      </span>
      <span className={`${styles.status} ${styles[`s_${c.status}`]}`}>{c.status}</span>
    </button>
  );
}

function CouponDetail({ coupon: c, image, onClose }) {
  const [copied, setCopied] = useState(false);
  const doneRef = useRef(null);
  const live = c.status === "active";
  // The QR is the thing the counter scans, so it leads on a usable coupon.
  const showQr = live && Boolean(c.code);

  useEffect(() => {
    doneRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const kicker = { active: "Ready to use", redeemed: "Redeemed", expired: "Expired" }[c.status];
  const note = {
    active: "Show this QR at the counter to redeem — or read out the code below.",
    redeemed: "You’ve already used this reward. Thanks for visiting!",
    expired: "This coupon is past its validity date and can’t be redeemed.",
  }[c.status];

  return (
    <Modal label={`${c.title} coupon`}>
      <div className={styles.detail}>
        {!showQr && (
          <div className={`${styles.detailIcon} ${live ? "" : styles.faded}`}>
            <Thumb src={image} />
          </div>
        )}
        <p className={`${styles.detailKicker} ${styles[`k_${c.status}`]}`}>{kicker}</p>
        <h2 className={styles.detailTitle}>{c.title}</h2>
        {c.product && <p className={styles.detailProduct}>{c.product}</p>}
        <p className={styles.detailNote}>{note}</p>

        {showQr && (
          <div className={styles.qr}>
            {/* Encodes this customer's coupon instance (spin id + code), not
                just the code, so the counter's scan approves *their* claim
                even for static codes shared by many customers. The redeem
                desk still accepts the plain code typed/read aloud. */}
            <QrCode value={`SPIN1:${c.id}:${c.code}`} size={172} label={`QR code for coupon ${c.code}`} />
          </div>
        )}

        <div className={`${styles.ticket} ${live ? "" : styles.ticketDead}`}>
          <span className={styles.ticketCode}>{formatCode(c.code)}</span>
          {live && (
            <button type="button" className={styles.copy} onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>

        <dl className={styles.facts}>
          {c.store && (
            <div>
              <dt>Store</dt>
              <dd>{c.store}</dd>
            </div>
          )}
          <div>
            <dt>Won on</dt>
            <dd>{c.wonOn || "—"}</dd>
          </div>
          <div>
            <dt>{c.status === "expired" ? "Expired" : "Valid till"}</dt>
            <dd>{c.validUntil || "—"}</dd>
          </div>
        </dl>

        <div ref={doneRef}>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Prize/brand image that falls back to an emoji/text when missing or broken
 *  (deleted segment, dead upload URL) instead of an invisible broken image. */
function Thumb({ src, fallback = "🎟️" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <span aria-hidden>{fallback}</span>;
  return <img src={src} alt="" decoding="async" onError={() => setFailed(true)} />;
}

function metaLine(c) {
  if (c.status === "active") return c.validUntil ? `Valid till ${c.validUntil}` : "Ready to use";
  if (c.status === "expired") return c.validUntil ? `Expired ${c.validUntil}` : "Expired";
  return c.wonOn ? `Won ${c.wonOn}` : "Redeemed";
}

function formatCode(code) {
  if (!code) return "—";
  const [prefix, rest] = code.split("-");
  return rest ? `${prefix} - ${rest}` : prefix;
}
