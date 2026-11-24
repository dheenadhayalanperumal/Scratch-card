"use client";

import { useRef, useState } from "react";
import styles from "./admin.module.css";
import {
  FESTIVAL_TEMPLATES,
  PARTICLE_IDS,
  PARTICLE_LABELS,
  liveFestival,
} from "@/lib/theme";

const newFestivalId = () => `fest-${Math.random().toString(36).slice(2, 10)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

// Downscale + JPEG-encode an uploaded festival background. A raw phone photo
// is several MB; as a base64 data URL it blows past the server's image cap
// and the whole settings save gets rejected — which used to look like "the
// image didn't take". At 1280px / q0.85 the result is a few hundred KB.
function compressBgImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Step down until the data URL is safely under the server's per-image
      // cap — noisy/high-detail photos need the smaller, softer encodes.
      const attempts = [
        { max: 1280, quality: 0.85 },
        { max: 1024, quality: 0.8 },
        { max: 800, quality: 0.72 },
      ];
      let out = "";
      for (const { max, quality } of attempts) {
        const scale = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((img.naturalWidth || max) * scale));
        canvas.height = Math.max(1, Math.round((img.naturalHeight || max) * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        out = canvas.toDataURL("image/jpeg", quality);
        if (out.length <= 1_200_000) break;
      }
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image couldn't be read."));
    };
    img.src = url;
  });
}

// Where a festival stands right now, for its status chip in the list.
function festivalStatus(f, live, activeFestivalId) {
  if (f.enabled === false) return "Switched off";
  if (live?.id === f.id) return live.via === "schedule" ? "● Live now — by date" : "● Live now — manual";
  const today = todayStr();
  if (f.start && f.end && today >= f.start && today <= f.end) return "In its date window";
  if (f.start && today < f.start) return `Starts ${f.start}`;
  if (f.end && today > f.end) return `Ended ${f.end}`;
  if (activeFestivalId === f.id) return "Manually picked";
  if (f.start || f.end) return "Scheduled";
  return "Not active";
}

const PRESETS = ["#f0588e", "#f7a53b", "#f5b544", "#21b85a", "#e0407f", "#3b6fe5"];

export default function Branding({ settings, onChange, onSave, saving, saved, saveError }) {
  const fileRef = useRef(null);
  const [error, setError] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);

  const handleLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setError("Logo must be under 1.5 MB.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => onChange({ logoImage: reader.result });
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Brand identity</h3>
        <p className={styles.cardDesc}>
          These control the logo, name and tagline shown on the public scratch page.
        </p>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Brand name</label>
            <input
              className={styles.input}
              value={settings.brandName}
              onChange={(e) => onChange({ brandName: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Tagline</label>
            <input
              className={styles.input}
              value={settings.tagline}
              onChange={(e) => onChange({ tagline: e.target.value })}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Logo</label>
          <div className={styles.colorRow}>
            <div
              className={styles.brandMark}
              style={{ background: settings.accentColor, width: 56, height: 56 }}
            >
              {settings.logoImage ? (
                <img src={settings.logoImage} alt="logo" />
              ) : (
                <span>{(settings.logoText || settings.brandName || "?").slice(0, 1)}</span>
              )}
            </div>
            <input
              className={styles.input}
              style={{ maxWidth: 160 }}
              placeholder="Logo text (fallback)"
              value={settings.logoText || ""}
              onChange={(e) => onChange({ logoText: e.target.value })}
            />
            <button className={styles.btnGhost + " " + styles.btn} onClick={() => fileRef.current?.click()}>
              Upload image
            </button>
            {settings.logoImage && (
              <button className={styles.btnDanger + " " + styles.btn} onClick={() => onChange({ logoImage: null })}>
                Remove
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleLogo} />
          </div>
          {error && <p className={styles.error} style={{ marginTop: 10 }}>{error}</p>}
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Theme colors</h3>
        <p className={styles.cardDesc}>The accent color drives buttons, highlights and the card foil — on the scratch page and in this admin.</p>
        <div className={styles.grid2}>
          <ColorField
            label="Primary / theme color"
            value={settings.themeColor}
            onChange={(v) => onChange({ themeColor: v })}
          />
          <ColorField
            label="Accent color"
            value={settings.accentColor}
            onChange={(v) => onChange({ accentColor: v })}
          />
        </div>
        <div className={styles.colorRow} style={{ marginTop: 6, flexWrap: "wrap" }}>
          {PRESETS.map((c) => (
            <button
              key={c}
              className={styles.swatch}
              aria-label={`Use theme color ${c}`}
              aria-pressed={settings.themeColor === c}
              onClick={() => onChange({ themeColor: c })}
              style={{
                width: 30, height: 30, borderRadius: 8, background: c,
                border: "1px solid rgba(0,0,0,0.12)",
                boxShadow: settings.themeColor === c ? "0 0 0 2px #fff, 0 0 0 4px var(--bottle)" : "none",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Festivals &amp; seasonal skins</h3>
        <p className={styles.cardDesc}>
          Create as many festival skins as you like — Pongal, Diwali, a shop anniversary, anything.
          Each one has its own name, dates, colors, background image and effect. A festival switches
          on automatically inside its start/end dates and back off after; or activate one manually
          below. Hit <strong>Save changes</strong> at the bottom to publish.
        </p>

        {(() => {
          const festivals = settings.festivals || [];
          const live = liveFestival(settings);
          const updateFestival = (id, patch) =>
            onChange({ festivals: festivals.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
          const removeFestival = (f) => {
            if (!window.confirm(`Delete the "${f.name}" festival skin? This can't be undone.`)) return;
            onChange({
              festivals: festivals.filter((x) => x.id !== f.id),
              ...(settings.activeFestivalId === f.id ? { activeFestivalId: null } : {}),
            });
          };
          const addFestival = (key) => {
            const t = FESTIVAL_TEMPLATES[key];
            onChange({
              festivals: [
                ...festivals,
                {
                  id: newFestivalId(),
                  name: t.name,
                  start: "",
                  end: "",
                  themeColor: t.themeColor,
                  accentColor: t.accentColor,
                  bgFrom: t.bgFrom,
                  bgTo: t.bgTo,
                  bgImage: null,
                  particles: t.particles,
                  enabled: true,
                },
              ],
            });
          };
          return (
            <>
              <p className={styles.cardDesc} role="status">
                Showing on the scratch page right now:{" "}
                <strong>{live ? `${live.name} festival skin` : "Default brand look"}</strong>
                {live?.via === "schedule" ? " (switched on by its dates)" : live ? " (manually activated)" : ""}
              </p>

              <div className={styles.field}>
                <label className={styles.label}>Manually active festival</label>
                <select
                  className={styles.select}
                  value={settings.activeFestivalId || ""}
                  onChange={(e) => onChange({ activeFestivalId: e.target.value || null })}
                >
                  <option value="">None — use brand default (unless a festival is in its dates)</option>
                  {festivals.filter((f) => f.enabled !== false).map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <p className={styles.help}>
                  A festival inside its date window always wins over this manual pick while the window lasts.
                </p>
              </div>

              {festivals.length === 0 && (
                <div className={styles.empty}>No festivals yet. Add your first one below.</div>
              )}

              {festivals.map((f) => (
                <FestivalEditor
                  key={f.id}
                  festival={f}
                  status={festivalStatus(f, live, settings.activeFestivalId)}
                  isManualActive={settings.activeFestivalId === f.id}
                  onChange={(patch) => updateFestival(f.id, patch)}
                  onRemove={() => removeFestival(f)}
                  onToggleManual={() =>
                    onChange({ activeFestivalId: settings.activeFestivalId === f.id ? null : f.id })
                  }
                />
              ))}

              <div className={styles.field} style={{ marginTop: 16 }}>
                <label className={styles.label}>Add a festival</label>
                <div className={styles.actions} style={{ flexWrap: "wrap" }}>
                  <button type="button" className={styles.btn} onClick={() => addFestival("custom")}>
                    + Custom festival
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => addFestival("diwali")}>
                    + Diwali
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => addFestival("christmas")}>
                    + Christmas
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => addFestival("newyear")}>
                    + New Year
                  </button>
                </div>
                <p className={styles.help}>
                  Presets are just starting points — every festival stays fully editable and deletable.
                </p>
              </div>
            </>
          );
        })()}
      </div>

      <div className={styles.actions}>
        <button
          className={styles.btn}
          onClick={async () => {
            setSaveFailed(false);
            if ((await onSave()) === false) setSaveFailed(true);
          }}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className={styles.saved}>Saved ✓</span>}
        {saveFailed && (
          <span className={styles.error} role="alert">
            ⚠ Couldn&rsquo;t save{saveError ? `: ${saveError}` : " — check the message at the top of the page."}
          </span>
        )}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.colorRow}>
        <input type="color" className={styles.colorInput} value={value} onChange={(e) => onChange(e.target.value)} />
        <input className={styles.input} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

// One festival in the dynamic list: name, auto-activate date window, colors
// (theme/accent + background gradient), background image and particle effect.
// Everything writes into settings.festivals[] via onChange(patch).
function FestivalEditor({ festival: f, status, isManualActive, onChange, onRemove, onToggleManual }) {
  const fileRef = useRef(null);
  const [imgError, setImgError] = useState("");

  const handleBgImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImgError("");
    try {
      // Small files keep their original format; anything bigger is resized
      // down so the save can't be rejected for image size.
      if (file.size <= 700 * 1024) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        onChange({ bgImage: dataUrl });
      } else {
        onChange({ bgImage: await compressBgImage(file) });
      }
    } catch {
      setImgError("That image couldn't be read. Try a different photo.");
    }
  };

  const gradient = `radial-gradient(circle at 50% -10%, ${f.bgFrom || "#2a1f49"} 0%, ${f.bgTo || "#0a0814"} 100%)`;

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16, marginTop: 16 }}>
      <div className={styles.colorRow} style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <label className={styles.label} style={{ fontSize: 15, margin: 0 }}>
          <span
            style={{
              display: "inline-block", width: 10, height: 10, borderRadius: 4,
              background: f.accentColor || "#999", marginRight: 6,
            }}
          />
          {f.name || "Untitled festival"}
        </label>
        <span className={`${styles.badge} ${status.startsWith("●") ? styles.badgeOn : styles.badgeOff}`}>{status}</span>
      </div>

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Festival name</label>
          <input
            className={styles.input}
            value={f.name || ""}
            placeholder="e.g. Pongal Offer Week"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Skin switched on</label>
          <select
            className={styles.select}
            value={f.enabled === false ? "off" : "on"}
            onChange={(e) => onChange({ enabled: e.target.value === "on" })}
          >
            <option value="on">On — can go live</option>
            <option value="off">Off — never shows</option>
          </select>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Start date (auto-activate)</label>
          <input
            type="date"
            className={styles.input}
            value={f.start || ""}
            onChange={(e) => onChange({ start: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>End date (auto-deactivate)</label>
          <input
            type="date"
            className={styles.input}
            value={f.end || ""}
            onChange={(e) => onChange({ end: e.target.value })}
          />
        </div>
      </div>
      <p className={styles.help}>
        Leave both dates blank to control this festival only with the manual activation above.
      </p>

      <div className={styles.grid2}>
        <ColorField
          label="Theme color"
          value={f.themeColor || "#7c3aed"}
          onChange={(v) => onChange({ themeColor: v })}
        />
        <ColorField
          label="Accent color"
          value={f.accentColor || "#f5b544"}
          onChange={(v) => onChange({ accentColor: v })}
        />
      </div>
      <div className={styles.grid2}>
        <ColorField
          label="Background color (top)"
          value={f.bgFrom || "#2a1f49"}
          onChange={(v) => onChange({ bgFrom: v })}
        />
        <ColorField
          label="Background color (bottom)"
          value={f.bgTo || "#0a0814"}
          onChange={(v) => onChange({ bgTo: v })}
        />
      </div>

      <div className={styles.field} style={{ marginTop: 10 }}>
        <label className={styles.label}>Background image (optional — replaces the gradient above; large photos are auto-resized)</label>
        <div className={styles.colorRow}>
          <div
            className={styles.brandMark}
            style={{
              width: 56, height: 56,
              background: f.bgImage ? `url("${f.bgImage}") center / cover no-repeat` : gradient,
            }}
          />
          <button type="button" className={styles.btnGhost + " " + styles.btn} onClick={() => fileRef.current?.click()}>
            Upload image
          </button>
          {f.bgImage && (
            <button type="button" className={styles.btnDanger + " " + styles.btn} onClick={() => onChange({ bgImage: null })}>
              Remove
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleBgImage} />
        </div>
        {imgError && <p className={styles.error} style={{ marginTop: 10 }}>{imgError}</p>}
      </div>

      <div className={styles.field} style={{ marginTop: 10 }}>
        <label className={styles.label}>Particle / splash effect</label>
        <select
          className={styles.select}
          value={f.particles || "none"}
          onChange={(e) => onChange({ particles: e.target.value })}
        >
          {PARTICLE_IDS.map((pid) => (
            <option key={pid} value={pid}>{PARTICLE_LABELS[pid]}</option>
          ))}
        </select>
      </div>

      <div className={styles.actions} style={{ marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className={`${styles.btn} ${isManualActive ? styles.btnGhost : ""}`}
          onClick={onToggleManual}
          disabled={f.enabled === false}
        >
          {isManualActive ? "Deactivate manually" : "Activate now (manual)"}
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={onRemove}>
          Delete festival
        </button>
      </div>
    </div>
  );
}
