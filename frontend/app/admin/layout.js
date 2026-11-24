"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminApi, getAdminToken, setAdminToken } from "@/lib/api";
import styles from "@/components/admin/admin.module.css";
import CardLoader from "@/components/admin/CardLoader";
import AdminLogin from "@/components/admin/AdminLogin";
import Icon from "@/components/admin/Icon";
import ActivityTicker from "@/components/admin/ActivityTicker";
import { TABS } from "./tabs";
import { AdminContext } from "./adminContext";

/** Strip any trailing slash so "/admin/branding/" and "/admin/branding" match.
 *  The root "/" is left alone so it never collapses to an empty string. */
const stripSlash = (p) => {
  const s = String(p || "");
  return s.length > 1 ? s.replace(/\/+$/, "") : s;
};

const samePath = (a, b) => stripSlash(a) === stripSlash(b);

export default function AdminLayout({ children }) {
  const pathname = usePathname();

  // OTP sign-in gate: "checking" (validating a saved token) → "in" / "out".
  const [auth, setAuth] = useState("checking");
  const [adminMobile, setAdminMobile] = useState(null);

  const [settings, setSettings] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [segments, setSegments] = useState([]);
  const [users, setUsers] = useState([]);
  const [spins, setSpins] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState("");

  const [savingBrand, setSavingBrand] = useState(false);
  const [savedBrand, setSavedBrand] = useState(false);
  const [savingWheel, setSavingWheel] = useState(false);
  const [savedWheel, setSavedWheel] = useState(false);
  const [savingWa, setSavingWa] = useState(false);
  const [savedWa, setSavedWa] = useState(false);

  const loadAll = useCallback(async () => {
    // Clear first so a retry visibly returns to the loading state. Without
    // this, retrying into the same failure sets an identical error string,
    // React bails out of the re-render, and the button looks inert.
    setError("");
    try {
      const [s, c, seg, u, sp, st, tpl] = await Promise.all([
        adminApi.getSettings(),
        adminApi.getCoupons(),
        adminApi.getSegments(),
        adminApi.getUsers(),
        adminApi.getSpins(),
        adminApi.getStats(),
        adminApi.getTemplates(),
      ]);
      setSettings(s);
      setCoupons(c);
      setSegments(seg);
      setUsers(u);
      setSpins(sp);
      setStats(st);
      setTemplates(tpl);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Sign-in check on first mount: a saved token gets validated, then the
  // panel data loads. No token (or a stale one) → the OTP login screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAdminToken()) {
        if (!cancelled) setAuth("out");
        return;
      }
      try {
        const me = await adminApi.adminMe();
        if (cancelled) return;
        setAdminMobile(me.mobile);
        setAuth("in");
        loadAll();
      } catch {
        if (cancelled) return;
        setAdminToken(null);
        setAuth("out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  // lib/api fires this when any admin call gets a 401 (expired token).
  useEffect(() => {
    const bounce = () => {
      setAdminMobile(null);
      setSettings(null);
      setAuth("out");
    };
    window.addEventListener("admin-unauthorized", bounce);
    return () => window.removeEventListener("admin-unauthorized", bounce);
  }, []);

  const handleLogin = (mobile) => {
    setAdminMobile(mobile);
    setAuth("in");
    loadAll();
  };

  const handleLogout = async () => {
    try {
      await adminApi.logoutAdmin();
    } catch {}
    setAdminToken(null);
    setAdminMobile(null);
    setSettings(null);
    setAuth("out");
  };

  const flash = (setter) => {
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const patchSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));

  const saveBranding = async () => {
    setSavingBrand(true);
    try {
      const updated = await adminApi.saveSettings(settings);
      setSettings(updated);
      flash(setSavedBrand);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setSavingBrand(false);
    }
  };

  const saveWheel = async ({ segments: segs, wheelSize, maxSpinsPer }) => {
    setSavingWheel(true);
    try {
      const [savedSegs, updated] = await Promise.all([
        adminApi.saveSegments(segs),
        adminApi.saveSettings({ wheelSize, maxSpinsPer }),
      ]);
      setSegments(savedSegs);
      setSettings(updated);
      flash(setSavedWheel);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingWheel(false);
    }
  };

  const saveWhatsApp = async () => {
    setSavingWa(true);
    try {
      const updated = await adminApi.saveSettings({
        waEnabled: settings.waEnabled,
        waPhoneNumberId: settings.waPhoneNumberId,
        waTemplateName: settings.waTemplateName,
        waTemplateBody: settings.waTemplateBody,
      });
      setSettings(updated);
      flash(setSavedWa);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingWa(false);
    }
  };

  const createCoupon = async (data) => {
    await adminApi.createCoupon(data);
    setCoupons(await adminApi.getCoupons());
  };
  const updateCoupon = async (id, patch) => {
    await adminApi.updateCoupon(id, patch);
    setCoupons(await adminApi.getCoupons());
  };
  const deleteCoupon = async (id) => {
    await adminApi.deleteCoupon(id);
    const [c, seg] = await Promise.all([adminApi.getCoupons(), adminApi.getSegments()]);
    setCoupons(c);
    setSegments(seg);
  };

  const updateSpinStatus = async (id, status) => {
    await adminApi.updateSpinStatus(id, status);
    const [sp, u, st] = await Promise.all([
      adminApi.getSpins(),
      adminApi.getUsers(),
      adminApi.getStats(),
    ]);
    setSpins(sp);
    setUsers(u);
    setStats(st);
  };

  const createTemplate = async (data) => {
    await adminApi.createTemplate(data);
    setTemplates(await adminApi.getTemplates());
  };
  const updateTemplate = async (id, patch) => {
    await adminApi.updateTemplate(id, patch);
    setTemplates(await adminApi.getTemplates());
  };
  const deleteTemplate = async (id) => {
    await adminApi.deleteTemplate(id);
    setTemplates(await adminApi.getTemplates());
  };

  const refreshRecords = async () => {
    const [u, sp, st] = await Promise.all([
      adminApi.getUsers(),
      adminApi.getSpins(),
      adminApi.getStats(),
    ]);
    setUsers(u);
    setSpins(sp);
    setStats(st);
  };

  if (auth === "checking") {
    return (
      <div className={`${styles.shell} ${styles.shellBoot}`}>
        <CardLoader fullscreen size={156} label="Checking sign-in" caption="One moment" />
      </div>
    );
  }

  if (auth === "out") {
    return (
      <div className={styles.shell}>
        <AdminLogin onLogin={handleLogin} />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={`${styles.shell} ${styles.shellBoot}`}>
        {error ? (
          <div className={styles.bootPane}>
            <div className={styles.bootError} role="alert">
              <p className={styles.bootErrorTitle}>
                <span aria-hidden="true">⚠</span> Couldn’t load the admin
              </p>
              <p className={styles.bootErrorBody}>{error}</p>
              <button className={styles.btn} onClick={loadAll} autoFocus>
                <span aria-hidden="true">↻</span> Try again
              </button>
            </div>
          </div>
        ) : (
          <CardLoader fullscreen size={156} label="Loading admin" caption="Polishing the cards" />
        )}
      </div>
    );
  }

  // next.config.js sets `trailingSlash: true`, so usePathname() yields
  // "/admin/branding/" while TABS stores "/admin/branding". Compare the two
  // normalized, or nothing ever matches and every page falls back to TABS[0]
  // — which is what made Dashboard look permanently active.
  const active = TABS.find((t) => samePath(t.path, pathname)) || TABS[0];

  const value = {
    settings, setSettings, patchSettings,
    coupons, segments, users, spins, stats, templates, error,
    savingBrand, savedBrand, savingWheel, savedWheel, savingWa, savedWa,
    saveBranding, saveWheel, saveWhatsApp,
    createCoupon, updateCoupon, deleteCoupon,
    createTemplate, updateTemplate, deleteTemplate,
    updateSpinStatus, refreshRecords,
  };

  const initials = (settings.brandName || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={styles.shell}>
      <header className={styles.topnav}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            {settings.logoImage ? <img src={settings.logoImage} alt="" /> : (settings.logoText || settings.brandName || "?").slice(0, 1)}
          </div>
          <div className={styles.brandName}>{settings.brandName}</div>
        </div>

        <nav className={styles.pills} aria-label="Admin sections">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.path}
              aria-current={active.id === t.id ? "page" : undefined}
              className={`${styles.pill} ${active.id === t.id ? styles.pillActive : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className={styles.navActions}>
          <Link className={`${styles.iconBtn} ${styles.redeemQuick}`} href="/admin/redeem" aria-label="Redeem a coupon (scan QR)" title="Redeem a coupon — scan QR">
            <Icon name="scan" size={18} />
          </Link>
          <a className={styles.iconBtn} href="/" target="_blank" rel="noreferrer" aria-label="View live page" title="View live page">
            <Icon name="external" size={17} />
          </a>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ padding: "8px 12px", minHeight: 38 }}
            onClick={handleLogout}
            title={adminMobile ? `Signed in as +91 ${adminMobile} — sign out` : "Sign out"}
          >
            Sign out
          </button>
          <div className={styles.avatar} aria-hidden="true">{initials}</div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.pageHead}>
          <div>
            <h1 className={styles.title}>{active.label}</h1>
            <ActivityTicker spins={spins} />
          </div>
          {stats && (
            <div className={styles.stats}>
              <Stat n={stats.users} label="users" />
              <Stat n={stats.spins} label="plays" />
              <Stat n={stats.wins} label="wins" />
              <Stat n={stats.redeemed} label="redeemed" />
            </div>
          )}
        </div>

        <div className={styles.content}>
          {error && <p className={styles.error}>⚠ {error}</p>}
          <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
        </div>
      </main>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statNum}>{n}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
