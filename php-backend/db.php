<?php
// MySQL data layer — PHP port of backend/src/db.js. Same SQL, same output shapes
// (camelCase) so the existing frontend consumes identical JSON.

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

function pdo() {
  static $pdo = null;
  if ($pdo === null) {
    $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      // Emulated prepares let a named placeholder be reused and avoid strict
      // type quirks on shared hosting.
      PDO::ATTR_EMULATE_PREPARES   => true,
    ]);
  }
  return $pdo;
}

// Run a query; returns all rows.
function q($sql, $params = []) {
  $stmt = pdo()->prepare($sql);
  $stmt->execute($params);
  return $stmt->fetchAll();
}
// Run a query; returns the first row or null.
function q1($sql, $params = []) {
  $rows = q($sql, $params);
  return $rows[0] ?? null;
}
// Run a write (INSERT/UPDATE/DELETE).
function qx($sql, $params = []) {
  $stmt = pdo()->prepare($sql);
  $stmt->execute($params);
  return $stmt->rowCount();
}

/* ---------- mappers (snake_case row -> camelCase api shape) ---------- */
function mapSettings($r) {
  $themeConfig = !empty($r['theme_config']) ? (json_decode($r['theme_config'], true) ?: []) : [];
  return [
    'brandName'       => $r['brand_name'],
    'themeColor'      => $r['theme_color'],
    'accentColor'     => $r['accent_color'],
    'logoText'        => $r['logo_text'],
    'logoImage'       => $r['logo_image'],
    'wheelSize'       => (int)$r['wheel_size'],
    'tagline'         => $r['tagline'],
    'maxSpinsPer'     => $r['max_spins_per'] ?: 'unlimited',
    'waEnabled'       => (bool)$r['wa_enabled'],
    'waPhoneNumberId' => $r['wa_phone_number_id'] ?: '',
    'waTemplateName'  => $r['wa_template_name'] ?: 'scratch_card_reward',
    'waTemplateBody'  => $r['wa_template_body'] ?: '',
    // Seasonal skin: the admin's manual pick, plus per-festival overrides
    // (colors / bg image / particle effect / auto-activate date window) —
    // see effectiveTheme()/validateThemeConfig() in helpers.php.
    'theme'           => $r['theme'] ?: 'default',
    'themeConfig'     => $themeConfig,
    // Dynamic festivals: synthesized from legacy theme/theme_config until
    // the list is saved for the first time (NULL column, not empty array).
    'festivals'       => normalizeFestivals($r['festivals'] ?? null, $r['theme'] ?: 'default', $themeConfig),
    'activeFestivalId'=> !empty($r['active_festival']) ? $r['active_festival'] : null,
  ];
}
function mapCoupon($r) {
  return [
    'id'           => $r['id'],
    'title'        => $r['title'],
    'product'      => $r['product'],
    'codePrefix'   => $r['code_prefix'],
    'validityDays' => (int)$r['validity_days'],
    'active'       => (bool)$r['active'],
    'codeType'     => $r['code_type'] ?: 'generated',
    'staticCode'   => $r['static_code'] ?: '',
  ];
}
function mapSegment($r) {
  return [
    'id'       => $r['id'],
    'label'    => $r['label'],
    'color'    => $r['color'],
    'image'    => $r['image'] ?? null,
    'weight'   => (int)$r['weight'],
    'couponId' => $r['coupon_id'],
  ];
}
function mapUser($r) {
  return [
    'id'             => $r['id'],
    'name'           => $r['name'],
    'mobile'         => $r['mobile'],
    'marketingOptIn' => (bool)$r['marketing_opt_in'],
    'createdAt'      => (int)$r['created_at'],
  ];
}
function mapSpin($r) {
  return [
    'id'           => $r['id'],
    'userId'       => $r['user_id'],
    'userName'     => $r['user_name'],
    'userMobile'   => $r['user_mobile'],
    'segmentId'    => $r['segment_id'],
    'segmentIndex' => (int)$r['segment_index'],
    'label'        => $r['label'],
    'couponId'     => $r['coupon_id'],
    'couponTitle'  => $r['coupon_title'],
    'product'      => $r['product'],
    'code'         => $r['code'],
    'isWin'        => (bool)$r['is_win'],
    'status'       => $r['status'],
    'waStatus'     => $r['wa_status'] ?: 'pending',
    'waSentAt'     => $r['wa_sent_at'] === null ? null : (int)$r['wa_sent_at'],
    'spunAt'       => (int)$r['spun_at'],
    'expiresAt'    => $r['expires_at'] === null ? null : (int)$r['expires_at'],
    'redeemedAt'   => !isset($r['redeemed_at']) || $r['redeemed_at'] === null ? null : (int)$r['redeemed_at'],
  ];
}
function mapTemplate($r) {
  return [
    'id'        => $r['id'],
    'name'      => $r['name'],
    'body'      => $r['body'],
    'createdAt' => (int)$r['created_at'],
  ];
}

/* ---------- Settings ---------- */
function getSettings() {
  return mapSettings(q1('SELECT * FROM settings WHERE id = 1'));
}
function updateSettings($patch) {
  $cols = [
    'brandName' => 'brand_name', 'themeColor' => 'theme_color', 'accentColor' => 'accent_color',
    'logoText' => 'logo_text', 'logoImage' => 'logo_image', 'wheelSize' => 'wheel_size',
    'tagline' => 'tagline', 'maxSpinsPer' => 'max_spins_per', 'waEnabled' => 'wa_enabled',
    'waPhoneNumberId' => 'wa_phone_number_id', 'waTemplateName' => 'wa_template_name',
    'waTemplateBody' => 'wa_template_body', 'theme' => 'theme',
  ];
  $sets = []; $params = [];
  foreach ($cols as $key => $col) {
    if (array_key_exists($key, $patch)) {
      $sets[] = "$col = :$key";
      $params[$key] = $key === 'waEnabled' ? ($patch[$key] ? 1 : 0) : $patch[$key];
    }
  }
  // themeConfig is an array client-side but stored as a JSON string.
  if (array_key_exists('themeConfig', $patch)) {
    $sets[] = 'theme_config = :themeConfig';
    $params['themeConfig'] = $patch['themeConfig'] ? json_encode($patch['themeConfig']) : null;
  }
  // Empty array [] must be stored as "[]", not NULL — NULL re-synthesizes
  // the legacy Diwali/Christmas/New Year list on the next read.
  if (array_key_exists('festivals', $patch)) {
    $sets[] = 'festivals = :festivals';
    $params['festivals'] = $patch['festivals'] === null
      ? null
      : json_encode($patch['festivals'], JSON_UNESCAPED_SLASHES);
  }
  if (array_key_exists('activeFestivalId', $patch)) {
    $sets[] = 'active_festival = :activeFestivalId';
    $params['activeFestivalId'] = $patch['activeFestivalId'] ?: null;
  }
  if ($sets) qx('UPDATE settings SET ' . implode(', ', $sets) . ' WHERE id = 1', $params);
  return getSettings();
}

/* ---------- Coupons ---------- */
function listCoupons() {
  return array_map('mapCoupon', q('SELECT * FROM coupons ORDER BY created_at ASC'));
}
function createCoupon($data) {
  $codeType = (($data['codeType'] ?? '') === 'static') ? 'static' : 'generated';
  $coupon = [
    'id'           => uid('c'),
    'title'        => $data['title'] ?? 'Untitled reward',
    'product'      => $data['product'] ?? '',
    'codePrefix'   => strtoupper($data['codePrefix'] ?? 'CCB'),
    'validityDays' => (int)($data['validityDays'] ?? 14) ?: 14,
    'active'       => (($data['active'] ?? true) !== false) ? 1 : 0,
    'codeType'     => $codeType,
    'staticCode'   => $codeType === 'static' ? trim((string)($data['staticCode'] ?? '')) : '',
    'createdAt'    => nowMs(),
  ];
  qx('INSERT INTO coupons (id, title, product, code_prefix, validity_days, active, code_type, static_code, created_at)
      VALUES (:id, :title, :product, :codePrefix, :validityDays, :active, :codeType, :staticCode, :createdAt)', $coupon);
  return mapCoupon([
    'id' => $coupon['id'], 'title' => $coupon['title'], 'product' => $coupon['product'],
    'code_prefix' => $coupon['codePrefix'], 'validity_days' => $coupon['validityDays'],
    'active' => $coupon['active'], 'code_type' => $coupon['codeType'], 'static_code' => $coupon['staticCode'],
  ]);
}
function updateCoupon($id, $patch) {
  $cols = [
    'title' => 'title', 'product' => 'product', 'codePrefix' => 'code_prefix',
    'validityDays' => 'validity_days', 'active' => 'active', 'codeType' => 'code_type',
    'staticCode' => 'static_code',
  ];
  $sets = []; $params = ['id' => $id];
  foreach ($cols as $key => $col) {
    if (array_key_exists($key, $patch)) {
      $sets[] = "$col = :$key";
      if ($key === 'codePrefix')       $params[$key] = strtoupper((string)$patch[$key]);
      elseif ($key === 'active')       $params[$key] = $patch[$key] ? 1 : 0;
      elseif ($key === 'codeType')     $params[$key] = $patch[$key] === 'static' ? 'static' : 'generated';
      elseif ($key === 'staticCode')   $params[$key] = trim((string)($patch[$key] ?? ''));
      else                             $params[$key] = $patch[$key];
    }
  }
  if ($sets) qx('UPDATE coupons SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
  $row = q1('SELECT * FROM coupons WHERE id = :id', ['id' => $id]);
  return $row ? mapCoupon($row) : null;
}
function deleteCoupon($id) {
  qx('DELETE FROM coupons WHERE id = :id', ['id' => $id]);
}

/* ---------- Segments ---------- */
function listSegments() {
  return array_map('mapSegment', q('SELECT * FROM segments ORDER BY position ASC'));
}
function saveSegments($segments) {
  qx('DELETE FROM segments');
  $pos = 0; $saved = [];
  foreach ($segments as $s) {
    $id = (!empty($s['id']) && strpos((string)$s['id'], 'new-') !== 0) ? $s['id'] : uid('s');
    $row = [
      'id' => $id,
      'label' => $s['label'] ?? ('Segment ' . ($pos + 1)),
      'color' => $s['color'] ?? '#888888',
      'image' => $s['image'] ?? null,
      'weight' => max(0, (int)($s['weight'] ?? 0)),
      'couponId' => $s['couponId'] ?? null,
      'pos' => $pos,
    ];
    qx('INSERT INTO segments (id, label, color, image, weight, coupon_id, position)
        VALUES (:id, :label, :color, :image, :weight, :couponId, :pos)', $row);
    $row['coupon_id'] = $row['couponId'];
    $saved[] = mapSegment($row);
    $pos++;
  }
  return $saved;
}

/* ---------- Users ---------- */
function getUserByMobile($mobile) {
  $row = q1('SELECT * FROM users WHERE mobile = :mobile LIMIT 1', ['mobile' => normalizeMobile($mobile)]);
  return $row ? mapUser($row) : null;
}
// Returning customers are recognised by mobile number: an existing row's name,
// id and token survive untouched — only marketing_opt_in is refreshed.
function upsertUser($name, $mobile, $marketingOptIn) {
  $user = [
    'id' => uid('u'),
    'name' => $name,
    'mobile' => normalizeMobile($mobile),
    'marketingOptIn' => $marketingOptIn ? 1 : 0,
    'createdAt' => nowMs(),
  ];
  qx('INSERT INTO users (id, name, mobile, marketing_opt_in, created_at)
      VALUES (:id, :name, :mobile, :marketingOptIn, :createdAt)
      ON DUPLICATE KEY UPDATE marketing_opt_in = :marketingOptIn', $user);
  $row = q1('SELECT * FROM users WHERE mobile = :mobile LIMIT 1', ['mobile' => $user['mobile']]);
  return mapUser($row);
}
function listUsers() {
  return array_map('mapUser', q('SELECT * FROM users ORDER BY created_at ASC'));
}
function setUserToken($userId, $token) {
  qx('UPDATE users SET token = :token WHERE id = :id', ['token' => $token, 'id' => $userId]);
}
function getUserByToken($token) {
  if (!$token) return null;
  $row = q1('SELECT * FROM users WHERE token = :token LIMIT 1', ['token' => $token]);
  return $row ? mapUser($row) : null;
}

/* ---------- WhatsApp templates ---------- */
function listTemplates() {
  return array_map('mapTemplate', q('SELECT * FROM wa_templates ORDER BY created_at ASC'));
}
function getTemplateByName($name) {
  $row = q1('SELECT * FROM wa_templates WHERE name = :name LIMIT 1', ['name' => $name]);
  return $row ? mapTemplate($row) : null;
}
function normalizeTemplateName($name) {
  $n = strtolower(trim((string)($name ?: 'untitled')));
  $n = preg_replace('/\s+/', '_', $n);
  return substr($n, 0, 80);
}
function createTemplate($name, $bodyText) {
  $row = [
    'id' => uid('wt'),
    'name' => normalizeTemplateName($name),
    'body' => (string)($bodyText ?? ''),
    'createdAt' => nowMs(),
  ];
  qx('INSERT INTO wa_templates (id, name, body, created_at) VALUES (:id, :name, :body, :createdAt)', $row);
  return mapTemplate(['id' => $row['id'], 'name' => $row['name'], 'body' => $row['body'], 'created_at' => $row['createdAt']]);
}
function updateTemplate($id, $patch) {
  $sets = []; $params = ['id' => $id];
  if (array_key_exists('name', $patch)) { $sets[] = 'name = :name'; $params['name'] = normalizeTemplateName($patch['name']); }
  if (array_key_exists('body', $patch)) { $sets[] = 'body = :body'; $params['body'] = (string)$patch['body']; }
  if ($sets) qx('UPDATE wa_templates SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
  $row = q1('SELECT * FROM wa_templates WHERE id = :id', ['id' => $id]);
  return $row ? mapTemplate($row) : null;
}
function deleteTemplate($id) {
  qx('DELETE FROM wa_templates WHERE id = :id', ['id' => $id]);
}

/* ---------- WhatsApp opt-outs & delivery ---------- */
function isOptedOut($mobile) {
  $rows = q('SELECT 1 FROM wa_opt_outs WHERE mobile = :mobile LIMIT 1', ['mobile' => normalizeMobile($mobile)]);
  return count($rows) > 0;
}
function addOptOut($mobile) {
  qx('INSERT INTO wa_opt_outs (mobile, created_at) VALUES (:mobile, :now)
      ON DUPLICATE KEY UPDATE created_at = created_at', ['mobile' => normalizeMobile($mobile), 'now' => nowMs()]);
}
function removeOptOut($mobile) {
  qx('DELETE FROM wa_opt_outs WHERE mobile = :mobile', ['mobile' => normalizeMobile($mobile)]);
}
function listOptOuts() {
  $rows = q('SELECT mobile, created_at FROM wa_opt_outs ORDER BY created_at DESC');
  return array_map(fn($r) => ['mobile' => $r['mobile'], 'createdAt' => (int)$r['created_at']], $rows);
}

// Resolve broadcast recipients for a segment (mirrors db.js.getBroadcastRecipients).
$GLOBALS['BROADCAST_SEGMENTS'] = ['all', 'redeemed', 'unused', 'non-redeemed'];
function getBroadcastRecipients($segment) {
  $users = listUsers();
  $spins = listSpins();
  $optOuts = listOptOuts();
  $blocked = [];
  foreach ($optOuts as $o) $blocked[$o['mobile']] = true;

  $byMobile = [];
  foreach ($users as $u) {
    if (!isset($byMobile[$u['mobile']])) $byMobile[$u['mobile']] = ['mobile' => $u['mobile'], 'name' => $u['name'], 'spins' => []];
    $byMobile[$u['mobile']]['name'] = $u['name'];
  }
  foreach ($spins as $s) {
    if (empty($s['userMobile'])) continue;
    if (!isset($byMobile[$s['userMobile']])) $byMobile[$s['userMobile']] = ['mobile' => $s['userMobile'], 'name' => $s['userName'], 'spins' => []];
    $byMobile[$s['userMobile']]['spins'][] = $s;
  }

  $recipients = [];
  foreach ($byMobile as $r) {
    if (isset($blocked[$r['mobile']])) continue;
    $wins = array_values(array_filter($r['spins'], fn($s) => $s['isWin']));
    $redeemed = array_values(array_filter($wins, fn($s) => $s['status'] === 'redeemed'));
    $unused = array_values(array_filter($wins, fn($s) => $s['status'] === 'active'));
    $last = fn($arr) => count($arr) ? $arr[count($arr) - 1] : null;

    $include = false; $code = null;
    if ($segment === 'all') {
      $include = true;
      $code = ($last($unused)['code'] ?? null) ?: ($last($wins)['code'] ?? null);
    } elseif ($segment === 'redeemed') {
      $include = count($redeemed) > 0;
      $code = $last($redeemed)['code'] ?? null;
    } elseif ($segment === 'unused') {
      $include = count($unused) > 0;
      $code = $last($unused)['code'] ?? null;
    } elseif ($segment === 'non-redeemed') {
      $include = count($redeemed) === 0;
      $code = $last($unused)['code'] ?? null;
    }
    if ($include) $recipients[] = ['mobile' => $r['mobile'], 'name' => $r['name'], 'code' => $code];
  }
  return $recipients;
}

function setSpinWhatsApp($id, $status, $sentAt = null) {
  qx('UPDATE spins SET wa_status = :status, wa_sent_at = :sentAt WHERE id = :id',
     ['id' => $id, 'status' => $status, 'sentAt' => $sentAt]);
}

/* ---------- Spins ---------- */
function pickSegment() {
  $segments = listSegments();
  if (count($segments) === 0) return null;
  $total = array_sum(array_map(fn($s) => (int)$s['weight'], $segments));
  if ($total <= 0) return $segments[random_int(0, count($segments) - 1)];
  $roll = (mt_rand() / mt_getrandmax()) * $total;
  foreach ($segments as $s) {
    $roll -= (int)$s['weight'];
    if ($roll <= 0) return $s;
  }
  return $segments[count($segments) - 1];
}
function randomCode($prefix) {
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  $s = '';
  for ($i = 0; $i < 4; $i++) $s .= $chars[random_int(0, strlen($chars) - 1)];
  return "$prefix-$s";
}
function recordSpin($user, $segment) {
  $coupon = null;
  if (!empty($segment['couponId'])) {
    $row = q1('SELECT * FROM coupons WHERE id = :id AND active = 1', ['id' => $segment['couponId']]);
    $coupon = $row ? mapCoupon($row) : null;
  }
  $isWin = (bool)$coupon;
  $now = nowMs();
  $segments = listSegments();
  $segIndex = -1;
  foreach ($segments as $i => $s) { if ($s['id'] === $segment['id']) { $segIndex = $i; break; } }

  $code = null;
  if ($isWin) {
    $code = ($coupon['codeType'] === 'static' && $coupon['staticCode'])
      ? $coupon['staticCode'] : randomCode($coupon['codePrefix']);
  }
  $spin = [
    'id' => uid('spin'),
    'userId' => $user['id'] ?? null,
    'userName' => $user['name'] ?? 'Guest',
    'userMobile' => $user['mobile'] ?? '',
    'segmentId' => $segment['id'],
    'segmentIndex' => $segIndex,
    'label' => $segment['label'],
    'couponId' => $coupon['id'] ?? null,
    'couponTitle' => $coupon['title'] ?? $segment['label'],
    'product' => $coupon['product'] ?? '',
    'code' => $code,
    'isWin' => $isWin ? 1 : 0,
    'status' => $isWin ? 'active' : 'no-win',
    'waStatus' => $isWin ? 'pending' : 'skipped',
    'waSentAt' => null,
    'spunAt' => $now,
    'expiresAt' => $isWin ? $now + $coupon['validityDays'] * 86400000 : null,
  ];
  qx('INSERT INTO spins
        (id, user_id, user_name, user_mobile, segment_id, segment_index, label,
         coupon_id, coupon_title, product, code, is_win, status, wa_status, wa_sent_at, spun_at, expires_at)
      VALUES
        (:id, :userId, :userName, :userMobile, :segmentId, :segmentIndex, :label,
         :couponId, :couponTitle, :product, :code, :isWin, :status, :waStatus, :waSentAt, :spunAt, :expiresAt)', $spin);
  return mapSpin([
    'id' => $spin['id'], 'user_id' => $spin['userId'], 'user_name' => $spin['userName'],
    'user_mobile' => $spin['userMobile'], 'segment_id' => $spin['segmentId'], 'segment_index' => $spin['segmentIndex'],
    'label' => $spin['label'], 'coupon_id' => $spin['couponId'], 'coupon_title' => $spin['couponTitle'],
    'product' => $spin['product'], 'code' => $spin['code'], 'is_win' => $spin['isWin'], 'status' => $spin['status'],
    'wa_status' => $spin['waStatus'], 'wa_sent_at' => $spin['waSentAt'], 'spun_at' => $spin['spunAt'],
    'expires_at' => $spin['expiresAt'],
  ]);
}
function listSpins() {
  return array_map('mapSpin', q('SELECT * FROM spins ORDER BY spun_at ASC'));
}
function countSpinsByMobileSince($mobile, $sinceMs) {
  $row = q1('SELECT COUNT(*) AS n FROM spins WHERE user_mobile = :mobile AND spun_at >= :since',
            ['mobile' => normalizeMobile($mobile), 'since' => $sinceMs]);
  return (int)$row['n'];
}
// A customer's winning coupons, newest first, for the "My coupons" wallet.
// An active coupon past its expiry is reported as "expired".
function listCouponsByMobile($mobile) {
  $rows = q('SELECT * FROM spins WHERE user_mobile = :mobile AND is_win = 1 ORDER BY spun_at DESC',
            ['mobile' => normalizeMobile($mobile)]);
  $now = (int)round(microtime(true) * 1000);
  return array_map(function ($r) use ($now) {
    $s = mapSpin($r);
    $expired = $s['status'] === 'expired'
      || ($s['status'] === 'active' && $s['expiresAt'] && $s['expiresAt'] < $now);
    return [
      'id'        => $s['id'],
      'title'     => $s['couponTitle'],
      'product'   => $s['product'],
      'code'      => $s['code'],
      // Client looks the prize image up from /api/config's segments.
      'segmentId' => $s['segmentId'],
      'status'    => $expired ? 'expired' : ($s['status'] === 'redeemed' ? 'redeemed' : 'active'),
      'spunAt'    => $s['spunAt'],
      'expiresAt' => $s['expiresAt'],
    ];
  }, $rows);
}
function updateSpinStatus($id, $status) {
  qx('UPDATE spins SET status = :status, redeemed_at = :redeemedAt WHERE id = :id',
     ['id' => $id, 'status' => $status, 'redeemedAt' => $status === 'redeemed' ? nowMs() : null]);
  $row = q1('SELECT * FROM spins WHERE id = :id', ['id' => $id]);
  return $row ? mapSpin($row) : null;
}

/* ---------- Counter redemption (QR scan / manual code) ---------- */
function effectiveClaimStatus($s, $now = null) {
  $now = $now ?? nowMs();
  return ($s['status'] === 'active' && $s['expiresAt'] && $s['expiresAt'] < $now) ? 'expired' : $s['status'];
}
function mapClaim($r, $now = null) {
  $s = mapSpin($r);
  return [
    'id' => $s['id'],
    'code' => $s['code'],
    'title' => $s['couponTitle'],
    'product' => $s['product'],
    'status' => effectiveClaimStatus($s, $now),
    'userName' => $s['userName'],
    'userMobile' => $s['userMobile'],
    'spunAt' => $s['spunAt'],
    'expiresAt' => $s['expiresAt'],
    'redeemedAt' => $s['redeemedAt'],
  ];
}
function findClaimById($id) {
  $row = q1('SELECT * FROM spins WHERE id = :id AND is_win = 1 LIMIT 1', ['id' => $id]);
  return $row ? mapClaim($row) : null;
}
function findClaimsByCode($code) {
  $rows = q(
    "SELECT * FROM spins WHERE is_win = 1 AND UPPER(REPLACE(code, ' ', '')) = :code ORDER BY spun_at DESC",
    ['code' => strtoupper(preg_replace('/\s+/', '', (string)$code))]
  );
  return array_map('mapClaim', $rows);
}
function claimSpin($id) {
  $claim = findClaimById($id);
  if (!$claim) return ['outcome' => 'not-found', 'claim' => null];
  if ($claim['status'] === 'redeemed') return ['outcome' => 'already-redeemed', 'claim' => $claim];
  if ($claim['status'] === 'expired') {
    qx("UPDATE spins SET status = 'expired' WHERE id = :id AND status = 'active'", ['id' => $id]);
    return ['outcome' => 'expired', 'claim' => $claim];
  }
  $now = nowMs();
  $n = qx(
    "UPDATE spins SET status = 'redeemed', redeemed_at = :now
     WHERE id = :id AND status = 'active' AND (expires_at IS NULL OR expires_at > :now)",
    ['id' => $id, 'now' => $now]
  );
  if (!$n) {
    $again = findClaimById($id);
    return ['outcome' => (($again['status'] ?? null) === 'redeemed') ? 'already-redeemed' : 'expired', 'claim' => $again];
  }
  $claim['status'] = 'redeemed';
  $claim['redeemedAt'] = $now;
  return ['outcome' => 'claimed', 'claim' => $claim];
}

/**
 * Idempotent migrations so a cPanel DB created from an older schema.sql
 * still grows the columns this build needs (festivals, redeemed_at, …).
 */
function ensureSchema() {
  static $done = false;
  if ($done) return;
  $done = true;

  $hasCol = function ($table, $column) {
    $row = q1(
      'SELECT 1 AS ok FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c LIMIT 1',
      ['t' => $table, 'c' => $column]
    );
    return (bool)$row;
  };
  $addCol = function ($table, $column, $definition) use ($hasCol) {
    if (!$hasCol($table, $column))
      qx("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
  };
  $widenLongtext = function ($table, $column) {
    $row = q1(
      'SELECT DATA_TYPE AS dt FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c LIMIT 1',
      ['t' => $table, 'c' => $column]
    );
    $dt = strtolower((string)($row['dt'] ?? $row['DT'] ?? ''));
    if ($dt && $dt !== 'longtext')
      qx("ALTER TABLE `$table` MODIFY COLUMN `$column` LONGTEXT");
  };

  $addCol('settings', 'theme', "VARCHAR(20) NOT NULL DEFAULT 'default'");
  $addCol('settings', 'theme_config', 'LONGTEXT');
  $addCol('settings', 'festivals', 'LONGTEXT');
  $addCol('settings', 'active_festival', 'VARCHAR(40)');
  $addCol('spins', 'redeemed_at', 'BIGINT');
  $widenLongtext('settings', 'festivals');
  $widenLongtext('settings', 'theme_config');

  qx("CREATE TABLE IF NOT EXISTS admin_sessions (
        id         VARCHAR(64) PRIMARY KEY,
        mobile     VARCHAR(20) NOT NULL,
        otp        VARCHAR(8),
        token      VARCHAR(64),
        attempts   INT NOT NULL DEFAULT 0,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        INDEX idx_admin_token (token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function stats() {
  $row = q1('SELECT
      (SELECT COUNT(*) FROM users)  AS users,
      (SELECT COUNT(*) FROM spins)  AS spins,
      (SELECT COUNT(*) FROM spins WHERE is_win = 1) AS wins,
      (SELECT COUNT(*) FROM spins WHERE status = "redeemed") AS redeemed,
      (SELECT COUNT(*) FROM coupons) AS coupons');
  return [
    'users' => (int)$row['users'], 'spins' => (int)$row['spins'], 'wins' => (int)$row['wins'],
    'redeemed' => (int)$row['redeemed'], 'coupons' => (int)$row['coupons'],
  ];
}
