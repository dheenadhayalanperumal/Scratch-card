# Deploy Scratch-to-Win entirely on cPanel (no Node.js)

Both parts run on plain cPanel/Apache + MySQL — no Node.js at runtime:

- **Frontend:** Next.js exported to **static HTML/CSS/JS** (`frontend/out`), served
  by Apache. Every page is a client component that calls the API in the browser.
- **Backend:** the PHP API in `php-backend/` (see `php-backend/README.md`).
- **Database:** MySQL.

```
Browser ──> Apache (static Next.js)  ──/scratchapi/api/*──> PHP ──> MySQL
            (same cPanel account & domain)
```

Hosting both on one domain means **same origin → no CORS headaches**.

---

## 1. Database
cPanel → **MySQL® Databases**: create a DB + user, grant ALL PRIVILEGES. Note the
prefixed names (e.g. `cpuser_spinwheel`, `cpuser_spinuser`).
Then cPanel → **phpMyAdmin** → select the DB → **Import** → upload
`php-backend/schema.sql` and run it (creates tables + seed data).

## 2. Backend (PHP)
1. Upload the contents of `php-backend/` into `public_html/scratchapi/`.
2. Edit `scratchapi/config.php`: set `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
   - Same-domain hosting → leave `CORS_ALLOW_ORIGIN` as `*` (or set to your domain).
   - Fill `WHATSAPP_*` only for real delivery; blank = simulation mode.
3. Test: open `https://yourdomain.com/scratchapi/api/health` → `{"ok":true}`.

## 3. Frontend (static export)
Build locally with the API base pointing at the PHP backend, then upload `out/`.

Because the frontend and API share the domain, use a **relative** base so it works
regardless of domain name and needs no CORS:

```bash
cd frontend
npm install                      # first time only
NEXT_PUBLIC_API_BASE="/scratchapi" npm run build
```

This produces `frontend/out/`. Upload **the contents of `out/`** into
`public_html/` (so `public_html/index.html` is the wheel and
`public_html/admin/` is the dashboard). Keep `public_html/scratchapi/` alongside it.

> The API URL is baked in at build time. If you change where the API lives, or
> move it to a subdomain, rebuild with the new `NEXT_PUBLIC_API_BASE` and re-upload.

### Final layout on the server
```
public_html/
  index.html            ← the spin wheel (from frontend/out)
  admin/                ← admin dashboard (from frontend/out)
  _next/                ← static assets (from frontend/out)
  404.html
  scratchapi/              ← PHP backend (index.php, config.php, ...)
```

## 4. Verify
- `https://yourdomain.com/`        → the wheel loads and spins
- `https://yourdomain.com/admin/`  → the dashboard loads
- Run through name → OTP → spin; the code should appear and persist.

---

## Alternative: API on a subdomain
If you prefer `api.yourdomain.com` for the backend, point that subdomain's
document root at the `php-backend` folder and build the frontend with
`NEXT_PUBLIC_API_BASE="https://api.yourdomain.com"`. Then set
`CORS_ALLOW_ORIGIN` in `config.php` to `https://yourdomain.com`.

## Notes
- The `/admin` area has **no authentication** (demo). Add auth before real use.
- If `/admin/` 404s, ensure Apache serves directory index files (default on
  cPanel) — `trailingSlash` export already emits `admin/index.html`.
- The Node backend in `/backend` and the combined `app.js` are not used in this
  all-cPanel setup; they remain only for local development.
