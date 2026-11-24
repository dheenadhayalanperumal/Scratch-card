<?php
// Spin-to-Win API — PHP front controller. Ports every route from the Express
// backend/server.js, keeping the same paths, methods and JSON shapes.

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/sessions.php';
require_once __DIR__ . '/whatsapp.php';

/* ---------- CORS (frontend is on a different origin: Vercel) ---------- */
header('Access-Control-Allow-Origin: ' . CORS_ALLOW_ORIGIN);
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Max-Age: 86400');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// Turn PHP warnings/errors into JSON 500s instead of breaking the response.
set_error_handler(function ($no, $str) { throw new ErrorException($str, 0, $no); });

// Input bounds (mirrors server.js).
const MAX_MESSAGE_LEN = 1024;
const MAX_LOGO_CHARS = 1500000;
// A settings save can carry the logo plus up to 3 seasonal theme background
// images (each capped at MAX_LOGO_CHARS) — cPanel's default php.ini
// post_max_size (often 8M) may need raising for that combined payload.
const MAX_SEGMENTS = 24; // a wheel this big is already unreadable

// Text column widths from schema.sql. Without these checks an over-long value
// reaches MySQL and comes back as a generic 500 instead of a usable message.
const FIELD_LIMITS_SETTINGS = [
  'brandName' => 120, 'themeColor' => 20, 'accentColor' => 20, 'logoText' => 60,
  'tagline' => 160, 'waPhoneNumberId' => 40, 'waTemplateName' => 80,
];
const FIELD_LIMITS_COUPON = [
  'title' => 120, 'product' => 200, 'codePrefix' => 12, 'staticCode' => 60, 'codeType' => 12,
];
const FIELD_LIMITS_SEGMENT = ['label' => 120, 'color' => 20];

// maxSpinsPer drives the spin-limit window at /api/spin. An unrecognised value
// would leave the window unset and silently disable the limit entirely.
const SPIN_LIMITS = ['day', 'week', 'unlimited'];

/** Fails the request if any field in $limits is not text or is over its cap. */
function checkFields($body, $limits) {
  foreach ($limits as $key => $max) {
    if (!isset($body[$key]) || $body[$key] === null) continue;
    if (!is_string($body[$key])) fail('"' . $key . '" must be text.');
    if (strlen(trim($body[$key])) > $max)
      fail('"' . $key . '" is too long (max ' . $max . ' characters).');
  }
}

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Route = everything from "/api" onward, so the API works in any subfolder.
$pos = strpos($uri, '/api');
$route = $pos === false ? $uri : substr($uri, $pos);

// Register routes; the first method+pattern match runs and the handler exits.
$ROUTES = [];
function on($m, $pattern, $cb) {
  global $ROUTES;
  $ROUTES[] = [$m, $pattern, $cb];
}

/* =====================  PUBLIC API  ===================== */

on('GET', '#^/api/health$#', fn() => send_json(['ok' => true]));

on('GET', '#^/api/config$#', function () {
  $settings = getSettings();
  // The public page gets the *live* festival (a scheduled date window wins
  // over the admin's manually activated festival) precomputed — the admin
  // screen fetches the raw list separately via /api/admin/settings.
  $settings['theme'] = effectiveTheme($settings['theme'], $settings['themeConfig']);
  $settings['liveFestival'] = liveFestival($settings);
  $segments = array_map(fn($s) => ['id' => $s['id'], 'label' => $s['label'], 'color' => $s['color'], 'image' => $s['image']], listSegments());
  send_json(['settings' => $settings, 'segments' => $segments]);
});

on('GET', '#^/api/wheel$#', function () {
  $segments = array_map(fn($s) => ['id' => $s['id'], 'label' => $s['label'], 'color' => $s['color'], 'image' => $s['image']], listSegments());
  send_json(['segments' => $segments]);
});

// Lets the frontend ask "is this mobile already registered?" before deciding
// whether to show the name field, without creating a session or sending an OTP.
on('GET', '#^/api/lead/check$#', function () {
  $mobile = normalizeMobile($_GET['mobile'] ?? '');
  if (strlen($mobile) !== 10) send_json(['known' => false]);
  $existing = getUserByMobile($mobile);
  send_json($existing ? ['known' => true, 'name' => $existing['name']] : ['known' => false]);
});

on('POST', '#^/api/lead$#', function () {
  $b = body();
  $mobile = normalizeMobile($b['mobile'] ?? '');
  if (strlen($mobile) !== 10) fail('Enter a valid 10-digit mobile number.');

  // A mobile already on file is a returning customer — reuse their stored
  // name instead of asking for (or trusting) a freshly typed one.
  $existing = getUserByMobile($mobile);
  if ($existing) {
    $name = $existing['name'];
  } else {
    // Names arrive from a public form: normalize, then validate. Anything that
    // isn't a plain string (array/object) normalizes to '' and is rejected.
    $name = normalizeName(is_string($b['name'] ?? null) ? $b['name'] : '');
    $nameError = validateName($name);
    if ($nameError !== null) fail($nameError);
  }

  $optIn = !empty($b['marketingOptIn']) && $b['marketingOptIn'] !== 'false';

  $user = upsertUser($name, $mobile, $optIn);
  $session = createSession($user['name'], $mobile, $optIn, $user['id']);
  send_json([
    'sessionId' => $session['id'],
    'mobile' => $session['mobile'],
    'devOtp' => $session['otp'],
    'name' => $user['name'],
    'isReturning' => (bool)$existing,
  ]);
});

on('POST', '#^/api/verify$#', function () {
  $b = body();
  $session = getSession($b['sessionId'] ?? null);
  if (!$session) fail('Session not found. Start again.', 404);
  if ((string)($b['code'] ?? '') !== (string)$session['otp']) fail('Incorrect code. Please try again.');

  $token = uuidv4();
  if (!empty($session['userId'])) setUserToken($session['userId'], $token);
  markVerified($session['id'], $token);
  send_json(['verified' => true, 'token' => $token]);
});

on('GET', '#^/api/me$#', function () {
  $token = $_GET['token'] ?? null;
  $user = getUserByToken($token);
  if (!$user) fail('Session expired. Please sign in again.', 404);
  $session = createSession($user['name'], $user['mobile'], $user['marketingOptIn'], $user['id']);
  markVerified($session['id'], $token);
  send_json(['sessionId' => $session['id'], 'name' => $user['name'], 'mobile' => $user['mobile']]);
});

// The signed-in customer's claimed coupons (all statuses) for the wallet view.
on('GET', '#^/api/my-coupons$#', function () {
  $user = getUserByToken($_GET['token'] ?? null);
  if (!$user) fail('Session expired. Please sign in again.', 404);
  $settings = getSettings();
  $coupons = array_map(fn($c) => $c + [
    'store'      => $settings['brandName'],
    'validUntil' => fmtDate($c['expiresAt']),
    'wonOn'      => fmtDate($c['spunAt']),
  ], listCouponsByMobile($user['mobile']));
  send_json(['coupons' => $coupons]);
});

on('POST', '#^/api/resend$#', function () {
  $b = body();
  $session = getSession($b['sessionId'] ?? null);
  if (!$session) fail('Session not found. Start again.', 404);
  $otp = rotateOtp($session['id']);
  send_json(['resent' => true, 'devOtp' => $otp]);
});

on('POST', '#^/api/spin$#', function () {
  $b = body();
  $session = getSession($b['sessionId'] ?? null);
  if (!$session) fail('Session not found. Start again.', 404);
  if (!$session['verified']) fail('Verify your number first.', 403);
  if ($session['reward']) send_json($session['reward']);

  // "Max spins per customer" rule (once per day / week / unlimited).
  $settings = getSettings();
  $windowMs = ['day' => 86400000, 'week' => 7 * 86400000][$settings['maxSpinsPer']] ?? null;
  if ($windowMs) {
    $used = countSpinsByMobileSince($session['mobile'], nowMs() - $windowMs);
    if ($used >= 1) {
      $when = $settings['maxSpinsPer'] === 'day' ? 'today' : 'this week';
      fail("You've already played $when. Come back later for another chance!", 429);
    }
  }

  $segment = pickSegment();
  if (!$segment) fail('No scratch-card prizes configured.', 500);
  $user = ['id' => $session['userId'], 'name' => $session['name'], 'mobile' => $session['mobile']];
  $spin = recordSpin($user, $segment);

  $reward = [
    'index' => $spin['segmentIndex'],
    'label' => $spin['couponTitle'],
    'product' => $spin['product'],
    'isWin' => $spin['isWin'],
    'code' => $spin['code'],
    'store' => $settings['brandName'],
    'validUntil' => fmtDate($spin['expiresAt']),
  ];

  if ($spin['isWin']) {
    if (isOptedOut($session['mobile'])) {
      setSpinWhatsApp($spin['id'], 'opted-out');
    } else {
      $tpl = getTemplateByName($settings['waTemplateName']);
      $result = wa_sendSpinReward([
        'settings' => $settings,
        'body' => $tpl['body'] ?? null,
        'name' => $spin['userName'],
        'mobile' => $session['mobile'],
        'prize' => $spin['couponTitle'],
        'code' => $spin['code'],
        'days' => ($spin['expiresAt']) ? (int)round(($spin['expiresAt'] - $spin['spunAt']) / 86400000) : '',
        'date' => $reward['validUntil'],
      ]);
      $sent = $result['status'] === 'sent' || $result['status'] === 'simulated';
      setSpinWhatsApp($spin['id'], $result['status'], $sent ? nowMs() : null);
      $reward['whatsapp'] = $result['status'];
    }
  }

  saveReward($session['id'], $reward);
  send_json($reward);
});

/* =====================  WHATSAPP WEBHOOK  ===================== */
on('GET', '#^/api/whatsapp/webhook$#', function () {
  if (($_GET['hub_mode'] ?? $_GET['hub.mode'] ?? '') === 'subscribe'
      && ($_GET['hub_verify_token'] ?? $_GET['hub.verify_token'] ?? '') === WHATSAPP_VERIFY_TOKEN) {
    http_response_code(200);
    echo $_GET['hub_challenge'] ?? $_GET['hub.challenge'] ?? '';
    exit;
  }
  http_response_code(403); exit;
});

on('POST', '#^/api/whatsapp/webhook$#', function () {
  http_response_code(200);
  // Flush the 200 so Meta doesn't retry, then process opt-out keywords.
  if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
  try {
    $b = body();
    $messages = $b['entry'][0]['changes'][0]['value']['messages'] ?? [];
    foreach ($messages as $m) {
      $text = strtoupper(trim($m['text']['body'] ?? ''));
      if (in_array($text, ['STOP', 'UNSUBSCRIBE', 'STOP PROMOTIONS'], true)) {
        $mobile = substr(preg_replace('/\D/', '', $m['from'] ?? ''), -10);
        if ($mobile) addOptOut($mobile);
      }
    }
  } catch (Throwable $e) { /* ignore */ }
  exit;
});

/* =====================  ADMIN API  =====================
   OTP login (same method as customers): POST /auth/request sends a 4-digit
   code to an admin mobile, POST /auth/verify exchanges it for a 12h bearer
   token. Every other /api/admin/* route requires that token.
   Admin numbers come from ADMIN_MOBILES in config.php (comma-separated).
   When it's unset the login runs in open demo mode — any number may request
   a code — so set ADMIN_MOBILES before going live. */

function adminMobiles() {
  $raw = ADMIN_MOBILES;
  $list = array_values(array_filter(array_map('normalizeMobile', explode(',', (string)$raw)), fn($m) => strlen($m) === 10));
  return $list;
}

function adminBearer() {
  $h = $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? '';
  if (stripos($h, 'Bearer ') === 0) return substr($h, 7);
  return $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? null;
}

on('POST', '#^/api/admin/auth/request$#', function () {
  $mobile = normalizeMobile(body()['mobile'] ?? '');
  if (strlen($mobile) !== 10) fail('Enter a valid 10-digit mobile number.');
  $allow = adminMobiles();
  if ($allow && !in_array($mobile, $allow, true))
    fail("This number isn't registered as an admin. Ask the shop owner to add it.", 403);
  $session = createAdminOtpSession($mobile);
  error_log("[scratch-api] Admin OTP for $mobile: {$session['otp']}");
  send_json(['sessionId' => $session['id'], 'mobile' => $mobile, 'devOtp' => $session['otp']]);
});

on('POST', '#^/api/admin/auth/verify$#', function () {
  $b = body();
  $session = getAdminOtpSession($b['sessionId'] ?? null);
  if (!$session) fail('Code expired or not requested. Enter your number again.', 404);
  if ((string)($b['code'] ?? '') !== (string)$session['otp']) {
    bumpAdminAttempts($session['id']);
    if ($session['attempts'] + 1 >= 5) {
      dropAdminOtpSession($session['id']);
      fail('Too many wrong tries. Request a fresh code.');
    }
    fail('Incorrect code. Please try again.');
  }
  dropAdminOtpSession($session['id']);
  send_json(['token' => issueAdminToken($session['mobile']), 'mobile' => $session['mobile']]);
});

on('POST', '#^/api/admin/auth/resend$#', function () {
  $session = getAdminOtpSession(body()['sessionId'] ?? null);
  if (!$session) fail('Code expired or not requested. Enter your number again.', 404);
  $otp = rotateAdminOtp($session['id']);
  send_json(['resent' => true, 'devOtp' => $otp]);
});

on('GET', '#^/api/admin/auth/me$#', function () {
  $entry = checkAdminToken(adminBearer());
  if (!$entry) fail('Admin session expired. Sign in again.', 401);
  send_json(['mobile' => $entry['mobile']]);
});

on('POST', '#^/api/admin/auth/logout$#', function () {
  revokeAdminToken(adminBearer());
  send_json(['ok' => true]);
});

on('GET', '#^/api/admin/settings$#', fn() => send_json(getSettings()));
on('PUT', '#^/api/admin/settings$#', function () {
  $patch = body();
  if (isset($patch['logoImage']) && is_string($patch['logoImage']) && strlen($patch['logoImage']) > MAX_LOGO_CHARS)
    fail('Logo image is too large.', 413);
  if (isset($patch['waTemplateBody']) && is_string($patch['waTemplateBody']) && strlen($patch['waTemplateBody']) > MAX_MESSAGE_LEN)
    fail('Template is too long (max ' . MAX_MESSAGE_LEN . ' characters).');
  checkFields($patch, FIELD_LIMITS_SETTINGS);
  if (isset($patch['maxSpinsPer']) && !in_array($patch['maxSpinsPer'], SPIN_LIMITS, true))
    fail('Spin limit must be one of: ' . implode(', ', SPIN_LIMITS) . '.');
  if (isset($patch['wheelSize']) && !((int)$patch['wheelSize'] >= 120 && (int)$patch['wheelSize'] <= 1000))
    fail('Card size must be between 120 and 1000.');
  if (isset($patch['theme']) && !in_array($patch['theme'], THEME_IDS, true))
    fail('Theme must be one of: ' . implode(', ', THEME_IDS) . '.');
  if (array_key_exists('themeConfig', $patch)) {
    $themeConfigError = validateThemeConfig($patch['themeConfig']);
    if ($themeConfigError !== null) fail($themeConfigError);
  }
  if (array_key_exists('festivals', $patch)) {
    $festivalsError = validateFestivals($patch['festivals']);
    if ($festivalsError !== null) fail($festivalsError);
  }
  if (array_key_exists('activeFestivalId', $patch)
      && $patch['activeFestivalId'] !== null
      && !is_string($patch['activeFestivalId']))
    fail('Active festival must be a festival id or null.');
  send_json(updateSettings($patch));
});

on('GET', '#^/api/admin/coupons$#', fn() => send_json(listCoupons()));
on('POST', '#^/api/admin/coupons$#', function () {
  $b = body();
  if (trim((string)($b['title'] ?? '')) === '') fail('Coupon needs a title.');
  checkFields($b, FIELD_LIMITS_COUPON);
  send_json(createCoupon($b), 201);
});
on('PUT', '#^/api/admin/coupons/([^/]+)$#', function ($m) {
  checkFields(body(), FIELD_LIMITS_COUPON);
  $c = updateCoupon($m[1], body());
  if (!$c) fail('Coupon not found.', 404);
  send_json($c);
});
on('DELETE', '#^/api/admin/coupons/([^/]+)$#', function ($m) {
  deleteCoupon($m[1]);
  send_json(['deleted' => true]);
});

on('GET', '#^/api/admin/segments$#', fn() => send_json(listSegments()));
on('PUT', '#^/api/admin/segments$#', function () {
  $b = body();
  $segments = isset($b['segments']) && is_array($b['segments']) ? $b['segments'] : [];
  if (count($segments) < 2) fail('A scratch card needs at least 2 prizes.');
  // saveSegments does one round-trip per segment, so cap the count.
  if (count($segments) > MAX_SEGMENTS) fail('A scratch card can have at most ' . MAX_SEGMENTS . ' prizes.');
  foreach ($segments as $s) {
    if (!is_array($s) || trim((string)($s['label'] ?? '')) === '') fail('Every segment needs a label.');
    checkFields($s, FIELD_LIMITS_SEGMENT);
    if (isset($s['image']) && is_string($s['image']) && strlen($s['image']) > MAX_LOGO_CHARS)
      fail('Image for "' . $s['label'] . '" is too large.', 413);
  }
  send_json(saveSegments($segments));
});

on('GET', '#^/api/admin/users$#', function () {
  $allUsers = listUsers();
  $spins = listSpins();
  $out = array_map(function ($u) use ($spins) {
    $userSpins = array_values(array_filter($spins, fn($s) => $s['userId'] === $u['id']));
    $u['spinCount'] = count($userSpins);
    $u['lastSpin'] = count($userSpins) ? $userSpins[count($userSpins) - 1] : null;
    return $u;
  }, $allUsers);
  send_json($out);
});

on('GET', '#^/api/admin/spins$#', fn() => send_json(listSpins()));
on('PATCH', '#^/api/admin/spins/([^/]+)$#', function ($m) {
  $spin = updateSpinStatus($m[1], body()['status'] ?? null);
  if (!$spin) fail('Play not found.', 404);
  send_json($spin);
});

/* ---------- Counter redemption: scan a coupon QR (or type the code) ---------- */
function parseClaimText($raw) {
  $text = trim((string)$raw);
  if ($text === '') return [];
  if (preg_match('/^(?:SPIN1|SPIN-REDEEM):([^:\s]+):(.+)$/i', $text, $m))
    return ['spinId' => $m[1], 'code' => trim($m[2])];
  if (preg_match('/(?:SPIN1|SPIN-REDEEM):([^:\s]+):([A-Za-z0-9-]+)/i', $text, $m))
    return ['spinId' => $m[1], 'code' => $m[2]];
  return ['code' => strtoupper(preg_replace('/\s+/', '', $text))];
}

function claimLookup() {
  $b = body();
  $raw = $b['text'] ?? $b['code'] ?? $_GET['text'] ?? $_GET['code'] ?? $_GET['q'] ?? '';
  $parsed = parseClaimText($raw);
  $spinId = $parsed['spinId'] ?? null;
  $code = $parsed['code'] ?? null;
  if (!$spinId && !$code) fail('Enter or scan a coupon code first.');

  if ($spinId) {
    $claim = findClaimById($spinId);
    if (!$claim) fail('Coupon not found. Check the code and try again.', 404);
    $want = strtoupper(preg_replace('/\s+/', '', (string)$code));
    $have = strtoupper(preg_replace('/\s+/', '', (string)($claim['code'] ?? '')));
    if ($code && $have !== $want)
      fail("This QR doesn't match its coupon code. Ask the customer to reopen their coupon.");
    send_json(['found' => true, 'coupon' => $claim]);
  }

  $matches = findClaimsByCode($code);
  if (!$matches) fail("No coupon found for code $code. Check the code and try again.", 404);
  if (count($matches) > 1) send_json(['found' => true, 'ambiguous' => true, 'matches' => $matches]);
  send_json(['found' => true, 'coupon' => $matches[0]]);
}

on('GET', '#^/api/admin/redeem/lookup$#', fn() => claimLookup());
on('POST', '#^/api/admin/redeem/lookup$#', fn() => claimLookup());
on('POST', '#^/api/admin/redeem/claim$#', function () {
  $spinId = trim((string)(body()['spinId'] ?? ''));
  if ($spinId === '') fail('Pick a coupon to approve first.');
  $result = claimSpin($spinId);
  $outcome = $result['outcome'];
  $claim = $result['claim'];
  if ($outcome === 'not-found') fail('Coupon not found.', 404);
  if ($outcome === 'already-redeemed') send_json(['error' => 'This coupon was already redeemed.', 'coupon' => $claim], 409);
  if ($outcome === 'expired') send_json(['error' => "This coupon has expired and can't be claimed.", 'coupon' => $claim], 409);
  send_json(['claimed' => true, 'coupon' => $claim]);
});

/* ---------- WhatsApp module ---------- */
on('GET', '#^/api/admin/whatsapp/status$#', function () {
  $settings = getSettings();
  $live = wa_isLiveConfigured($settings);
  send_json(['enabled' => $settings['waEnabled'], 'live' => $live, 'mode' => $live ? 'live' : 'simulation']);
});

on('GET', '#^/api/admin/whatsapp/optouts$#', fn() => send_json(listOptOuts()));
on('POST', '#^/api/admin/whatsapp/optouts$#', function () {
  $mobile = substr(preg_replace('/\D/', '', body()['mobile'] ?? ''), -10);
  if (strlen($mobile) !== 10) fail('Enter a valid 10-digit number.');
  addOptOut($mobile);
  send_json(['mobile' => $mobile], 201);
});
on('DELETE', '#^/api/admin/whatsapp/optouts/([^/]+)$#', function ($m) {
  removeOptOut(substr(preg_replace('/\D/', '', $m[1]), -10));
  send_json(['removed' => true]);
});

on('GET', '#^/api/admin/whatsapp/templates$#', fn() => send_json(listTemplates()));
on('POST', '#^/api/admin/whatsapp/templates$#', function () {
  $b = body();
  $tplName = trim((string)($b['name'] ?? ''));
  if ($tplName === '') fail('Template needs a name.');
  if (strlen($tplName) > 80) fail('Template name is too long (max 80 characters).');
  if (strlen((string)($b['body'] ?? '')) > MAX_MESSAGE_LEN)
    fail('Template is too long (max ' . MAX_MESSAGE_LEN . ' characters).');
  send_json(createTemplate($b['name'] ?? '', $b['body'] ?? ''), 201);
});
on('PUT', '#^/api/admin/whatsapp/templates/([^/]+)$#', function ($m) {
  $b = body();
  if (isset($b['body']) && is_string($b['body']) && strlen($b['body']) > MAX_MESSAGE_LEN)
    fail('Template is too long (max ' . MAX_MESSAGE_LEN . ' characters).');
  $t = updateTemplate($m[1], $b);
  if (!$t) fail('Template not found.', 404);
  send_json($t);
});
on('DELETE', '#^/api/admin/whatsapp/templates/([^/]+)$#', function ($m) {
  deleteTemplate($m[1]);
  send_json(['deleted' => true]);
});

on('GET', '#^/api/admin/whatsapp/recipients$#', function () {
  $segment = $_GET['segment'] ?? 'all';
  if (!in_array($segment, $GLOBALS['BROADCAST_SEGMENTS'], true)) fail('Unknown segment.');
  $recipients = getBroadcastRecipients($segment);
  send_json([
    'segment' => $segment,
    'count' => count($recipients),
    'recipients' => array_map(fn($r) => ['mobile' => $r['mobile'], 'name' => $r['name']], $recipients),
  ]);
});

on('POST', '#^/api/admin/whatsapp/broadcast$#', function () {
  $b = body();
  $segment = (string)($b['segment'] ?? '');
  $message = trim((string)($b['message'] ?? ''));
  if (!in_array($segment, $GLOBALS['BROADCAST_SEGMENTS'], true)) fail('Unknown segment.');
  if ($message === '') fail('Message cannot be empty.');
  if (strlen($message) > MAX_MESSAGE_LEN) fail('Message is too long (max ' . MAX_MESSAGE_LEN . ' characters).');

  $settings = getSettings();
  if (!$settings['waEnabled']) fail('WhatsApp delivery is disabled in settings.');

  $recipients = getBroadcastRecipients($segment);
  $tally = [];
  foreach ($recipients as $r) {
    $text = wa_renderTemplate($message, [
      'name' => $r['name'] ?: 'there',
      'business' => $settings['brandName'] ?: 'our store',
      'code' => $r['code'] ?: '',
      'prize' => '', 'days' => '',
    ]);
    $res = wa_sendText($settings, $r['mobile'], $text);
    $tally[$res['status']] = ($tally[$res['status']] ?? 0) + 1;
  }
  send_json([
    'segment' => $segment,
    'total' => count($recipients),
    'sent' => $tally['sent'] ?? 0,
    'simulated' => $tally['simulated'] ?? 0,
    'failed' => $tally['failed'] ?? 0,
    'skipped' => ($tally['disabled'] ?? 0) + ($tally['opted-out'] ?? 0),
  ]);
});

on('POST', '#^/api/admin/whatsapp/test$#', function () {
  $b = body();
  $mobile = substr(preg_replace('/\D/', '', $b['mobile'] ?? ''), -10);
  if (strlen($mobile) !== 10) fail('Enter a valid 10-digit number.');
  $settings = getSettings();
  send_json(wa_sendSpinReward([
    'settings' => $settings,
    'name' => normalizeName(is_string($b['name'] ?? null) ? $b['name'] : '') ?: 'there',
    'mobile' => $mobile,
    'prize' => 'Free Coffee',
    'code' => 'TEST-1234',
    'days' => 14,
  ]));
});

on('GET', '#^/api/admin/stats$#', fn() => send_json(stats()));

/* ---------- dispatch ---------- */
try {
  ensureSchema();
  $isAdmin = strpos($route, '/api/admin') === 0;
  $isAdminAuthPublic = (bool)preg_match('#^/api/admin/auth/(request|verify|resend|me)$#', $route);
  if ($isAdmin && !$isAdminAuthPublic) {
    if (!checkAdminToken(adminBearer())) fail('Admin session expired. Sign in again.', 401);
  }
  foreach ($ROUTES as [$m, $pattern, $cb]) {
    if ($m === $method && preg_match($pattern, $route, $mm)) {
      $cb($mm);
      exit; // handlers always send_json(); this is a safety net.
    }
  }
  fail('Not found.', 404);
} catch (Throwable $e) {
  error_log('[scratch-api] ' . $e->getMessage());
  fail(DEBUG ? ('Server error: ' . $e->getMessage()) : 'Server error. Please try again.', 500);
}
