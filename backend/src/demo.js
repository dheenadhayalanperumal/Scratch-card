// Demo branding + sample data for the Scratch & Win admin panel.
//
// - DEMO_LOGO / DEMO_PRIZE_IMAGES: dummy SVG artwork (data URLs) for the brand
//   logo and each default prize, so the public page and admin look finished.
// - buildDemoData(): ~30 customers and ~90 plays spread over the last 14 days,
//   with a realistic mix of wins, misses, redeemed/expired coupons and
//   WhatsApp delivery states. Deterministic (seeded PRNG) so every install
//   gets the same sample, with timestamps relative to "now".
//
// Every demo row uses an id starting with "demo-" so it can be removed
// cleanly (`npm run seed:demo -- --clear`) without touching real customers.

const svg = (s) => `data:image/svg+xml;base64,${Buffer.from(s.trim()).toString("base64")}`;

/** Square brand mark: a coffee cup on a scratch-card ticket with a sparkle. */
export const DEMO_LOGO = svg(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f0588e"/><stop offset="1" stop-color="#f7a53b"/>
    </linearGradient>
    <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4f6fa"/><stop offset=".5" stop-color="#b9c0cc"/><stop offset="1" stop-color="#eef1f6"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <rect x="18" y="34" width="92" height="62" rx="10" fill="#fff"/>
  <path d="M18 58a7 7 0 0 1 0 14M110 58a7 7 0 0 0 0 14" fill="url(#bg)"/>
  <rect x="62" y="44" width="38" height="42" rx="6" fill="url(#foil)"/>
  <path d="M66 74l10-10M72 80l20-20M84 82l10-10" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <path d="M28 52h24v18a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10z" fill="#5a2a1a"/>
  <path d="M52 56h3a5 5 0 0 1 0 10h-3" fill="none" stroke="#5a2a1a" stroke-width="3"/>
  <path d="M34 46c0-3 3-3 3-6M42 46c0-3 3-3 3-6" stroke="#5a2a1a" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M100 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff"/>
</svg>`);

const badge = (bg, inner) =>
  svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${bg}"/>${inner}</svg>`);

/** Prize artwork keyed by default segment id (see seed() in mysql.js). */
export const DEMO_PRIZE_IMAGES = {
  // Free Coffee — steaming cup
  s1: badge(
    "#fff4e3",
    `<path d="M24 38h40v22a16 16 0 0 1-16 16h-8a16 16 0 0 1-16-16z" fill="#7a3e1d"/>
     <path d="M64 44h5a8 8 0 0 1 0 16h-5" fill="none" stroke="#7a3e1d" stroke-width="5"/>
     <path d="M34 30c0-5 5-5 5-10M46 30c0-5 5-5 5-10" stroke="#c98a5a" stroke-width="4" stroke-linecap="round" fill="none"/>
     <rect x="20" y="78" width="52" height="5" rx="2.5" fill="#c98a5a"/>`
  ),
  // 10% Off — tag
  s2: badge(
    "#e8efff",
    `<path d="M16 48 30 30h48a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H30z" fill="#3b6fe5"/><circle cx="28" cy="48" r="4" fill="#e8efff"/>
     <text x="56" y="55.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="20" fill="#fff">10%</text>`
  ),
  // Try Again — clover
  s3: badge(
    "#e7f6ec",
    `<g fill="#2e9e5b"><circle cx="38" cy="38" r="13"/><circle cx="58" cy="38" r="13"/><circle cx="38" cy="58" r="13"/><circle cx="58" cy="58" r="13"/></g>
     <path d="M48 52c4 12 10 20 18 26" stroke="#2e9e5b" stroke-width="5" stroke-linecap="round" fill="none"/>`
  ),
  // Free Cookie — choc-chip cookie
  s4: badge(
    "#fdeaf1",
    `<circle cx="48" cy="48" r="30" fill="#d9a066"/><circle cx="48" cy="48" r="30" fill="none" stroke="#b97f45" stroke-width="3"/>
     <g fill="#5a2e14"><circle cx="38" cy="38" r="4"/><circle cx="56" cy="34" r="3.5"/><circle cx="60" cy="52" r="4"/><circle cx="42" cy="58" r="4.5"/><circle cx="50" cy="46" r="3"/></g>`
  ),
  // 20% Off — tag
  s5: badge(
    "#fff1df",
    `<path d="M16 48 30 30h48a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H30z" fill="#f2a03d"/><circle cx="28" cy="48" r="4" fill="#fff1df"/>
     <text x="56" y="55.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="20" fill="#fff">20%</text>`
  ),
  // Buy 1 Get 1 — two cups
  s6: badge(
    "#e6e9f2",
    `<path d="M20 44h24v18a9 9 0 0 1-9 9h-6a9 9 0 0 1-9-9z" fill="#22314f"/>
     <path d="M52 44h24v18a9 9 0 0 1-9 9h-6a9 9 0 0 1-9-9z" fill="#e0407f"/>
     <text x="48" y="36" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="13" fill="#22314f">1 + 1</text>`
  ),
};

/* ---------- sample customers + plays ---------- */

const NAMES = [
  "Aarav Sharma", "Priya Nair", "Rahul Verma", "Ananya Iyer", "Vikram Singh", "Sneha Reddy",
  "Arjun Mehta", "Kavya Menon", "Rohan Gupta", "Divya Pillai", "Karthik Raj", "Meera Joshi",
  "Siddharth Rao", "Pooja Desai", "Aditya Kumar", "Nisha Patel", "Harish Babu", "Lakshmi Devi",
  "Manoj Krishnan", "Ishita Bose", "Varun Chopra", "Deepa Srinivasan", "Naveen Prakash", "Shreya Kapoor",
  "Gautam Das", "Revathi Subramanian", "Imran Khan", "Fatima Shaikh", "Joseph Thomas", "Anjali Mishra",
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86400000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Build demo users and plays. `segments` are the live prizes (with couponId),
 * `coupons` the coupon rows (id, title, product, codePrefix, validityDays).
 * Times are returned as *offsets before now* (ms) so callers can anchor them
 * to the JS clock or to MySQL's NOW() in a SQL file.
 */
export function buildDemoData({ segments, coupons }) {
  const rnd = mulberry32(424242);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const byCoupon = Object.fromEntries(coupons.map((c) => [c.id, c]));
  const total = segments.reduce((s, x) => s + (Number(x.weight) || 0), 0) || 1;
  const draw = () => {
    let r = rnd() * total;
    for (let i = 0; i < segments.length; i++) {
      r -= Number(segments[i].weight) || 0;
      if (r < 0) return i;
    }
    return segments.length - 1;
  };
  const code = (prefix) => {
    let s = "";
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(rnd() * CODE_CHARS.length)];
    return `${prefix || "CCB"}-${s}`;
  };

  const users = NAMES.map((name, i) => ({
    id: `demo-u${String(i + 1).padStart(2, "0")}`,
    name,
    mobile: `9${String(800000000 + i * 7919 + 1234).slice(0, 9)}`,
    marketingOptIn: rnd() < 0.72 ? 1 : 0,
    // Joined somewhere in the last ~3 weeks, a little before their first play.
    ago: Math.floor((0.5 + rnd() * 19) * DAY),
  }));

  const spins = [];
  let n = 0;
  for (const u of users) {
    // Most people play 1–3 times, a few regulars play up to 6.
    const plays = rnd() < 0.15 ? 4 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 3);
    for (let p = 0; p < plays; p++) {
      const ago = Math.max(5 * 60000, Math.floor(u.ago * (1 - p / (plays + 0.5)) - rnd() * 3600000));
      const index = draw();
      const seg = segments[index];
      const coupon = seg.couponId ? byCoupon[seg.couponId] : null;
      const isWin = Boolean(coupon);
      const validity = (coupon?.validityDays || 14) * DAY;
      let status = "no-win";
      let redeemedAgo = null;
      if (isWin) {
        if (ago > validity) status = rnd() < 0.55 ? "redeemed" : "expired";
        else status = rnd() < 0.45 ? "redeemed" : "active";
        if (status === "redeemed") redeemedAgo = Math.max(60000, Math.floor(ago - rnd() * Math.min(ago, 3 * DAY)));
      }
      const wa = !isWin ? "skipped" : pick(["sent", "sent", "sent", "simulated", "simulated", "pending", "failed"]);
      spins.push({
        id: `demo-s${String(++n).padStart(3, "0")}`,
        userId: u.id,
        userName: u.name,
        userMobile: u.mobile,
        segmentId: seg.id,
        segmentIndex: index,
        label: seg.label,
        couponId: coupon?.id || null,
        couponTitle: coupon?.title || seg.label,
        product: coupon?.product || "",
        code: isWin ? code(coupon.codePrefix) : null,
        isWin: isWin ? 1 : 0,
        status,
        waStatus: wa,
        waSentAgo: wa === "sent" || wa === "simulated" ? ago - 4000 : null,
        ago,
        expiresAgo: isWin ? ago - validity : null, // negative = still in the future
        redeemedAgo,
      });
    }
  }
  return { users, spins };
}

/** Remove every demo row (real customers are never touched). */
export async function clearDemoData(query) {
  await query("DELETE FROM spins WHERE id LIKE 'demo-%'");
  await query("DELETE FROM users WHERE id LIKE 'demo-%'");
}

/** Fill in the dummy logo / prize images wherever the admin hasn't set their own. */
export async function applyDemoArtwork(query) {
  await query("UPDATE settings SET logo_image = :logo WHERE id = 1 AND (logo_image IS NULL OR logo_image = '')", {
    logo: DEMO_LOGO,
  });
  for (const [id, image] of Object.entries(DEMO_PRIZE_IMAGES)) {
    await query("UPDATE segments SET image = :image WHERE id = :id AND (image IS NULL OR image = '')", { id, image });
  }
}

/** Replace the demo customers + plays with a fresh set anchored to now. */
export async function seedDemoData(query) {
  const segments = (await query("SELECT * FROM segments ORDER BY position ASC")).map((r) => ({
    id: r.id,
    label: r.label,
    weight: r.weight,
    couponId: r.coupon_id,
  }));
  const coupons = (await query("SELECT * FROM coupons")).map((r) => ({
    id: r.id,
    title: r.title,
    product: r.product,
    codePrefix: r.code_prefix,
    validityDays: r.validity_days,
  }));
  if (segments.length < 2) return { users: 0, spins: 0 };

  await clearDemoData(query);
  const { users, spins } = buildDemoData({ segments, coupons });
  const now = Date.now();
  const taken = new Set((await query("SELECT mobile FROM users")).map((r) => r.mobile));
  const kept = users.filter((u) => !taken.has(u.mobile));
  const keptIds = new Set(kept.map((u) => u.id));

  for (const u of kept) {
    await query(
      `INSERT INTO users (id, name, mobile, marketing_opt_in, created_at)
       VALUES (:id, :name, :mobile, :optIn, :createdAt)`,
      { id: u.id, name: u.name, mobile: u.mobile, optIn: u.marketingOptIn, createdAt: now - u.ago - 120000 }
    );
  }
  const rows = spins.filter((s) => keptIds.has(s.userId));
  for (const s of rows) {
    await query(
      `INSERT INTO spins
         (id, user_id, user_name, user_mobile, segment_id, segment_index, label, coupon_id, coupon_title,
          product, code, is_win, status, wa_status, wa_sent_at, spun_at, expires_at, redeemed_at)
       VALUES
         (:id, :userId, :userName, :userMobile, :segmentId, :segmentIndex, :label, :couponId, :couponTitle,
          :product, :code, :isWin, :status, :waStatus, :waSentAt, :spunAt, :expiresAt, :redeemedAt)`,
      {
        ...s,
        waSentAt: s.waSentAgo == null ? null : now - s.waSentAgo,
        spunAt: now - s.ago,
        expiresAt: s.expiresAgo == null ? null : now - s.expiresAgo,
        redeemedAt: s.redeemedAgo == null ? null : now - s.redeemedAgo,
      }
    );
  }
  return { users: kept.length, spins: rows.length };
}

/* ---------- SQL export (for the PHP / cPanel backend) ---------- */

const esc = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`);
const ago = (ms) => (ms == null ? "NULL" : ms >= 0 ? `@now - ${ms}` : `@now + ${-ms}`);

/** SQL that applies the dummy artwork and inserts the demo data relative to NOW(). */
export function demoDataSql({ segments, coupons }) {
  const { users, spins } = buildDemoData({ segments, coupons });
  const out = [
    "-- Scratch & Win demo data: dummy logo, prize images, 30 customers and their plays.",
    "-- Import AFTER schema.sql. Timestamps are relative to the moment you import.",
    "-- Remove later with:  DELETE FROM spins WHERE id LIKE 'demo-%'; DELETE FROM users WHERE id LIKE 'demo-%';",
    "",
    "SET @now = ROUND(UNIX_TIMESTAMP(NOW(3)) * 1000);",
    "",
    `UPDATE settings SET logo_image = ${esc(DEMO_LOGO)} WHERE id = 1 AND (logo_image IS NULL OR logo_image = '');`,
    ...Object.entries(DEMO_PRIZE_IMAGES).map(
      ([id, img]) => `UPDATE segments SET image = ${esc(img)} WHERE id = ${esc(id)} AND (image IS NULL OR image = '');`
    ),
    "",
    "DELETE FROM spins WHERE id LIKE 'demo-%';",
    "DELETE FROM users WHERE id LIKE 'demo-%';",
    "",
    "INSERT IGNORE INTO users (id, name, mobile, marketing_opt_in, created_at) VALUES",
    users.map((u) => `  (${esc(u.id)}, ${esc(u.name)}, ${esc(u.mobile)}, ${u.marketingOptIn}, ${ago(u.ago + 120000)})`).join(",\n") + ";",
    "",
    "INSERT INTO spins (id, user_id, user_name, user_mobile, segment_id, segment_index, label, coupon_id, coupon_title, product, code, is_win, status, wa_status, wa_sent_at, spun_at, expires_at, redeemed_at) VALUES",
    spins
      .map(
        (s) =>
          `  (${[s.id, s.userId, s.userName, s.userMobile, s.segmentId, s.segmentIndex, s.label, s.couponId, s.couponTitle, s.product, s.code, s.isWin, s.status, s.waStatus]
            .map(esc)
            .join(", ")}, ${ago(s.waSentAgo)}, ${ago(s.ago)}, ${ago(s.expiresAgo)}, ${ago(s.redeemedAgo)})`
      )
      .join(",\n") + ";",
    "",
  ];
  return out.join("\n");
}
