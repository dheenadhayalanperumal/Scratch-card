"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import styles from "./admin.module.css";

export default function WhatsApp({ settings, onChange, onSave, saving, saved }) {
  const [status, setStatus] = useState(null);
  const [optOuts, setOptOuts] = useState([]);
  const [newOptOut, setNewOptOut] = useState("");
  const [testMobile, setTestMobile] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");

  const loadModule = async () => {
    try {
      const [st, oo] = await Promise.all([adminApi.getWhatsAppStatus(), adminApi.getOptOuts()]);
      setStatus(st);
      setOptOuts(oo);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    loadModule();
  }, []);

  const addOptOut = async () => {
    setError("");
    try {
      await adminApi.addOptOut(newOptOut);
      setNewOptOut("");
      setOptOuts(await adminApi.getOptOuts());
    } catch (e) {
      setError(e.message);
    }
  };

  const removeOptOut = async (mobile) => {
    await adminApi.removeOptOut(mobile);
    setOptOuts(await adminApi.getOptOuts());
  };

  const sendTest = async () => {
    setError("");
    setTestResult(null);
    try {
      const r = await adminApi.sendWhatsAppTest(testMobile, "Test User");
      setTestResult(r);
      await loadModule();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.couponHead}>
          <h3 className={styles.cardTitle}>Delivery channel</h3>
          {status && (
            <span className={`${styles.badge} ${status.mode === "live" ? styles.badgeOn : styles.badgeOff}`}>
              {status.mode === "live" ? "Live · Meta API" : "Simulation mode"}
            </span>
          )}
        </div>
        <p className={styles.cardDesc}>
          After every winning scratch card, the prize confirmation + coupon code is sent to the customer&rsquo;s WhatsApp
          number. {status?.mode === "simulation" && (
            <>Credentials aren&rsquo;t configured, so messages are <strong>logged to the server console</strong> instead
            of sent. Set <code>WHATSAPP_ACCESS_TOKEN</code> and the phone number ID to go live.</>
          )}
        </p>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!settings.waEnabled}
            onChange={(e) => onChange({ waEnabled: e.target.checked })}
          />
          <span className={styles.label} style={{ margin: 0 }}>Enable WhatsApp delivery for this client</span>
        </label>

        <div className={styles.grid2} style={{ marginTop: 14 }}>
          <div className={styles.field}>
            <label className={styles.label}>Phone number ID (Meta)</label>
            <input
              className={styles.input}
              placeholder="e.g. 123456789012345"
              value={settings.waPhoneNumberId || ""}
              onChange={(e) => onChange({ waPhoneNumberId: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Scratch-reward template name</label>
            <input
              className={styles.input}
              placeholder="scratch_card_reward"
              value={settings.waTemplateName || ""}
              onChange={(e) => onChange({ waTemplateName: e.target.value })}
            />
          </div>
        </div>
        <p className={styles.cardDesc} style={{ marginTop: 0 }}>
          The reward sent after a scratch uses the template with this name from the <strong>Templates</strong> menu.
          The access token is read from the server&rsquo;s <code>WHATSAPP_ACCESS_TOKEN</code> env var and is never
          stored in the browser.
        </p>

        <div className={styles.actions}>
          <button className={styles.btn} onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
          {saved && <span className={styles.saved}>Saved ✓</span>}
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Send a test</h3>
        <p className={styles.cardDesc}>
          Sends the reward template (sample prize + code) to a number. In simulation mode it&rsquo;s
          logged on the server.
        </p>
        <div className={styles.colorRow} style={{ flexWrap: "wrap" }}>
          <input
            className={styles.input}
            style={{ maxWidth: 220 }}
            placeholder="10-digit mobile"
            value={testMobile}
            onChange={(e) => setTestMobile(e.target.value)}
          />
          <button className={styles.btn} onClick={sendTest} disabled={!testMobile.trim()}>
            Send test
          </button>
        </div>
        {testResult && (
          <p className={styles.couponMeta} style={{ marginTop: 12 }}>
            Result: <strong>{testResult.status}</strong>
            <br />
            <span className={styles.muted}>{testResult.text}</span>
          </p>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Opt-outs ({optOuts.length})</h3>
        <p className={styles.cardDesc}>
          Numbers that replied STOP are never messaged again. You can also add or release a number
          manually.
        </p>
        <div className={styles.colorRow} style={{ flexWrap: "wrap", marginBottom: 12 }}>
          <input
            className={styles.input}
            style={{ maxWidth: 220 }}
            placeholder="10-digit mobile"
            value={newOptOut}
            onChange={(e) => setNewOptOut(e.target.value)}
          />
          <button className={`${styles.btnGhost} ${styles.btn}`} onClick={addOptOut} disabled={!newOptOut.trim()}>
            Add opt-out
          </button>
        </div>
        {optOuts.length === 0 ? (
          <div className={styles.empty}>No opt-outs — everyone is reachable.</div>
        ) : (
          <div className={styles.couponGrid}>
            {optOuts.map((o) => (
              <div key={o.mobile} className={styles.couponCard} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className={styles.code}>+91 {o.mobile}</span>
                <button className={`${styles.btnDanger} ${styles.btn}`} onClick={() => removeOptOut(o.mobile)}>
                  Release
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className={styles.error}>⚠ {error}</p>}
    </div>
  );
}
