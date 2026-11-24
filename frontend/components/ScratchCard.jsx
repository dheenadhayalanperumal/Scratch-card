"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hashString, mulberry32 } from "@/lib/motion";
import * as sound from "@/lib/sound";
import * as haptics from "@/lib/haptics";
import styles from "./ScratchCard.module.css";

/** Share of the foil that must be scratched off before the rest falls away. */
export const SCRATCH_THRESHOLD = 0.5;
const BRUSH = 0.075; // brush radius as a share of the panel width
const SAMPLE_EVERY = 6; // pointer moves between coverage checks
const SAMPLE_STRIDE = 6; // px between sampled pixels (in canvas pixels)

function cssVar(el, name, fallback) {
  if (!el || typeof window === "undefined") return fallback;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/**
 * Paint the silver scratch-off foil: brushed metal, an embossed star lattice,
 * glitter, a gold coin and embossed "SCRATCH HERE" lettering. Neutral silver
 * on purpose — it reads as scratchable on every brand colour and festival skin.
 */
function paintCover(canvas, { font }) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const u = w / 300; // design unit: 1 at a 300px-wide panel
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, w, h);

  // Metallic base with soft light bands.
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, "#c9ced6");
  base.addColorStop(0.22, "#f3f5f8");
  base.addColorStop(0.45, "#aeb5c0");
  base.addColorStop(0.62, "#eceff3");
  base.addColorStop(0.82, "#b7bec9");
  base.addColorStop(1, "#e2e6eb");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const rnd = mulberry32(20261117);

  // Brushed-metal streaks.
  ctx.lineWidth = Math.max(1, u * 0.6);
  for (let i = 0; i < 260; i++) {
    const y = rnd() * h;
    const x = rnd() * w;
    const len = (20 + rnd() * 90) * u;
    ctx.strokeStyle = rnd() > 0.5 ? "rgba(255,255,255,0.35)" : "rgba(90,100,115,0.12)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y - len * 0.08);
    ctx.stroke();
  }

  // Embossed star lattice: dark shadow below-right, highlight above-left.
  const step = 34 * u;
  for (let row = 0, y = step / 2; y < h + step; y += step * 0.86, row++) {
    for (let x = row % 2 ? step / 2 : 0; x < w + step; x += step) {
      star(ctx, x + u, y + u, 6.5 * u);
      ctx.fillStyle = "rgba(70,78,92,0.16)";
      ctx.fill();
      star(ctx, x - u * 0.6, y - u * 0.6, 6.5 * u);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fill();
    }
  }

  // Glitter.
  for (let i = 0; i < Math.round((w * h) / (700 * u * u)); i++) {
    ctx.globalAlpha = 0.35 + rnd() * 0.6;
    ctx.fillStyle = rnd() > 0.35 ? "#ffffff" : "#8d95a3";
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, (0.5 + rnd() * 1.3) * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Four-point sparkles.
  const sparkle = (x, y, r) => {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  };
  sparkle(w * 0.12, h * 0.2, 9 * u);
  sparkle(w * 0.88, h * 0.78, 11 * u);
  sparkle(w * 0.82, h * 0.18, 6 * u);
  sparkle(w * 0.18, h * 0.82, 6 * u);

  // Darker centre plate so the lettering has something to sit on.
  const plateW = w * 0.8;
  const plateH = h * 0.4;
  const px = (w - plateW) / 2;
  const py = (h - plateH) / 2;
  const plate = ctx.createLinearGradient(0, py, 0, py + plateH);
  plate.addColorStop(0, "rgba(150,158,172,0.55)");
  plate.addColorStop(1, "rgba(120,128,142,0.55)");
  roundRect(ctx, px, py, plateW, plateH, plateH / 2);
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.lineWidth = 1.5 * u;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.stroke();

  // Gold coin on the left of the plate.
  const cr = plateH * 0.33;
  const cx = px + plateH * 0.52;
  const cy = py + plateH / 2;
  const coin = ctx.createRadialGradient(cx - cr * 0.35, cy - cr * 0.35, cr * 0.1, cx, cy, cr);
  coin.addColorStop(0, "#fff3c4");
  coin.addColorStop(0.5, "#f5c542");
  coin.addColorStop(1, "#b07a12");
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 4 * u;
  ctx.shadowOffsetY = 1.5 * u;
  ctx.fillStyle = coin;
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.6 * u;
  ctx.strokeStyle = "#a06c0c";
  ctx.beginPath();
  ctx.arc(cx, cy, cr * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  star(ctx, cx, cy, cr * 0.48);
  ctx.fillStyle = "#a06c0c";
  ctx.fill();

  // Embossed lettering, sized to fit the space right of the coin.
  const textLeft = cx + cr + plateH * 0.16;
  const textRight = px + plateW - plateH * 0.28;
  const avail = textRight - textLeft;
  const tx = (textLeft + textRight) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fit = (text, weight, size) => {
    ctx.font = `${weight} ${Math.round(size)}px ${font}`;
    const m = ctx.measureText(text).width;
    return m > avail ? size * (avail / m) : size;
  };
  const emboss = (text, y, size, weight, color) => {
    ctx.font = `${weight} ${Math.round(size)}px ${font}`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(text, tx, y + 1.2 * u);
    ctx.fillStyle = color;
    ctx.fillText(text, tx, y);
  };
  const big = fit("SCRATCH HERE", 800, plateH * 0.27);
  const small = Math.min(big * 0.6, fit("to reveal your prize", 600, plateH * 0.16));
  emboss("SCRATCH HERE", cy - small * 0.62, big, 800, "#3a4150");
  emboss("to reveal your prize", cy + big * 0.62, small, 600, "#4b5363");

  // Hairline inner edge.
  ctx.lineWidth = 2 * u;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  roundRect(ctx, u, u, w - 2 * u, h - 2 * u, 12 * u);
  ctx.stroke();
}

/**
 * Scratch-off prize ticket. The server has already decided the outcome
 * (`reward`) before the foil becomes scratchable, so scratching only reveals
 * — it can't change — the result.
 *
 * - Not `armed`: tapping the ticket calls `onPlay` (start the flow / get a card).
 * - `armed`: the foil can be scratched; once SCRATCH_THRESHOLD of it is gone
 *   the rest dissolves and `onReveal` fires once.
 * - `revealSignal`: bump it to clear the foil instantly (keyboard/a11y path).
 * - `resetKey`: bump it to lay a fresh foil over the panel.
 */
export default function ScratchCard({
  segments,
  reward = null,
  armed = false,
  revealed = false,
  revealSignal = 0,
  resetKey = 0,
  size,
  brandName,
  logoImage,
  disabled = false,
  loadError = false,
  sounds = true,
  onPlay,
  onReveal,
}) {
  const ready = Array.isArray(segments) && segments.length > 0;
  const prize = reward && ready ? segments[reward.index] : null;
  const won = Boolean(reward?.isWin);

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [cleared, setCleared] = useState(false);
  const clearedRef = useRef(false);
  const scratchedRef = useRef(false);
  const lastRef = useRef(null);
  const movesRef = useRef(0);
  const widthRef = useRef(0);

  // A stable-looking ticket serial that changes with every fresh card.
  const serial = String((hashString(`card-${resetKey}-${brandName || ""}`) % 900000) + 100000);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    widthRef.current = rect.width;
    const fonts = [cssVar(wrap, "--font-display", ""), cssVar(wrap, "--font-body", "")].filter(Boolean);
    paintCover(canvas, { font: [...fonts, "system-ui", "sans-serif"].join(", ") });
  }, []);

  const finish = useCallback(() => {
    if (clearedRef.current) return;
    clearedRef.current = true;
    setCleared(true);
    onReveal?.();
  }, [onReveal]);

  // Fresh foil whenever the card is (re)laid.
  useEffect(() => {
    if (!ready) return;
    clearedRef.current = false;
    scratchedRef.current = false;
    movesRef.current = 0;
    lastRef.current = null;
    setCleared(false);
    draw();
    // Webfonts may land after the first paint; repaint if nothing is scratched yet.
    document.fonts?.ready?.then(() => {
      if (!scratchedRef.current && !clearedRef.current) draw();
    });
  }, [ready, resetKey, draw]);

  // Repaint on width changes only (mobile URL-bar height changes are ignored).
  useEffect(() => {
    if (!ready || typeof ResizeObserver === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (Math.abs(w - widthRef.current) < 1) return;
      // Resizing wipes the bitmap: mid-scratch just finish the reveal.
      if (scratchedRef.current && !clearedRef.current) finish();
      else if (!clearedRef.current) draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [ready, draw, finish]);

  // External "reveal all" request.
  useEffect(() => {
    if (revealSignal && armed) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealSignal]);

  // Render mode / parent says it is already revealed.
  useEffect(() => {
    if (revealed && !clearedRef.current) {
      clearedRef.current = true;
      setCleared(true);
    }
  }, [revealed]);

  const toCanvas = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    return [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sx];
  };

  const checkCoverage = () => {
    const canvas = canvasRef.current;
    const { width: w, height: h } = canvas;
    const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    let total = 0;
    let clear = 0;
    for (let y = 0; y < h; y += SAMPLE_STRIDE) {
      for (let x = 0; x < w; x += SAMPLE_STRIDE) {
        total++;
        if (data[(y * w + x) * 4 + 3] < 128) clear++;
      }
    }
    if (total && clear / total >= SCRATCH_THRESHOLD) finish();
  };

  const scratchTo = (pt) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const r = canvas.width * BRUSH;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = r * 2;
    const from = lastRef.current || pt;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(pt[0], pt[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
    ctx.fill();
    lastRef.current = pt;
    if (sounds) {
      sound.playScratch();
      haptics.scratch();
    }
    if (++movesRef.current % SAMPLE_EVERY === 0) checkCoverage();
  };

  const onPointerDown = (e) => {
    if (!ready || cleared || !armed) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    scratchedRef.current = true;
    if (sounds) sound.unlock();
    lastRef.current = null;
    scratchTo(toCanvas(e));
  };

  const onPointerMove = (e) => {
    if (!armed || cleared || lastRef.current === null) return;
    // Mouse only scratches while a button is held; touch/pen always do.
    if (e.pointerType === "mouse" && !(e.buttons & 1)) return;
    scratchTo(toCanvas(e));
  };

  const onPointerUp = () => {
    lastRef.current = null;
    if (armed && !clearedRef.current && scratchedRef.current) checkCoverage();
  };

  const tappable = ready && !armed && !cleared && onPlay && !disabled;
  const prizeColor = prize?.color || "var(--accent)";

  let footer = "Scratch the silver panel to reveal your prize";
  if (!ready) footer = loadError ? "Couldn’t load prizes" : "Loading prizes…";
  else if (cleared) footer = won ? "Your code is ready — show it at the counter" : "Better luck on your next card";
  else if (!armed) footer = "Tap the card to get started";

  return (
    <div className={styles.wrap} style={size ? { maxWidth: `${size}px` } : undefined} ref={wrapRef}>
      <div className={`${styles.ticket} ${cleared && won ? styles.ticketWin : ""}`}>
        {/* Header band: brand + title + serial */}
        <div className={styles.head}>
          <span className={styles.logo} aria-hidden>
            {logoImage ? <img src={logoImage} alt="" /> : "🎟️"}
          </span>
          <span className={styles.headText}>
            <span className={styles.headTitle}>Scratch &amp; Win</span>
            {brandName && <span className={styles.headSub}>{brandName}</span>}
          </span>
          <span className={styles.serial}>
            <span>No.</span>
            {serial}
          </span>
        </div>

        {/* Tear line with side notches */}
        <div className={styles.tear} aria-hidden />

        <div className={styles.body}>
          <div className={styles.panel}>
            {/* Prize underneath the foil — only rendered once the outcome is known. */}
            <div
              className={`${styles.prize} ${cleared ? styles.prizeShown : ""} ${reward && !won ? styles.prizeLose : ""}`}
              style={{ "--prize": prizeColor }}
              aria-hidden={!cleared}
            >
              <span className={styles.burst} aria-hidden />
              {reward ? (
                <>
                  <span className={styles.prizeRing}>
                    {prize?.image ? (
                      <img src={prize.image} alt="" className={styles.prizeImg} />
                    ) : (
                      <span className={styles.prizeEmoji} aria-hidden>
                        {won ? "🎁" : "🍀"}
                      </span>
                    )}
                  </span>
                  <span className={styles.ribbon}>{won ? "You won" : "So close"}</span>
                  <span className={styles.prizeLabel}>{won ? reward.label : "Better luck next time"}</span>
                </>
              ) : (
                <span className={styles.mystery} aria-hidden>
                  ?
                </span>
              )}
            </div>

            {!ready && (
              <div className={styles.loading}>
                {!loadError && <span className={styles.spinner} aria-hidden />}
              </div>
            )}

            {ready && (
              <canvas
                ref={canvasRef}
                className={`${styles.cover} ${cleared ? styles.coverGone : ""} ${armed ? styles.coverArmed : ""}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                role="img"
                aria-label={
                  armed
                    ? "Scratch card — scratch the silver panel to reveal your prize"
                    : `Scratch card with ${segments.length} possible prizes`
                }
              />
            )}

            {ready && !cleared && <span className={styles.sheen} aria-hidden />}
          </div>
        </div>

        <p className={styles.foot}>
          {tappable && <span className={styles.pulse} aria-hidden />}
          {footer}
        </p>
      </div>

      {/* Tap anywhere on the ticket to start (also the keyboard path). */}
      {ready && !armed && !cleared && onPlay && (
        <button
          type="button"
          className={styles.hitButton}
          onClick={onPlay}
          disabled={disabled}
          aria-label="Play the scratch card"
        />
      )}
    </div>
  );
}
