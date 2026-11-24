-- Scratch-to-Win schema + seed data (MySQL).
-- Import this into your cPanel database via phpMyAdmin (select the DB first).
-- Do NOT include CREATE DATABASE — create the DB in cPanel, then import here.

SET NAMES utf8mb4;

-- If importing onto a cPanel DB created before the `theme`/`theme_config`
-- columns existed, run this first (ALTER is a no-op to re-run safely):
--   ALTER TABLE settings
--     ADD COLUMN IF NOT EXISTS theme VARCHAR(20) NOT NULL DEFAULT 'default',
--     ADD COLUMN IF NOT EXISTS theme_config TEXT;
-- (MySQL < 8.0.29 lacks "ADD COLUMN IF NOT EXISTS" — drop the IF NOT EXISTS
-- clauses there and only run it once.)
CREATE TABLE IF NOT EXISTS settings (
  id           TINYINT PRIMARY KEY DEFAULT 1,
  brand_name   VARCHAR(120) NOT NULL,
  theme_color  VARCHAR(20)  NOT NULL,
  accent_color VARCHAR(20)  NOT NULL,
  logo_text    VARCHAR(60),
  logo_image   LONGTEXT,
  wheel_size   INT NOT NULL DEFAULT 320,
  tagline      VARCHAR(160),
  max_spins_per      VARCHAR(12) NOT NULL DEFAULT 'unlimited',
  wa_enabled         TINYINT(1) NOT NULL DEFAULT 1,
  wa_phone_number_id VARCHAR(40),
  wa_template_name   VARCHAR(80) NOT NULL DEFAULT 'scratch_card_reward',
  wa_template_body   TEXT,
  -- Seasonal skin (Diwali/Christmas/New Year backgrounds), admin-controlled.
  theme              VARCHAR(20) NOT NULL DEFAULT 'default',
  theme_config       LONGTEXT,
  -- Dynamic festivals list (JSON array of skins) + manually activated id.
  festivals          LONGTEXT,
  active_festival    VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- mobile is UNIQUE so a returning customer is recognised by number and never
-- asked for their name a second time (see upsertUser() in db.php). If you're
-- importing this onto a cPanel DB that already has rows from before this
-- constraint existed, run the dedupe block below FIRST or this CREATE/ALTER
-- will fail with a duplicate-key error:
--
--   -- merge duplicate mobiles, keeping the newest name and re-pointing spins
--   -- to one surviving user row, then: ALTER TABLE users ADD UNIQUE INDEX uq_users_mobile (mobile);
--
CREATE TABLE IF NOT EXISTS users (
  id               VARCHAR(40) PRIMARY KEY,
  name             VARCHAR(120) NOT NULL,
  mobile           VARCHAR(20)  NOT NULL UNIQUE,
  marketing_opt_in TINYINT(1) NOT NULL DEFAULT 0,
  token            VARCHAR(64),
  created_at       BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wa_opt_outs (
  mobile     VARCHAR(20) PRIMARY KEY,
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wa_templates (
  id         VARCHAR(40) PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  body       TEXT NOT NULL,
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Persistent OTP/login sessions (replaces the Node in-memory store).
CREATE TABLE IF NOT EXISTS sessions (
  id               VARCHAR(64) PRIMARY KEY,
  name             VARCHAR(120),
  mobile           VARCHAR(20),
  marketing_opt_in TINYINT(1) NOT NULL DEFAULT 0,
  otp              VARCHAR(8),
  verified         TINYINT(1) NOT NULL DEFAULT 0,
  user_id          VARCHAR(40),
  reward           TEXT,
  token            VARCHAR(64),
  created_at       BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin OTP sessions + 12h bearer tokens (replaces Node in-memory Maps).
CREATE TABLE IF NOT EXISTS admin_sessions (
  id         VARCHAR(64) PRIMARY KEY,
  mobile     VARCHAR(20) NOT NULL,
  otp        VARCHAR(8),
  token      VARCHAR(64),
  attempts   INT NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_admin_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Seed defaults (first install) ----------
INSERT INTO settings (id, brand_name, theme_color, accent_color, logo_text, wheel_size, tagline)
VALUES (1, 'Café Cream Bar', '#f0588e', '#f7a53b', 'Café', 320, 'Every card wins something');

INSERT INTO coupons (id, title, product, code_prefix, validity_days, active, created_at) VALUES
  ('c-coffee', 'Free Coffee', 'Any regular coffee', 'CCB', 14, 1, UNIX_TIMESTAMP()*1000),
  ('c-10',     '10% Off',     'Entire bill',        'CCB', 14, 1, UNIX_TIMESTAMP()*1000),
  ('c-cookie', 'Free Cookie', 'Choc-chip cookie',   'CCB', 14, 1, UNIX_TIMESTAMP()*1000),
  ('c-20',     '20% Off',     'Entire bill',        'CCB', 14, 1, UNIX_TIMESTAMP()*1000),
  ('c-bogo',   'Buy 1 Get 1', 'Any beverage',       'CCB', 14, 1, UNIX_TIMESTAMP()*1000);

INSERT INTO segments (id, label, color, weight, coupon_id, position) VALUES
  ('s1', 'Free Coffee', '#F2A03D', 28, 'c-coffee', 0),
  ('s2', '10% Off',     '#3B6FE5', 18, 'c-10',     1),
  ('s3', 'Try Again',   '#22314F', 8,  NULL,       2),
  ('s4', 'Free Cookie', '#E0407F', 20, 'c-cookie', 3),
  ('s5', '20% Off',     '#F2A03D', 12, 'c-20',     4),
  ('s6', 'Buy 1 Get 1', '#22314F', 14, 'c-bogo',   5);

INSERT INTO wa_templates (id, name, body, created_at) VALUES
  ('wt-spinwr-seed01', 'scratch_card_reward',
   'Hey [Name]! 🎉 You scratched a card at [Business Name] and won: [Prize]. Use code [CODE] on your next order. Valid for [Days] days. Reply STOP to unsubscribe.',
   UNIX_TIMESTAMP()*1000),
  ('wt-remind-seed02', 'coupon_reminder',
   'Hi [Name]! ⏰ Your coupon [CODE] from [Business Name] is still unused. Pop in and redeem it before it expires! Reply STOP to unsubscribe.',
   UNIX_TIMESTAMP()*1000),
  ('wt-winbk-seed03', 'win_back',
   'We miss you, [Name]! 💛 Come back to [Business Name] and scratch again for a fresh reward. Reply STOP to unsubscribe.',
   UNIX_TIMESTAMP()*1000);

UPDATE settings SET wa_template_body =
  'Hey [Name]! 🎉 You scratched a card at [Business Name] and won: [Prize]. Use code [CODE] on your next order. Valid for [Days] days. Reply STOP to unsubscribe.'
WHERE id = 1;
