"use client";

import { useEffect, useRef, useState } from "react";
import ScratchCard from "@/components/ScratchCard";
import { hashString, mulberry32 } from "@/lib/motion";
import styles from "./admin.module.css";

const DEFAULT_COLORS = ["#F2A03D", "#3B6FE5", "#22314F", "#E0407F", "#7C5CFF", "#22B8A6"];

export default function CardEditor({ segments, coupons, wheelSize, maxSpinsPer, onSave, saving, saved }) {
  const [working, setWorking] = useState(segments);
  const [size, setSize] = useState(wheelSize || 320);
  const [maxSpins, setMaxSpins] = useState(maxSpinsPer || "unlimited");
  // Preview card state: a test draw arms the foil so you can scratch it here.
  const [preview, setPreview] = useState({ reward: null, armed: false, resetKey: 0, revealed: false });
  const draws = useRef(0);

  useEffect(() => setWorking(segments), [segments]);
  useEffect(() => setSize(wheelSize || 320), [wheelSize]);
  useEffect(() => setMaxSpins(maxSpinsPer || "unlimited"), [maxSpinsPer]);

  const total = working.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);

  const update = (i, patch) =>
    setWorking((w) => w.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const addSegment = () =>
    setWorking((w) => [
      ...w,
      {
        id: `new-${Date.now()}`,
        label: `Prize ${w.length + 1}`,
        color: DEFAULT_COLORS[w.length % DEFAULT_COLORS.length],
        weight: 10,
        couponId: null,
      },
    ]);

  const removeSegment = (i) => setWorking((w) => w.filter((_, idx) => idx !== i));

  // Read a chosen image file into a data URL stored on the segment.
  // Capped so the segments payload stays well under the API's body limit.
  const MAX_IMAGE_BYTES = 300_000;
  const pickImage = (i, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_BYTES) {
      alert("Image is too large. Please use one under 300 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update(i, { image: reader.result });
    reader.readAsDataURL(file);
  };

  // Weighted draw exactly like the server's, so the preview matches real odds.
  const testScratch = () => {
    if (!working.length) return;
    const rnd = mulberry32(hashString("preview") + draws.current++ + Date.now())();
    let pick = Math.floor(rnd * working.length);
    if (total > 0) {
      let r = rnd * total;
      pick = working.findIndex((s) => (r -= Number(s.weight) || 0) < 0);
      if (pick < 0) pick = working.length - 1;
    }
    const seg = working[pick];
    setPreview((p) => ({
      reward: { index: pick, label: seg.label, isWin: Boolean(seg.couponId) },
      armed: true,
      revealed: false,
      resetKey: p.resetKey + 1,
    }));
  };

  const resetPreview = () => setPreview((p) => ({ reward: null, armed: false, revealed: false, resetKey: p.resetKey + 1 }));

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Scratch card &amp; prizes</h3>
      <p className={styles.cardDesc}>
        Set the card size and each prize&rsquo;s background color and image, the label and reward
        it pays out, and its win weight. Click the dashed box to upload a prize image (max 300&nbsp;KB).
        Weights are relative — the percentage shown is each prize&rsquo;s real chance of being
        printed under the foil.
      </p>

      <div className={styles.wheelLayout}>
        <div>
          <div className={styles.previewBox}>
            <ScratchCard
              segments={working.map((s) => ({ color: s.color, label: s.label, image: s.image }))}
              size={Math.min(size, 300)}
              reward={preview.reward}
              armed={preview.armed}
              resetKey={preview.resetKey}
              onPlay={testScratch}
              onReveal={() => setPreview((p) => ({ ...p, armed: false, revealed: true }))}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className={`${styles.btnGhost} ${styles.btn}`} style={{ flex: 1 }} onClick={testScratch}>
              ✦ Test scratch
            </button>
            <button
              className={`${styles.btnGhost} ${styles.btn}`}
              style={{ flex: 1 }}
              onClick={resetPreview}
              disabled={!preview.reward}
            >
              ↺ Reset card
            </button>
          </div>
          <p className={styles.cardDesc} style={{ marginTop: 6 }}>
            {preview.armed
              ? "Scratch the preview with your mouse or finger."
              : preview.revealed
                ? `Revealed: ${preview.reward?.label || "—"}`
                : "Draw a prize with the weights below, then scratch it here."}
          </p>

          <div className={styles.field} style={{ marginTop: 18 }}>
            <label className={styles.label}>Card width — {size}px</label>
            <input
              className={styles.range}
              type="range"
              min={220}
              max={420}
              step={4}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </div>

          <div className={styles.field} style={{ marginTop: 18 }}>
            <label className={styles.label}>Max plays per customer</label>
            <select
              className={styles.select}
              style={{ width: "100%" }}
              value={maxSpins}
              onChange={(e) => setMaxSpins(e.target.value)}
            >
              <option value="unlimited">Unlimited</option>
              <option value="day">Once per day</option>
              <option value="week">Once per week</option>
            </select>
            <p className={styles.cardDesc} style={{ marginTop: 6 }}>
              Limits repeat cards from the same WhatsApp number.
            </p>
          </div>
        </div>

        <div>
          <div className={styles.segList}>
            {working.map((seg, i) => {
              const pct = total > 0 ? Math.round(((Number(seg.weight) || 0) / total) * 100) : 0;
              return (
                <div className={styles.segRow} key={seg.id || i}>
                  <span className={styles.segIndex}>{i + 1}</span>
                  <input
                    type="color"
                    className={styles.colorInput}
                    value={seg.color}
                    onChange={(e) => update(i, { color: e.target.value })}
                  />
                  <label className={styles.segImg} title="Prize image">
                    {seg.image ? (
                      <>
                        <img src={seg.image} alt="" />
                        <button
                          type="button"
                          className={styles.segImgClear}
                          title="Remove image"
                          aria-label={`Remove image for prize ${i + 1}`}
                          onClick={(e) => {
                            e.preventDefault();
                            update(i, { image: null });
                          }}
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <span aria-hidden>＋</span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        pickImage(i, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <input
                    className={styles.input}
                    value={seg.label}
                    placeholder="Prize label"
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                  <select
                    className={styles.select}
                    value={seg.couponId || ""}
                    onChange={(e) => update(i, { couponId: e.target.value || null })}
                  >
                    <option value="">No reward</option>
                    {coupons.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <div className={styles.segRange}>
                    <input
                      className={styles.range}
                      type="range"
                      min={0}
                      max={100}
                      value={seg.weight}
                      onChange={(e) => update(i, { weight: Number(e.target.value) })}
                    />
                    <div className={styles.segPct}>
                      wt {seg.weight} · <strong>{pct}%</strong>
                    </div>
                  </div>
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeSegment(i)}
                    disabled={working.length <= 2}
                    title="Remove prize"
                    aria-label={`Remove prize ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <div className={styles.totalRow}>
            <button className={`${styles.btnGhost} ${styles.btn}`} onClick={addSegment}>
              + Add prize
            </button>
            <span className={total === 100 ? styles.muted : styles.totalWarn}>
              Total weight: {total} {total !== 100 && "(normalized automatically)"}
            </span>
          </div>

          <div className={styles.actions} style={{ marginTop: 18 }}>
            <button
              className={styles.btn}
              onClick={() => onSave({ segments: working, wheelSize: size, maxSpinsPer: maxSpins })}
              disabled={saving || working.length < 2}
            >
              {saving ? "Saving…" : "Save card"}
            </button>
            {saved && <span className={styles.saved}>Saved ✓</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
