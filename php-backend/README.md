# Scratch-to-Win — PHP + MySQL backend

A drop-in replacement for the Node/Express backend, written in plain PHP (PDO +
MySQL) so it runs on any standard cPanel/Apache host — no Node.js required.

**To upload the whole site (static HTML + this API) to cPanel**, use the packaged
build in `deploy/` and follow `deploy/DEPLOY.md`. You do not need Vercel or Node
on the server.

OTP/login sessions live in MySQL (`sessions` + `admin_sessions`), so the flow
works across stateless PHP requests.

```
Browser ──HTTPS──> cPanel Apache
                    ├── /           static HTML (the wheel + /admin)
                    └── /scratchapi    this PHP API ──> MySQL
```

## Files

| File | Purpose |
|------|---------|
| `index.php` | Front controller / router — all `/api/*` endpoints |
| `config.php` | DB + WhatsApp + CORS + admin mobiles (edit this on the server) |
| `db.php` | MySQL data layer (PDO) |
| `sessions.php` | DB-backed customer + admin OTP sessions |
| `whatsapp.php` | WhatsApp Cloud API (simulation mode if no token) |
| `helpers.php` | shared helpers + JSON responses |
| `schema.sql` | tables + seed data to import via phpMyAdmin |
| `.htaccess` | routes all requests to `index.php` |

The ready-to-upload copy of these files is `deploy/public_html/scratchapi/`.

## Notes

- **Admin OTP:** set `ADMIN_MOBILES` in `config.php` (comma-separated 10-digit
  numbers) before going live. Empty = open demo mode (any number can sign in).
- **WhatsApp webhook** (optional): point Meta to
  `https://yourdomain.com/scratchapi/api/whatsapp/webhook` and set
  `WHATSAPP_VERIFY_TOKEN` in `config.php` to match.
- **Large logos / festival photos:** if a save fails, raise `post_max_size` /
  `upload_max_filesize` to 32M in cPanel → MultiPHP INI Editor.
- The original Node backend (`/backend`) is untouched and still works for local
  development.
