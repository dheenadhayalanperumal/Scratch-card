"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { SEGMENTS, renderPreview } from "@/lib/wa";
import styles from "./admin.module.css";

export default function Promotions({ templates, brandName, waEnabled }) {
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState("all");
  const [recipientCount, setRecipientCount] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Default the selection to the first template once they're available.
  useEffect(() => {
    if (!templateId && templates[0]) {
      setTemplateId(templates[0].id);
      setMessage(templates[0].body);
    }
  }, [templates, templateId]);

  // Recipient count for the chosen segment.
  useEffect(() => {
    let active = true;
    setRecipientCount(null);
    adminApi
      .getRecipients(segment)
      .then((d) => active && setRecipientCount(d.count))
      .catch(() => active && setRecipientCount(null));
    return () => {
      active = false;
    };
  }, [segment]);

  const pickTemplate = (id) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setMessage(t.body);
    setResult(null);
  };

  const send = async () => {
    setError("");
    setResult(null);
    if (!message.trim()) return;
    setSending(true);
    try {
      const r = await adminApi.sendBroadcast(segment, message);
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {!waEnabled && (
        <p className={styles.error}>
          ⚠ WhatsApp delivery is turned off in the WhatsApp menu — turn it on to send promotions.
        </p>
      )}

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>1 · Choose a message template</h3>
        <p className={styles.cardDesc}>
          Pick a saved template from the Templates menu. You can tweak the copy below before sending —
          edits here don&rsquo;t change the saved template.
        </p>
        {templates.length === 0 ? (
          <div className={styles.empty}>No templates yet — create one in the Templates menu first.</div>
        ) : (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Template</label>
              <select
                className={styles.select}
                style={{ width: "100%" }}
                value={templateId}
                onChange={(e) => pickTemplate(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className={styles.input}
              style={{ minHeight: 100, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className={styles.field} style={{ marginTop: 12 }}>
              <label className={styles.label}>Preview</label>
              <div className={styles.waPreview}>{renderPreview(message, brandName)}</div>
            </div>
          </>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>2 · Choose the audience</h3>
        <p className={styles.cardDesc}>Opt-outs are always excluded.</p>
        <div className={styles.segPick}>
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              className={`${styles.segPickBtn} ${segment === s.id ? styles.segPickBtnOn : ""}`}
              onClick={() => setSegment(s.id)}
            >
              <span className={styles.segPickLabel}>{s.label}</span>
              <span className={styles.segPickDesc}>{s.desc}</span>
            </button>
          ))}
        </div>
        <p className={styles.cardDesc} style={{ marginTop: 12, marginBottom: 0 }}>
          {recipientCount == null ? (
            "Counting recipients…"
          ) : (
            <>
              This will reach <strong>{recipientCount}</strong> customer{recipientCount === 1 ? "" : "s"}.
            </>
          )}
        </p>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>3 · Send</h3>
        <div className={styles.actions}>
          <button
            className={styles.btn}
            onClick={send}
            disabled={sending || !waEnabled || !message.trim() || !recipientCount}
          >
            {sending ? "Sending…" : `Send to ${recipientCount ?? 0} customer${recipientCount === 1 ? "" : "s"}`}
          </button>
        </div>
        {result && (
          <p className={styles.couponMeta} style={{ marginTop: 12 }}>
            Sent to <strong>{result.total}</strong> · ✅ {result.sent || 0} sent · 🧪 {result.simulated || 0} simulated ·
            {" "}⚠️ {result.failed || 0} failed{result.skipped ? ` · ⏭️ ${result.skipped} skipped` : ""}
          </p>
        )}
        {error && <p className={styles.error} style={{ marginTop: 12 }}>⚠ {error}</p>}
      </div>
    </div>
  );
}
