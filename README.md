# 🎟️ Scratch & Win — Café Cream Bar

A mobile-first **scratch-card reward flow** built to match the provided designs:
landing → lead capture → OTP verification → scratch-off card → reward reveal → confirmation.

- **Frontend** — Next.js (App Router) + React, CSS Modules, `next/font`. Reusable component library.
  - Public scratch page at `/` and an **admin panel at `/admin`**.
- **Backend** — Node.js + Express REST API (lead capture, OTP, server-decided scratch
  outcome) backed by **MySQL** (via `mysql2`).

```
Scratch-card/
├── package.json          # root scripts (run both apps together)
├── backend/              # Node.js + Express API
│   ├── server.js
│   ├── .env.example      # MySQL connection config
│   └── src/
│       ├── mysql.js      # connection pool, schema creation, seeding
│       ├── db.js         # async data access (settings/coupons/segments/users/spins)
│       └── store.js      # in-memory OTP sessions
└── frontend/             # Next.js app
    ├── app/              # layout, globals, page (flow), admin/ (admin panel)
    ├── components/       # reusable UI + components/admin/* + components/screens/*
    └── lib/api.js        # API client (public + admin)
```

## Prerequisites

A running **MySQL** server (8.x recommended). The app creates its database, tables
and seed data automatically on first boot — you only need the server + credentials.

```bash
# macOS (Homebrew)
brew install mysql && brew services start mysql

# or Docker
docker run --name scratch-mysql -e MYSQL_ROOT_PASSWORD= -e MYSQL_ALLOW_EMPTY_PASSWORD=1 \
  -p 3306:3306 -d mysql:8
```

## Getting started

```bash
# from the project root
npm install            # installs root tooling (concurrently)
npm run install:all    # installs backend + frontend deps too

# configure the DB connection
cp backend/.env.example backend/.env   # then edit credentials if needed

npm run dev            # runs backend (:4000) and frontend (:3000) together
```

On first run the backend creates the `scratch_to_win` database, all tables, and seeds
default branding / coupons / segments. You'll see `Seeded default …` in the log.

Then open the **scratch page at http://localhost:3000** and the **admin panel at
http://localhost:3000/admin**.

Run them separately if you prefer:

```bash
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:3000
```

## Demo logo & sample data

A fresh install is pre-filled so the admin panel isn't empty:

- **Dummy logo** (coffee cup on a scratch ticket) and **prize artwork** for every default prize
  — only applied where you haven't uploaded your own.
- **30 sample customers and ~90 plays** spread over the last ~3 weeks, with a mix of wins,
  misses, active / redeemed / expired coupons and WhatsApp delivery states, so the
  Dashboard, Users & Plays, Redeem history and charts all have data.

All sample rows have ids starting with `demo-`, so they can be removed without touching real customers.

```bash
cd backend
npm run seed:demo              # (re)create the demo customers/plays, fill in missing artwork
npm run seed:demo -- --clear   # delete every demo customer + play
npm run seed:demo -- --sql     # regenerate php-backend/demo-data.sql + deploy/demo-data.sql
```

To skip demo data on a fresh install, set `SEED_DEMO_DATA=0` in `backend/.env`.
**PHP / cPanel:** import `schema.sql`, then `demo-data.sql` (optional) in phpMyAdmin.

## How the flow works

1. **Landing** — tap the scratch card or *Scratch & Win Now*.
2. **Lead form** — name + 10-digit mobile + marketing consent → `POST /api/lead`.
3. **OTP** — 4-digit code (the demo prints it to the backend console and shows a
   "Demo code" hint in the UI) → `POST /api/verify`.
4. **Draw** — the **server** picks the prize (`POST /api/spin`, weighted by the admin's
   prize weights) *before* the foil becomes scratchable, so scratching only reveals the
   result — it can't be guessed or forged client-side.
5. **Scratch** — drag a finger/mouse over the foil (canvas, with scratch sound + haptics).
   Once ~50% is cleared the rest dissolves. *Reveal Instantly* clears it for keyboard /
   accessibility users.
6. **You won** modal (or *Better luck next time*) → **All set** confirmation with the
   redeemable coupon code. Returning customers stay logged in and can scratch a new card
   (subject to the *max plays per customer* rule), and see every coupon in their wallet.

> Internally the API/DB keep the original names (`segments` = card prizes, `spins` =
> plays, `wheelSize` = card width, `maxSpinsPer` = play limit) so every backend feature
> from the Spin-wheel project — Node and PHP — works unchanged.

## Admin panel (`/admin`)

A control center for the whole campaign. Everything here drives the public page live.

1. **Branding** — brand name, tagline, logo (text or uploaded image), and theme +
   accent colors (with presets). These re-skin the public page's logo, headline
   gradient and CTAs.
2. **Scratch Card & Prizes** — set the card **width** (slider), add/remove prizes, pick
   each prize's background **color** and image, attach the **coupon** it pays out, and set
   its **win weight**. A live percentage shows each prize's real chance — this is how you
   *control the user's winning prediction*. Includes a live card preview you can test-draw
   and scratch.
3. **Coupons** — create/edit/enable/disable/delete rewards (title, product, code
   prefix, validity). The coupon you attach to a segment is exactly what that segment
   awards, with a generated code.
4. **Users & Plays** — every registered user (name, mobile, spin count, last reward,
   marketing opt-in) and every spin (user, **spin time**, **won coupon**, code, and
   editable **coupon status**: active / redeemed / expired).

## API

### Public

| Method | Path           | Purpose                                          |
| ------ | -------------- | ------------------------------------------------ |
| GET    | `/api/health`  | Health check                                     |
| GET    | `/api/config`  | Branding settings + wheel segments (public view) |
| POST   | `/api/lead`    | Capture lead (creates a user), "send" OTP         |
| POST   | `/api/verify`  | Verify OTP code                                  |
| POST   | `/api/resend`  | Re-issue OTP                                     |
| POST   | `/api/spin`    | Weighted draw, records the spin, returns coupon  |

### Admin (`/api/admin/*`)

| Method | Path             | Purpose                                  |
| ------ | ---------------- | ---------------------------------------- |
| GET/PUT| `/settings`      | Read / update branding + wheel size      |
| GET/POST | `/coupons`     | List / create coupons                    |
| PUT/DELETE | `/coupons/:id` | Update / delete a coupon              |
| GET/PUT| `/segments`      | List / replace wheel segments            |
| GET    | `/users`         | Registered users + spin summary          |
| GET    | `/spins`         | All spin records                         |
| PATCH  | `/spins/:id`     | Update a coupon's status                 |
| GET    | `/stats`         | Dashboard counters                       |

### Configuration

- All campaign data (settings, segments, coupons, users, spins) lives in **MySQL**.
  Tables: `settings`, `coupons`, `segments`, `users`, `spins`.
- DB connection is read from `backend/.env` (`DB_HOST`, `DB_PORT`, `DB_USER`,
  `DB_PASSWORD`, `DB_NAME`). See `backend/.env.example`.
- To reset to defaults: `DROP DATABASE scratch_to_win;` (it re-creates + re-seeds on the
  next boot), or just empty the `settings` table.
- The frontend reads the API base from `NEXT_PUBLIC_API_BASE` (defaults to
  `http://localhost:4000`).

## Notes for production

Data is stored in MySQL, but OTP sessions are kept in an in-memory store and the OTP is
returned in the response for demo convenience. The `/api/admin/*` routes have **no auth**.
For production: **put the admin API behind authentication**, move OTP sessions to a
shared store (e.g. Redis) if you run multiple instances, send the OTP via an SMS
provider, rate-limit `/api/lead` & `/api/verify`, and stop returning `devOtp`.
