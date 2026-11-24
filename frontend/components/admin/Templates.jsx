"use client";

import { useEffect, useState } from "react";
import { TOKENS, renderPreview } from "@/lib/wa";
import styles from "./admin.module.css";

export default function Templates({ templates, rewardTemplateName, brandName, onCreate, onUpdate, onDelete }) {
  const [error, setError] = useState("");

  const guard = (fn) => async (...args) => {
    setError("");
    try {
      await fn(...args);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <CreateForm onCreate={guard(onCreate)} brandName={brandName} />

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Saved templates ({templates.length})</h3>
        <p className={styles.cardDesc}>
          Reusable message bodies. The one named <strong>{rewardTemplateName || "scratch_card_reward"}</strong> is
          sent automatically after a winning scratch; the rest are available in the Promotions menu. Copy must be
          submitted to Meta for approval before going live.
        </p>
        {templates.length === 0 ? (
          <div className={styles.empty}>No templates yet — create one above.</div>
        ) : (
          templates.map((t) => (
            <TemplateItem
              key={t.id}
              template={t}
              isReward={t.name === rewardTemplateName}
              brandName={brandName}
              onUpdate={guard(onUpdate)}
              onDelete={guard(onDelete)}
            />
          ))
        )}
      </div>

      {error && <p className={styles.error}>⚠ {error}</p>}
    </div>
  );
}

function CreateForm({ onCreate, brandName }) {
  const blank = { name: "", body: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.body.trim()) return;
    setBusy(true);
    await onCreate(form);
    setForm(blank);
    setBusy(false);
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>New template</h3>
      <div className={styles.field}>
        <label className={styles.label}>Template name</label>
        <input
          className={styles.input}
          placeholder="e.g. festival_offer"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className={styles.colorRow} style={{ flexWrap: "wrap", marginBottom: 8 }}>
        {TOKENS.map((t) => (
          <button key={t} className={`${styles.btnGhost} ${styles.btn}`} onClick={() => setForm((f) => ({ ...f, body: `${f.body}${t}` }))}>
            {t}
          </button>
        ))}
      </div>
      <textarea
        className={styles.input}
        style={{ minHeight: 90, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        placeholder="Hey [Name]! …  Reply STOP to unsubscribe."
        value={form.body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
      />
      {form.body && (
        <div className={styles.field} style={{ marginTop: 12 }}>
          <label className={styles.label}>Preview</label>
          <div className={styles.waPreview}>{renderPreview(form.body, brandName)}</div>
        </div>
      )}
      <div className={styles.actions}>
        <button className={styles.btn} onClick={submit} disabled={busy || !form.name.trim() || !form.body.trim()}>
          {busy ? "Saving…" : "Save template"}
        </button>
      </div>
    </div>
  );
}

function TemplateItem({ template, isReward, brandName, onUpdate, onDelete }) {
  const [form, setForm] = useState(template);
  const [busy, setBusy] = useState(false);
  const dirty = form.name !== template.name || form.body !== template.body;

  useEffect(() => setForm(template), [template]);

  const save = async () => {
    setBusy(true);
    await onUpdate(template.id, { name: form.name, body: form.body });
    setBusy(false);
  };

  return (
    <div className={styles.card} style={{ background: "var(--field)", marginBottom: 14 }}>
      <div className={styles.couponHead}>
        <input
          className={styles.input}
          style={{ fontWeight: 700, maxWidth: 280 }}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        {isReward && <span className={`${styles.badge} ${styles.badgeOn}`}>Scratch reward</span>}
      </div>
      <textarea
        className={styles.input}
        style={{ minHeight: 90, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, marginTop: 10 }}
        value={form.body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
      />
      <div className={styles.field} style={{ marginTop: 12 }}>
        <label className={styles.label}>Preview</label>
        <div className={styles.waPreview}>{renderPreview(form.body, brandName)}</div>
      </div>
      <div className={styles.actions} style={{ flexWrap: "wrap" }}>
        <button className={styles.btn} onClick={save} disabled={!dirty || busy}>
          {busy ? "…" : "Save"}
        </button>
        <button
          className={`${styles.btnDanger} ${styles.btn}`}
          onClick={() => onDelete(template.id)}
          disabled={isReward}
          title={isReward ? "This template is used for the scratch reward" : "Delete template"}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
