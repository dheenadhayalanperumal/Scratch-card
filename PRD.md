# Product Requirements Document — Scratch & Win

**Product:** Scratch & Win — Reward Spin Wheel Campaign Platform
**Document owner:** Product / Engineering
**Status:** Living document (reflects current implementation)
**Last updated:** 2026-07-06

---

## 1. Overview

Scratch & Win is a mobile-first, lead-generating **spin-to-win** campaign platform for
retail and F&B brands (reference brand: *Café Cream Bar*). A customer lands on a
branded page, submits their details, verifies via OTP, spins an animated prize wheel,
and instantly receives a reward coupon — delivered on-screen and over WhatsApp.

A no-login **admin panel** lets a campaign operator re-skin the experience, design the
wheel and its win probabilities, manage coupons, view every registered user and spin,
and configure WhatsApp delivery — all live, without code changes.

The **outcome is decided server-side** using weighted probabilities so results cannot
be guessed or forged from the browser. This is the core integrity guarantee of the
product: the operator controls the true odds; the wheel animation merely visualizes a
result already chosen by the server.

## 2. Goals & Non-Goals

### Goals
- Capture qualified leads (name, mobile, marketing consent) behind an engaging game.
- Give operators full live control over branding, wheel, odds, coupons, and messaging.
- Guarantee tamper-proof, weighted spin outcomes decided on the server.
- Deliver rewards instantly on-screen and via WhatsApp Business messaging.
- Provide a clear operational record of users, spins, and coupon redemption status.
- Deploy easily (Node + MySQL primary stack; static + PHP variant for shared/cPanel hosting).

### Non-Goals (current phase)
- Multi-tenant SaaS account management / billing.
- Real SMS OTP delivery (OTP is currently demo/console-based).
- Authentication on the admin API (explicitly out of scope for the demo; see §11).
- Payment or point-of-sale integration for coupon redemption.

## 3. Target Users & Personas

| Persona | Description | Primary needs |
| --- | --- | --- |
| **Customer / Player** | Walk-in or online customer engaging with the campaign on a phone. | Fast, fun, trustworthy spin; a real reward they can redeem. |
| **Campaign Operator** | Marketing staff running a promotion for one brand/outlet. | Live control of branding, prizes, odds; visibility into leads and redemptions. |
| **Store Staff** | Person honoring the coupon in-store. | Verify a coupon code and mark it redeemed/expired. |

## 4. User Flow (Customer)

1. **Landing** — Branded hero; tap the golden hub or *Spin the Wheel Now*.
2. **Lead capture** — Name + 10-digit mobile + marketing consent → `POST /api/lead`
   (creates/looks up the user, "sends" OTP).
3. **OTP verification** — 4-digit code → `POST /api/verify`. (Demo: code is printed to
   the backend console and hinted in the UI.) `POST /api/resend` re-issues a code.
4. **Spin** — `POST /api/spin` runs a weighted draw server-side, records the spin, and
   returns the winning segment + coupon. The wheel animates to land on that segment.
5. **You Won** modal — reveals the prize, coupon title, product image, and code.
6. **All Set** confirmation — shows the redeemable coupon; the reward is also sent via
   WhatsApp.

Spin frequency per customer is governed by the `max_spins_per` setting (e.g.
`unlimited` or a fixed cap).

## 5. Feature Requirements

### 5.1 Public spin experience (`/`)
- Fully branded from admin settings: brand name, tagline, logo (text or uploaded
  image), theme + accent colors applied to logo, headline gradient, and CTAs.
- Animated `SpinWheel` component sized by the admin wheel-size setting; segments,
  colors, and labels driven by configuration.
- Reusable, mobile-first component library (Button, TextField, OtpInput, Checkbox,
  Modal, Sheet, CouponCard, Hero, Header) with CSS Modules.
- Screen components for each step: `LeadForm`, `OtpStep`, `WonModal`, `AllSet`.

### 5.2 Server-decided spin engine
- Weighted random draw across segments using each segment's `weight`.
- Live win-percentage per segment shown to the operator so odds are explicit and tunable.
- Every spin persisted with user, timestamp, segment, coupon, generated code, status,
  and WhatsApp delivery status.
- Coupon codes: `generated` (prefix + unique suffix) or `static` (fixed shared code).

### 5.3 Admin panel (`/admin`)
Tabbed control center; all changes take effect on the public page live.

- **Branding** — brand name, tagline, logo (text/image), theme + accent colors with presets.
- **Scratch Card & Prizes** — wheel size slider; add/remove segments; per-segment color,
  attached coupon, and win weight; live percentage per segment; wheel preview + test spin.
- **Coupons** — create/edit/enable/disable/delete rewards (title, product + image, code
  prefix, validity days, code type: generated/static).
- **Promotions** — campaign-level promotional configuration.
- **Users & Plays (Records)** — every registered user (name, mobile, spin count, last
  reward, marketing opt-in) and every spin (user, time, won coupon, code, and editable
  coupon **status**: active / redeemed / expired).
- **Templates** — manage reusable WhatsApp message templates.
- **WhatsApp** — configure phone-number ID, approved template name, editable message
  body, view opt-outs, and delivery configuration.
- **Dashboard** — campaign KPI counters (users, spins, wins, redemptions).

### 5.4 WhatsApp delivery
- After a winning spin, send a prize confirmation + coupon code via **WhatsApp Business
  Cloud API (Meta)**.
- **Simulation mode** — with no access token / phone-number ID configured, the message
  is rendered and logged instead of sent, so demos and local dev work without credentials.
- Editable template body with `[Bracket]` placeholder tokens; maps to Meta approved
  template ordered params.
- Number normalization to E.164 (default country code `91`); per-mobile **opt-out** list;
  webhook endpoints for inbound events (`/api/whatsapp/webhook`).
- Per-spin delivery status tracked (`wa_status`, `wa_sent_at`).

## 6. Data Model (MySQL)

| Table | Purpose | Key fields |
| --- | --- | --- |
| `settings` | Branding + wheel + WhatsApp config (single row) | brand_name, theme_color, accent_color, logo_text/image, tagline, wheel_size, max_spins_per, wa_phone_number_id, wa_template_name, wa_template_body |
| `coupons` | Reward definitions | title, product, code_prefix, validity_days, code_type, static_code, active |
| `segments` | Wheel slices | label, color, weight, coupon_id, position |
| `users` | Captured leads | name, mobile, created_at, marketing opt-in |
| `spins` | Spin history + delivery | user, segment, coupon, code, status, wa_status, wa_sent_at, spun_at, expires_at |
| `wa_opt_outs` | WhatsApp opt-out list | mobile |
| `wa_templates` | Reusable message templates | name, body |

- The backend auto-creates the `scratch_to_win` database, all tables, and seed data
  (default branding, coupons, segments) on first boot.
- OTP sessions are held in an **in-memory** store (not MySQL).

## 7. API Surface

### Public
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/config` | Branding + public wheel segments |
| GET | `/api/wheel` | Wheel configuration |
| GET | `/api/me` | Current session/user context |
| POST | `/api/lead` | Capture lead, "send" OTP |
| POST | `/api/verify` | Verify OTP |
| POST | `/api/resend` | Re-issue OTP |
| POST | `/api/spin` | Weighted draw, record spin, return coupon |
| GET/POST | `/api/whatsapp/webhook` | Meta verification + inbound events |

### Admin (`/api/admin/*`)
| Method | Path | Purpose |
| --- | --- | --- |
| GET/PUT | `/settings` | Read / update branding + wheel size |
| GET/POST | `/coupons` | List / create coupons |
| PUT/DELETE | `/coupons/:id` | Update / delete a coupon |
| GET/PUT | `/segments` | List / replace wheel segments |
| GET | `/users` | Registered users + spin summary |
| GET | `/spins` | All spin records |
| PATCH | `/spins/:id` | Update a coupon's status |
| GET | `/stats` | Dashboard counters |

## 8. Architecture & Tech Stack

- **Frontend** — Next.js (App Router) + React, CSS Modules, `next/font`. Public page at
  `/`, admin at `/admin`. API client in `lib/api.js`. Supports static export (`out/`).
- **Backend** — Node.js + Express REST API. Data access via `mysql2`; in-memory OTP
  store; WhatsApp integration module. Runs on `:4000` (frontend on `:3000`).
- **Database** — MySQL 8.x (auto-created, seeded on first boot).
- **Config** — Backend reads DB creds from `backend/.env`; frontend reads API base from
  `NEXT_PUBLIC_API_BASE` (default `http://localhost:4000`).
- **Alternate deployment (cPanel/shared hosting)** — a **PHP backend** (`php-backend/`
  with `index.php`, `db.php`, `sessions.php`, `whatsapp.php`, `schema.sql`) plus a
  **static frontend export** (`frontend-static-cpanel.zip`) for environments without Node.
  See `DEPLOY-CPANEL.md`.

## 9. Deployment

- **Primary:** `npm run dev` runs backend + frontend together; `npm run install:all`
  installs both. First boot seeds the database.
- **cPanel/static:** deploy the static frontend export + PHP backend (MySQL via cPanel).

## 10. Success Metrics

- **Leads captured** (unique verified users).
- **Spin conversion** — % of landings that complete a spin.
- **Reward delivery rate** — % of wins successfully delivered via WhatsApp.
- **Redemption rate** — % of issued coupons marked redeemed.
- **Opt-in rate** — % of leads consenting to marketing.

## 11. Security, Privacy & Production Hardening

Current build is optimized for demo/onboarding. Before production:

- **Add authentication** to all `/api/admin/*` routes (currently unauthenticated).
- **Real OTP delivery** via an SMS provider; stop returning the dev OTP in responses.
- **Shared OTP store** (e.g. Redis) if running multiple backend instances.
- **Rate-limit** `/api/lead` and `/api/verify` against abuse.
- **Secrets management** — move WhatsApp access token / phone-number ID out of source
  into environment/secret storage; rotate any committed credentials.
- **PII handling** — store customer name/mobile per applicable data-protection rules;
  honor WhatsApp opt-outs and marketing consent.

## 12. Open Questions / Future Work

- Multi-tenant support (multiple brands/outlets under one deployment).
- Admin authentication and role-based access.
- Analytics dashboard beyond basic counters (funnel, cohort, time-series).
- Coupon redemption via a staff-facing scanner/validation flow.
- Fraud controls (device/IP throttling, duplicate-mobile handling).
- Email delivery channel alongside WhatsApp.
