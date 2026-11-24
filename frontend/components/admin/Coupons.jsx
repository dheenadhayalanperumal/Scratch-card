"use client";

import { useState } from "react";
import styles from "./admin.module.css";

export default function Coupons({ coupons, segments, onCreate, onUpdate, onDelete }) {
  const usageBySeg = segments.reduce((map, s) => {
    if (s.couponId) map[s.couponId] = (map[s.couponId] || 0) + 1;
    return map;
  }, {});

  return (
    <div>
      <CreateForm onCreate={onCreate} />
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Coupons ({coupons.length})</h3>
        <p className={styles.cardDesc}>
          Each coupon is a reward you can attach to a scratch-card prize. Linked coupons show how
          many segments pay them out.
        </p>
        {coupons.length === 0 ? (
          <div className={styles.empty}>No coupons yet — create your first reward above.</div>
        ) : (
          <div className={styles.couponGrid}>
            {coupons.map((c) => (
              <CouponItem
                key={c.id}
                coupon={c}
                linked={usageBySeg[c.id] || 0}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateForm({ onCreate }) {
  const blank = { title: "", product: "", codePrefix: "CCB", validityDays: 14, active: true, codeType: "generated", staticCode: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    await onCreate({ ...form, validityDays: Number(form.validityDays) || 1 });
    setForm(blank);
    setBusy(false);
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>New coupon</h3>
      <p className={styles.cardDesc}>Define a reward customers can win.</p>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Reward title</label>
          <input className={styles.input} placeholder="e.g. Free Coffee" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Product / details</label>
          <input className={styles.input} placeholder="e.g. Any regular coffee" value={form.product}
            onChange={(e) => setForm({ ...form, product: e.target.value })} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Validity (days)</label>
          <input className={styles.input} type="text" inputMode="numeric" placeholder="14" value={form.validityDays}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              setForm({ ...form, validityDays: digits === "" ? "" : String(Number(digits)) });
            }} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Code format</label>
          <select className={styles.select} style={{ width: "100%" }} value={form.codeType}
            onChange={(e) => setForm({ ...form, codeType: e.target.value })}>
            <option value="generated">Unique generated codes</option>
            <option value="static">Single static code</option>
          </select>
        </div>
        {form.codeType === "static" ? (
          <div className={styles.field}>
            <label className={styles.label}>Static code</label>
            <input className={styles.input} placeholder="e.g. WELCOME10" value={form.staticCode}
              onChange={(e) => setForm({ ...form, staticCode: e.target.value })} />
          </div>
        ) : (
          <div className={styles.field}>
            <label className={styles.label}>Code prefix</label>
            <input className={styles.input} value={form.codePrefix} maxLength={6}
              onChange={(e) => setForm({ ...form, codePrefix: e.target.value.toUpperCase() })} />
          </div>
        )}
      </div>
      <div className={styles.actions}>
        <button className={styles.btn} onClick={submit} disabled={busy || !form.title.trim()}>
          {busy ? "Adding…" : "Add coupon"}
        </button>
      </div>
    </div>
  );
}

function CouponItem({ coupon, linked, onUpdate, onDelete }) {
  const [form, setForm] = useState(coupon);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(coupon);

  const save = async () => {
    setBusy(true);
    await onUpdate(coupon.id, form);
    setBusy(false);
  };

  return (
    <div className={styles.couponCard}>
      <div className={styles.couponHead}>
        <input
          className={styles.input}
          style={{ fontWeight: 700 }}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <span className={`${styles.badge} ${form.active ? styles.badgeOn : styles.badgeOff}`}>
          {form.active ? "Active" : "Off"}
        </span>
      </div>
      <input
        className={styles.input}
        style={{ marginTop: 8 }}
        placeholder="Product"
        value={form.product}
        onChange={(e) => setForm({ ...form, product: e.target.value })}
      />
      <select
        className={styles.select}
        style={{ width: "100%", marginTop: 8 }}
        value={form.codeType || "generated"}
        onChange={(e) => setForm({ ...form, codeType: e.target.value })}
      >
        <option value="generated">Unique generated codes</option>
        <option value="static">Single static code</option>
      </select>
      {form.codeType === "static" && (
        <input
          className={styles.input}
          style={{ marginTop: 8 }}
          placeholder="Static code (e.g. WELCOME10)"
          value={form.staticCode || ""}
          onChange={(e) => setForm({ ...form, staticCode: e.target.value })}
        />
      )}
      <p className={styles.couponMeta}>
        Code{" "}
        <strong>{form.codeType === "static" ? (form.staticCode || "—") : `${form.codePrefix}-XXXX`}</strong>{" "}
        · {form.validityDays}d valid
        <br />
        Linked to {linked} segment{linked === 1 ? "" : "s"}
      </p>
      <div className={styles.actions} style={{ flexWrap: "wrap" }}>
        <button className={`${styles.btnGhost} ${styles.btn}`} onClick={() => setForm({ ...form, active: !form.active })}>
          {form.active ? "Disable" : "Enable"}
        </button>
        <button className={styles.btn} onClick={save} disabled={!dirty || busy}>
          {busy ? "…" : "Save"}
        </button>
        <button className={`${styles.btnDanger} ${styles.btn}`} onClick={() => onDelete(coupon.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}
