import mysql from "mysql2/promise";
import { applyDemoArtwork, seedDemoData } from "./demo.js";

// Default Spin Wheel WhatsApp template copy (illustrative — the production text
// must be submitted to Meta for approval). Placeholders are filled at send time.
export const DEFAULT_WA_TEMPLATE =
  "Hey [Name]! 🎉 You scratched a card at [Business Name] and won: [Prize]. " +
  "Use code [CODE] on your next order. Valid for [Days] days. Reply STOP to unsubscribe.";

const {
  DB_HOST = "127.0.0.1",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME = "scratch_to_win",
} = process.env;

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
    });
  }
  return pool;
}

export async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/**
 * Adds a column to an existing table only if it isn't already there.
 * MySQL has no portable `ADD COLUMN IF NOT EXISTS`, so we check the catalog first.
 * This lets schema additions roll out onto databases seeded by older builds.
 */
async function ensureColumn(table, column, definition) {
  const rows = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = :db AND table_name = :table AND column_name = :column`,
    { db: DB_NAME, table, column }
  );
  if (rows.length === 0) {
    await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`Migrated: added ${table}.${column}`);
  }
}

/**
 * Widens a text column to LONGTEXT if it isn't already. Columns holding JSON
 * with base64 images (festivals, theme_config) outgrow TEXT's 64KB fast —
 * every save then fails with ER_DATA_TOO_LONG, which looks to the admin like
 * "my image didn't save". Idempotent: a no-op once the column is LONGTEXT.
 */
async function ensureLongText(table, column) {
  const rows = await query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema = :db AND table_name = :table AND column_name = :column`,
    { db: DB_NAME, table, column }
  );
  if (rows.length && rows[0].data_type !== "longtext") {
    await query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` LONGTEXT`);
    console.log(`Migrated: widened ${table}.${column} to LONGTEXT`);
  }
}

/**
 * Merges pre-existing duplicate `users.mobile` rows (same customer registered
 * more than once before this table had a UNIQUE constraint), then adds the
 * constraint so returning customers can be looked up by mobile reliably.
 * Idempotent: a no-op once the index exists.
 */
async function ensureUniqueMobile() {
  const existing = await query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = :db AND table_name = 'users' AND index_name = 'uq_users_mobile'`,
    { db: DB_NAME }
  );
  if (existing.length > 0) return;

  const dupes = await query("SELECT mobile FROM users GROUP BY mobile HAVING COUNT(*) > 1");
  for (const { mobile } of dupes) {
    const group = await query("SELECT * FROM users WHERE mobile = :mobile ORDER BY created_at ASC", { mobile });
    // Prefer a row that's already logged in (has a token) as the surviving id;
    // otherwise keep the most recently created row. Always keep the latest name.
    const survivor = [...group].reverse().find((u) => u.token) || group[group.length - 1];
    const latestName = group[group.length - 1].name;
    for (const loser of group) {
      if (loser.id === survivor.id) continue;
      await query("UPDATE spins SET user_id = :survivorId WHERE user_id = :loserId", {
        survivorId: survivor.id,
        loserId: loser.id,
      });
      await query("DELETE FROM users WHERE id = :id", { id: loser.id });
    }
    if (survivor.name !== latestName) {
      await query("UPDATE users SET name = :name WHERE id = :id", { name: latestName, id: survivor.id });
    }
  }

  await query("ALTER TABLE users ADD UNIQUE INDEX uq_users_mobile (mobile)");
  console.log("Migrated: deduped users by mobile and added uq_users_mobile.");
}

/**
 * Creates the database (if missing), all tables, and seeds defaults on first run.
 * Safe to call on every boot — everything uses IF NOT EXISTS / idempotent guards.
 */
export async function initDb() {
  // 1) Ensure the database exists (connect without selecting one first).
  const bootstrap = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrap.end();

  // 2) Create tables.
  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      id          TINYINT PRIMARY KEY DEFAULT 1,
      brand_name  VARCHAR(120) NOT NULL,
      theme_color VARCHAR(20)  NOT NULL,
      accent_color VARCHAR(20) NOT NULL,
      logo_text   VARCHAR(60),
      logo_image  LONGTEXT,
      wheel_size  INT NOT NULL DEFAULT 320,
      tagline     VARCHAR(160),
      max_spins_per VARCHAR(12) NOT NULL DEFAULT 'unlimited',
      wa_enabled         TINYINT(1) NOT NULL DEFAULT 1,
      wa_phone_number_id VARCHAR(40),
      wa_template_name   VARCHAR(80) NOT NULL DEFAULT 'scratch_card_reward',
      wa_template_body   TEXT
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id            VARCHAR(40) PRIMARY KEY,
      title         VARCHAR(120) NOT NULL,
      product       VARCHAR(200),
      code_prefix   VARCHAR(12) NOT NULL DEFAULT 'CCB',
      validity_days INT NOT NULL DEFAULT 14,
      active        TINYINT(1) NOT NULL DEFAULT 1,
      code_type     VARCHAR(12) NOT NULL DEFAULT 'generated',
      static_code   VARCHAR(60),
      created_at    BIGINT NOT NULL
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS segments (
      id        VARCHAR(40) PRIMARY KEY,
      label     VARCHAR(120) NOT NULL,
      color     VARCHAR(20)  NOT NULL,
      image     LONGTEXT,
      weight    INT NOT NULL DEFAULT 0,
      coupon_id VARCHAR(40),
      position  INT NOT NULL DEFAULT 0,
      CONSTRAINT fk_segment_coupon FOREIGN KEY (coupon_id)
        REFERENCES coupons(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id               VARCHAR(40) PRIMARY KEY,
      name             VARCHAR(120) NOT NULL,
      mobile           VARCHAR(20)  NOT NULL,
      marketing_opt_in TINYINT(1) NOT NULL DEFAULT 0,
      created_at       BIGINT NOT NULL
    ) ENGINE=InnoDB
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS spins (
      id            VARCHAR(40) PRIMARY KEY,
      user_id       VARCHAR(40),
      user_name     VARCHAR(120),
      user_mobile   VARCHAR(20),
      segment_id    VARCHAR(40),
      segment_index INT,
      label         VARCHAR(120),
      coupon_id     VARCHAR(40),
      coupon_title  VARCHAR(120),
      product       VARCHAR(200),
      code          VARCHAR(40),
      is_win        TINYINT(1) NOT NULL DEFAULT 0,
      status        VARCHAR(20) NOT NULL DEFAULT 'no-win',
      wa_status     VARCHAR(20) NOT NULL DEFAULT 'pending',
      wa_sent_at    BIGINT,
      spun_at       BIGINT NOT NULL,
      expires_at    BIGINT,
      redeemed_at   BIGINT,
      INDEX idx_spins_user (user_id)
    ) ENGINE=InnoDB
  `);

  // WhatsApp opt-outs — a customer who replied STOP. Keyed by phone number so it
  // applies across every spin/user row for that number.
  await query(`
    CREATE TABLE IF NOT EXISTS wa_opt_outs (
      mobile     VARCHAR(20) PRIMARY KEY,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB
  `);

  // Reusable WhatsApp message templates — managed in the Templates menu and
  // selected when sending promotions or as the spin-reward message.
  await query(`
    CREATE TABLE IF NOT EXISTS wa_templates (
      id         VARCHAR(40) PRIMARY KEY,
      name       VARCHAR(80) NOT NULL,
      body       TEXT NOT NULL,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB
  `);

  // 2b) Migrate databases created by older builds that predate these columns.
  await ensureColumn("settings", "max_spins_per", "VARCHAR(12) NOT NULL DEFAULT 'unlimited'");
  await ensureColumn("coupons", "code_type", "VARCHAR(12) NOT NULL DEFAULT 'generated'");
  await ensureColumn("coupons", "static_code", "VARCHAR(60)");
  // Per-segment icon/image (data URL), shown on the wheel face.
  await ensureColumn("segments", "image", "LONGTEXT");
  // Persistent login token so a returning customer skips the form/OTP and can spin directly.
  await ensureColumn("users", "token", "VARCHAR(64)");
  // Recognise returning customers by mobile number (dedupes any pre-existing duplicates first).
  await ensureUniqueMobile();
  // WhatsApp delivery layer.
  await ensureColumn("settings", "wa_enabled", "TINYINT(1) NOT NULL DEFAULT 1");
  await ensureColumn("settings", "wa_phone_number_id", "VARCHAR(40)");
  await ensureColumn("settings", "wa_template_name", "VARCHAR(80) NOT NULL DEFAULT 'scratch_card_reward'");
  await ensureColumn("settings", "wa_template_body", "TEXT");
  await ensureColumn("spins", "wa_status", "VARCHAR(20) NOT NULL DEFAULT 'pending'");
  await ensureColumn("spins", "wa_sent_at", "BIGINT");
  // When a coupon was claimed at the counter (for the redeem history list).
  await ensureColumn("spins", "redeemed_at", "BIGINT");
  // Seasonal skin (Diwali/Christmas/New Year backgrounds), admin-controlled.
  await ensureColumn("settings", "theme", "VARCHAR(20) NOT NULL DEFAULT 'default'");
  await ensureColumn("settings", "theme_config", "TEXT");
  // Dynamic festivals list (JSON array) + the manually activated festival id.
  // LONGTEXT, not TEXT: the JSON embeds base64 background images.
  await ensureColumn("settings", "festivals", "LONGTEXT");
  await ensureColumn("settings", "active_festival", "VARCHAR(40)");
  await ensureLongText("settings", "festivals");
  await ensureLongText("settings", "theme_config");
  // Backfill the template body on rows that predate the column.
  await query("UPDATE settings SET wa_template_body = :body WHERE wa_template_body IS NULL OR wa_template_body = ''", {
    body: DEFAULT_WA_TEMPLATE,
  });

  // Seed the template library once (fresh DB or DBs created before this table).
  const [{ tn }] = await query("SELECT COUNT(*) AS tn FROM wa_templates");
  if (tn === 0) {
    const now = Date.now();
    const rows = [
      ["scratch_card_reward", DEFAULT_WA_TEMPLATE],
      [
        "coupon_reminder",
        "Hi [Name]! ⏰ Your coupon [CODE] from [Business Name] is still unused. Pop in and redeem it before it expires! Reply STOP to unsubscribe.",
      ],
      [
        "win_back",
        "We miss you, [Name]! 💛 Come back to [Business Name] and scratch again for a fresh reward. Reply STOP to unsubscribe.",
      ],
    ];
    for (const [name, body] of rows) {
      await query("INSERT INTO wa_templates (id, name, body, created_at) VALUES (:id, :name, :body, :now)", {
        id: `wt-${name.slice(0, 6)}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        body,
        now,
      });
    }
    console.log("Seeded WhatsApp template library.");
  }

  // 3) Seed defaults the first time only.
  await seed();
}

async function seed() {
  const [{ n }] = await query("SELECT COUNT(*) AS n FROM settings");
  if (n > 0) return;

  await query(
    `INSERT INTO settings (id, brand_name, theme_color, accent_color, logo_text, logo_image, wheel_size, tagline)
     VALUES (1, :brandName, :themeColor, :accentColor, :logoText, NULL, :wheelSize, :tagline)`,
    {
      brandName: "Café Cream Bar",
      themeColor: "#f0588e",
      accentColor: "#f7a53b",
      logoText: "Café",
      wheelSize: 320,
      tagline: "Every card wins something",
    }
  );

  const now = Date.now();
  const coupons = [
    ["c-coffee", "Free Coffee", "Any regular coffee"],
    ["c-10", "10% Off", "Entire bill"],
    ["c-cookie", "Free Cookie", "Choc-chip cookie"],
    ["c-20", "20% Off", "Entire bill"],
    ["c-bogo", "Buy 1 Get 1", "Any beverage"],
  ];
  for (const [id, title, product] of coupons) {
    await query(
      `INSERT INTO coupons (id, title, product, code_prefix, validity_days, active, created_at)
       VALUES (:id, :title, :product, 'CCB', 14, 1, :now)`,
      { id, title, product, now }
    );
  }

  const segments = [
    ["s1", "Free Coffee", "#F2A03D", 28, "c-coffee"],
    ["s2", "10% Off", "#3B6FE5", 18, "c-10"],
    ["s3", "Try Again", "#22314F", 8, null],
    ["s4", "Free Cookie", "#E0407F", 20, "c-cookie"],
    ["s5", "20% Off", "#F2A03D", 12, "c-20"],
    ["s6", "Buy 1 Get 1", "#22314F", 14, "c-bogo"],
  ];
  let pos = 0;
  for (const [id, label, color, weight, couponId] of segments) {
    await query(
      `INSERT INTO segments (id, label, color, weight, coupon_id, position)
       VALUES (:id, :label, :color, :weight, :couponId, :pos)`,
      { id, label, color, weight, couponId, pos: pos++ }
    );
  }

  console.log("Seeded default settings, coupons and segments.");

  // Dummy logo, prize artwork and sample customers/plays so the admin panel
  // has something to show on a fresh install. Opt out with SEED_DEMO_DATA=0;
  // remove later with `npm run seed:demo -- --clear`.
  if (process.env.SEED_DEMO_DATA !== "0") {
    await applyDemoArtwork(query);
    const { users, spins } = await seedDemoData(query);
    console.log(`Seeded demo logo, prize images, ${users} customers and ${spins} plays.`);
  }
}
