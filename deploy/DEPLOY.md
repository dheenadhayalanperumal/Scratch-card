# Scratch & Win — cPanel upload

This package is **static HTML/CSS/JS + PHP**. It does **not** need Node.js.
PHP 8.1+ and MySQL (or MariaDB) on a normal cPanel Apache host is enough.

## What to upload

| Item | Where it goes |
|------|----------------|
| Everything inside `public_html/` | Your domain’s `public_html/` (or the addon-domain document root) |
| `schema.sql` | Import in phpMyAdmin only — do **not** put this file on the website |

The site files live at the domain root. The API lives at `/scratchapi/` on the same domain.

```
public_html/
  index.html          ← customer wheel
  admin/              ← staff dashboard
  _next/              ← JS/CSS (do not rename)
  .htaccess
  scratchapi/            ← PHP API (edit config.php here)
    index.php
    config.php
    …
```

## 1. Create the database

cPanel → **MySQL® Databases**:

1. Create a database (cPanel prefixes it, e.g. `youruser_spinwheel`).
2. Create a user with a strong password (e.g. `youruser_spinuser`).
3. Add the user to the database with **ALL PRIVILEGES**.
4. Write down the **prefixed** database name, username, and password.

## 2. Import the tables

cPanel → **phpMyAdmin**:

1. Select the new database in the left sidebar.
2. Open the **Import** tab.
3. Choose `schema.sql` from this package and go.

That creates the tables and a starter café campaign (coupons + wheel). You can
change branding later from `/admin`.

If this database already exists from an older upload, skip the import — the
PHP API adds any missing columns on first request.

## 3. Upload the site

cPanel → **File Manager** → `public_html`:

1. Upload `public_html/` **contents** (not the folder itself), or unzip
   `spin-to-win-cpanel.zip` and copy `public_html/*` in.
2. Keep `.htaccess` — File Manager hides it unless **Show Hidden Files** is on.

Typical layout after upload:

```
/home/youruser/public_html/index.html
/home/youruser/public_html/admin/
/home/youruser/public_html/scratchapi/config.php
```

## 4. Edit `scratchapi/config.php`

Open `public_html/scratchapi/config.php` and set:

```php
define('DB_USER', getenv('DB_USER') ?: 'youruser_spinuser');
define('DB_PASSWORD', getenv('DB_PASSWORD') ?: 'your-db-password');
define('DB_NAME', getenv('DB_NAME') ?: 'youruser_spinwheel');

// Staff numbers that may sign in at /admin (comma-separated).
// Leave empty only while testing — anyone who knows the URL can then log in.
define('ADMIN_MOBILES', getenv('ADMIN_MOBILES') ?: '9876543210');
```

`DB_HOST` is usually `localhost` on cPanel. Leave WhatsApp fields blank to run
in simulation mode (OTP still works; the 4-digit code is shown on screen).

## 5. PHP version

cPanel → **Select PHP Version** / MultiPHP Manager: choose **PHP 8.1 or newer**.
Enable `pdo_mysql` (on by default).

If saving a festival background photo fails, cPanel → **MultiPHP INI Editor**:
set `post_max_size` and `upload_max_filesize` to `32M`.

## 6. Test

1. `https://yourdomain.com/scratchapi/api/health` → `{"ok":true}`
2. `https://yourdomain.com/` → the spin wheel
3. `https://yourdomain.com/admin/` → admin OTP login

The customer camera/QR redeem desk needs **HTTPS** (cPanel AutoSSL is fine).
HTTP on a LAN IP cannot open the camera; photo-upload and typed codes still work.

## Updating later

Rebuild on the development machine:

```bash
cd frontend
NEXT_PUBLIC_API_BASE=/scratchapi npm run build
```

Then replace `public_html/` (except `scratchapi/config.php`) with the new
`frontend/out/` plus the PHP files from `php-backend/` (keep your edited
`config.php`).
