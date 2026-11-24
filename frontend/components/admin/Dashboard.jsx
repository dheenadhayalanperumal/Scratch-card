"use client";

import { truncate, fullTitle } from "@/lib/format";
import { useEntrance } from "@/lib/clock";
import { easeOutCubic } from "@/lib/motion";
import Icon from "./Icon";
import styles from "./admin.module.css";

const fmt = (ms) =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

const WA_LABELS = {
  sent: "Sent",
  simulated: "Simulated",
  pending: "Pending",
  failed: "Failed",
  "opted-out": "Opted out",
  skipped: "—",
};

const DOTS = 9; // dot-matrix height of the date strip

export default function Dashboard({ users, spins, coupons, segments, onGo }) {
  const wins = spins.filter((s) => s.isWin);
  const redeemed = wins.filter((s) => s.status === "redeemed");
  const active = wins.filter((s) => s.status === "active");
  const expired = wins.filter((s) => s.status === "expired");
  const delivered = wins.filter((s) => s.waStatus === "sent" || s.waStatus === "simulated");

  const now = Date.now();
  const dayAgo = now - 86400000;
  const weekAgo = now - 7 * 86400000;
  const spinsToday = spins.filter((s) => s.spunAt >= dayAgo).length;
  const spinsWeek = spins.filter((s) => s.spunAt >= weekAgo).length;

  // Rewards breakdown — how many of each coupon were won.
  const rewardCounts = {};
  for (const s of wins) rewardCounts[s.couponTitle] = (rewardCounts[s.couponTitle] || 0) + 1;
  const rewards = Object.entries(rewardCounts).sort((a, b) => b[1] - a[1]);
  const maxReward = Math.max(1, ...rewards.map(([, n]) => n));

  const recent = [...spins].reverse().slice(0, 6);

  // Spins per day for the last 14 days (oldest → today).
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => {
    const from = startOfToday - (13 - i) * 86400000;
    const d = new Date(from);
    return {
      key: from,
      date: d.getDate(),
      weekday: d.toLocaleDateString("en-GB", { weekday: "short" }).toLowerCase(),
      month: d.toLocaleDateString("en-GB", { month: "short" }),
      n: spins.filter((s) => s.spunAt >= from && s.spunAt < from + 86400000).length,
    };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.n));
  const today = days[days.length - 1];

  const metrics = [
    { label: "Registered users", value: users.length, icon: "user", tab: "records", sub: `${spinsToday} plays in 24h` },
    { label: "Total plays", value: spins.length, icon: "card", tab: "records", sub: `${spinsWeek} this week` },
    { label: "Coupons generated", value: wins.length, icon: "ticket", tab: "records", sub: `${coupons.filter((c) => c.active).length} of ${coupons.length} coupon types live` },
    { label: "Redeemed", value: redeemed.length, of: wins.length, icon: "check", tab: "records", sub: `${pct(redeemed.length, wins.length)}% of coupons won` },
    { label: "Unused coupons", value: active.length, icon: "clock", tab: "promotions", sub: `${expired.length} expired` },
    { label: "WhatsApp delivered", value: delivered.length, of: wins.length, icon: "chat", tab: "whatsapp", sub: "codes sent to customers" },
  ];

  const winRate = pct(wins.length, spins.length);

  return (
    <div className={styles.dash}>
      {/* Counter shortcut — the redemption desk staff reach for most */}
      <section className={styles.redeemShortcut} aria-labelledby="redeem-title">
        <span className={styles.redeemShortcutIcon} aria-hidden="true">
          <Icon name="scan" size={26} />
        </span>
        <div className={styles.redeemShortcutText}>
          <h3 id="redeem-title">Redeem a coupon</h3>
          <p>
            Scan the QR on a customer&rsquo;s coupon to see its status and approve the claim —
            or type the code. {active.length} coupon{active.length === 1 ? "" : "s"} ready to claim.
          </p>
        </div>
        <div className={styles.redeemShortcutActions}>
          <button type="button" className={styles.btn} onClick={() => onGo?.("redeem")}>
            Scan QR code
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => onGo?.("redeem")}>
            Enter code manually
          </button>
        </div>
      </section>

      {/* Date strip — spins per day as dot columns, today called out */}
      <section className={styles.strip} aria-labelledby="strip-title">
        <div className={styles.stripHead}>
          <p className={styles.eyebrow} id="strip-title">Plays · last 14 days</p>
          <p className={styles.stripTotal}>
            <CountUp value={days.reduce((a, d) => a + d.n, 0)} />
            <span className={styles.unit}> plays</span>
          </p>
        </div>
        <div className={styles.stripDays} role="img" aria-label={days.map((d) => `${d.month} ${d.date}: ${d.n} plays`).join(", ")}>
          {days.map((d, i) => (
            <DayColumn key={d.key} day={d} max={maxDay} index={i} isToday={d === today} />
          ))}
        </div>
      </section>

      <div className={styles.overview}>
        <div className={styles.metricGrid}>
          {metrics.map((m, i) => (
            <button key={m.label} className={styles.metricCard} onClick={() => onGo?.(m.tab)}>
              <div className={styles.metricTop}>
                <span className={styles.metricLabel}>{m.label}</span>
                <span className={styles.metricIcon}>
                  <Icon name={m.icon} size={16} />
                </span>
              </div>
              <div className={styles.metricValue}>
                <CountUp value={m.value} delay={0.04 * i} />
                {m.of != null && <span className={styles.unit}> / {m.of}</span>}
              </div>
              <div className={styles.metricSub}>{m.sub}</div>
            </button>
          ))}
        </div>

        {/* Feature tile — the one lime-filled card, like Luma's "Inner Flow" */}
        <button className={styles.feature} onClick={() => onGo?.("records")}>
          <span className={styles.featureChevron} aria-hidden="true">›</span>
          <span className={styles.featureLabel}>Win rate</span>
          <span className={styles.featureValue}>
            <CountUp value={winRate} />
            <span className={styles.featureUnit}>%</span>
          </span>
          <span className={styles.featureSub}>
            {wins.length} wins from {spins.length} plays
          </span>
          <DotRow share={winRate / 100} />
        </button>
      </div>

      <section className={styles.card}>
        <div className={styles.couponHead}>
          <div>
            <h3 className={styles.cardTitle}>Recent activity</h3>
            <p className={styles.cardDesc}>The latest scratch cards across your campaign.</p>
          </div>
          <button className={`${styles.btnGhost} ${styles.btn}`} onClick={() => onGo?.("records")}>
            View all
          </button>
        </div>
        {recent.length === 0 ? (
          <div className={styles.empty}>No plays yet.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Won</th>
                  <th>Code</th>
                  <th>WhatsApp</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td title={fullTitle(s.userName)}>{truncate(s.userName)}</td>
                    <td>{s.isWin ? s.couponTitle : <span className={styles.muted}>No win</span>}</td>
                    <td>{s.code ? <span className={styles.code}>{s.code}</span> : "—"}</td>
                    <td>
                      {s.isWin ? (
                        <span className={`${styles.waTag} ${styles[`wa_${s.waStatus}`] || ""}`}>
                          {WA_LABELS[s.waStatus] || s.waStatus}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={styles.muted}>{fmt(s.spunAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Dark band — rewards, like Luma's "Program" strip */}
      <section className={styles.band} aria-labelledby="band-title">
        <div className={styles.bandList}>
          <h3 className={styles.bandTitle} id="band-title">Rewards</h3>
          {rewards.length === 0 ? (
            <p className={styles.bandEmpty}>No coupons won yet.</p>
          ) : (
            rewards.slice(0, 5).map(([title, n]) => (
              <div key={title} className={styles.bandRow}>
                <span className={styles.bandRowLabel}>{title}</span>
                <span className={styles.bandRowTrack}>
                  <GrowBar share={n / maxReward} />
                </span>
                <span className={styles.bandRowValue}>{n}</span>
              </div>
            ))
          )}
        </div>

        <div className={styles.bandTiles}>
          {rewards.slice(0, 3).map(([title, n], i) => (
            <button key={title} className={styles.glowTile} onClick={() => onGo?.("coupons")} style={{ "--blob": `${30 + i * 22}%` }}>
              <span className={styles.glowTitle}>{title}</span>
              <span className={styles.glowSub}>
                {n} won · {pct(n, wins.length)}%
              </span>
              <span className={styles.glowChevron} aria-hidden="true">›</span>
            </button>
          ))}
        </div>

        <Gauge value={pct(redeemed.length, wins.length)} label="Redemption rate" detail={`${redeemed.length} of ${wins.length}`} />
      </section>
    </div>
  );
}

/** Number that counts up from 0 when the dashboard mounts. */
function CountUp({ value, delay = 0 }) {
  const p = useEntrance(0.9, delay);
  return Math.round(value * easeOutCubic(p));
}

/** Bar fill that grows to its share when the dashboard mounts. */
function GrowBar({ share }) {
  const p = useEntrance(0.8, 0.15);
  return <span className={styles.barFill} style={{ width: `${share * 100 * easeOutCubic(p)}%` }} />;
}

/** One day of the strip: date, weekday, and a column of dots filled bottom-up. */
function DayColumn({ day, max, index, isToday }) {
  const p = easeOutCubic(useEntrance(0.6, 0.1 + index * 0.03));
  const filled = day.n ? Math.max(1, Math.round((day.n / max) * DOTS * p)) : 0;
  return (
    <div className={`${styles.day} ${isToday ? styles.dayToday : ""}`} title={`${day.month} ${day.date}: ${day.n} plays`}>
      <span className={styles.dayDate}>{day.date}</span>
      <span className={styles.dayWeek}>{isToday ? "today" : day.weekday}</span>
      <span className={styles.dots} aria-hidden="true">
        {Array.from({ length: DOTS }, (_, k) => (
          <i key={k} className={DOTS - k <= filled ? styles.dotOn : undefined} />
        ))}
      </span>
      {isToday && <span className={styles.dayBubble}>{day.n} plays</span>}
    </div>
  );
}

/** 24-dot row, filled to `share` — the dot-matrix motif used across Luma. */
function DotRow({ share }) {
  const p = easeOutCubic(useEntrance(0.9, 0.2));
  const on = Math.round(24 * share * p);
  return (
    <span className={styles.dotRow} aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <i key={i} className={i < on ? styles.dotOn : undefined} />
      ))}
    </span>
  );
}

/** Thin 240° arc gauge with a needle, like Luma's "Practice rhythm". */
function Gauge({ value, label, detail }) {
  const p = easeOutCubic(useEntrance(1.1, 0.3));
  const R = 62;
  const sweep = 240;
  const start = -120; // degrees from 12 o'clock
  const pt = (deg, r = R) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [80 + r * Math.cos(a), 80 + r * Math.sin(a)];
  };
  const arc = (from, to) => {
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    return `M${x1} ${y1} A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const at = start + (sweep * Math.min(100, value) * p) / 100;
  const [nx, ny] = pt(at, R - 4);
  return (
    <div className={styles.gauge}>
      <svg viewBox="0 0 160 130" width="160" height="130" aria-hidden="true">
        <path d={arc(start, start + sweep)} className={styles.gaugeTrack} />
        {at > start && <path d={arc(start, at)} className={styles.gaugeFill} />}
        <line x1="80" y1="80" x2={nx} y2={ny} className={styles.gaugeNeedle} />
        <circle cx={nx} cy={ny} r="3.5" className={styles.gaugeTip} />
      </svg>
      <div className={styles.gaugeLabel}>{label}</div>
      <div className={styles.gaugeValue}>
        {Math.round(value * p)}
        <span className={styles.unit}>% · {detail}</span>
      </div>
    </div>
  );
}
