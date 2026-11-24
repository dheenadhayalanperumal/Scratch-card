<?php
// Scratch-to-Win PHP backend configuration.
// Edit the values below (or set matching environment variables in cPanel).

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_USER', getenv('DB_USER') ?: 'cpuser_scratchuser');   // cPanel-prefixed user
define('DB_PASSWORD', getenv('DB_PASSWORD') ?: '');
define('DB_NAME', getenv('DB_NAME') ?: 'cpuser_scratchcard');  // cPanel-prefixed db name

// WhatsApp Business Cloud API (Meta). Leave the token/phone id blank to run in
// SIMULATION mode — messages are computed and returned but not actually sent, so
// the flow works without real credentials.
define('WHATSAPP_ACCESS_TOKEN', getenv('WHATSAPP_ACCESS_TOKEN') ?: '');
define('WHATSAPP_PHONE_NUMBER_ID', getenv('WHATSAPP_PHONE_NUMBER_ID') ?: '');
define('WHATSAPP_API_VERSION', getenv('WHATSAPP_API_VERSION') ?: 'v25.0');
define('WHATSAPP_TEMPLATE_LANG', getenv('WHATSAPP_TEMPLATE_LANG') ?: 'en_US');
define('WHATSAPP_DEFAULT_COUNTRY_CODE', getenv('WHATSAPP_DEFAULT_COUNTRY_CODE') ?: '91');
define('WHATSAPP_VERIFY_TOKEN', getenv('WHATSAPP_VERIFY_TOKEN') ?: 'scratch-verify');

// Default WhatsApp template body used when a settings/library body is missing.
define('DEFAULT_WA_TEMPLATE',
  "Hey [Name]! \u{1F389} You scratched a card at [Business Name] and won: [Prize]. " .
  "Use code [CODE] on your next order. Valid for [Days] days. Reply STOP to unsubscribe.");
define('DEFAULT_TEMPLATE_NAME', 'jaspers_market_order_confirmation_v1');

// CORS: the frontend calls this API. Same-domain hosting can leave this as '*';
// or set it to your exact site URL (e.g. https://yourdomain.com).
define('CORS_ALLOW_ORIGIN', getenv('CORS_ALLOW_ORIGIN') ?: '*');

// Comma-separated 10-digit mobiles allowed to sign into /admin.
// Leave empty for open demo mode (any number can request an OTP) — set this
// before going live, e.g. '9876543210,9123456780'.
define('ADMIN_MOBILES', getenv('ADMIN_MOBILES') ?: '');

// Temporarily set to true to return the real error message in API responses
// while debugging (e.g. DB connection issues). Set back to false in production.
define('DEBUG', false);
