<?php
// Small shared helpers, mirroring backend/src/util.js.

// Normalize any phone input to the bare last-10-digit local number.
function normalizeMobile($m) {
  $digits = preg_replace('/\D/', '', (string)$m);
  return substr($digits, -10);
}

// Customer names are shown in the admin tables and interpolated into WhatsApp
// templates, so keep them short and free of control characters.
const NAME_MAX_LEN = 30;
// Cap the raw input before any regex runs, so a huge body can't make us do
// huge regex passes. Generous enough that no real name is affected.
const NAME_INPUT_CAP = NAME_MAX_LEN * 10;

/**
 * Take the first $len characters of a UTF-8 string. Uses mbstring when the
 * host has it and falls back to PCRE otherwise — the rest of this backend has
 * no mbstring dependency and a missing extension would fatal every request.
 */
function u_substr($s, $len) {
  if (function_exists('mb_substr')) return mb_substr($s, 0, $len, 'UTF-8');
  $chars = preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY);
  if ($chars === false) return '';       // invalid UTF-8
  return implode('', array_slice($chars, 0, $len));
}

/**
 * Strip control chars, collapse whitespace, and clamp to NAME_MAX_LEN.
 * Clamping counts characters (not bytes) so multi-byte names such as "राहुल"
 * are measured the way a person would count them.
 *
 * Mirrors normalizeName() in backend/src/util.js and frontend/lib/validation.js
 * — change all three together.
 */
function normalizeName($n) {
  $s = u_substr((string)$n, NAME_INPUT_CAP);
  $s = preg_replace('/[\x{0000}-\x{001f}\x{007f}-\x{009f}]/u', ' ', $s);
  // preg_* return null on invalid UTF-8; treat that as an unusable name rather
  // than letting null propagate into the database.
  if ($s === null) return '';
  $s = preg_replace('/\s+/u', ' ', $s);
  if ($s === null) return '';
  // trim() again because the clamp may leave a trailing space.
  return trim(u_substr(trim($s), NAME_MAX_LEN));
}

/**
 * Validate an already-normalized name.
 * Returns an error message, or null when the name is acceptable.
 */
function validateName($name) {
  if ($name === '') return 'Please enter your name.';
  // No minimum beyond one letter — single-character given names are legitimate.
  if (!preg_match('/\p{L}/u', $name)) return 'Name must contain at least one letter.';
  if (!preg_match('/^[\p{L}\p{M}][\p{L}\p{M}\s.\'-]*$/u', $name))
    return 'Name can only contain letters, spaces, apostrophes, hyphens and periods.';
  return null;
}

/* ---------- Seasonal theme ---------- */
const FESTIVAL_THEME_IDS = ['diwali', 'christmas', 'newyear'];
const THEME_IDS = ['default', 'diwali', 'christmas', 'newyear'];
const PARTICLE_IDS = ['none', 'snow', 'confetti', 'diyas', 'fireworks'];
const MAX_FESTIVALS = 24;
const FESTIVAL_PRESETS = [
  'diwali' => [
    'name' => 'Diwali', 'themeColor' => '#b3261e', 'accentColor' => '#f5b544',
    'bgFrom' => '#6b2410', 'bgTo' => '#180602', 'particles' => 'fireworks',
  ],
  'christmas' => [
    'name' => 'Christmas', 'themeColor' => '#1a6b43', 'accentColor' => '#e63946',
    'bgFrom' => '#0d3f2e', 'bgTo' => '#04140e', 'particles' => 'snow',
  ],
  'newyear' => [
    'name' => 'New Year', 'themeColor' => '#2a1f49', 'accentColor' => '#d4af37',
    'bgFrom' => '#2a1f49', 'bgTo' => '#0a0814', 'particles' => 'confetti',
  ],
];
const DATE_RE = '/^\d{4}-\d{2}-\d{2}$/';
const HEX_COLOR_RE = '/^#[0-9a-fA-F]{6}$/';
// Same cap as the brand logo upload (frontend enforces 1.5MB raw file size,
// which lands here as a slightly larger base64 string).
const MAX_THEME_BG_CHARS = 1500000;

/**
 * Resolves which theme is actually live right now: a scheduled festival
 * window beats the admin's manual pick while it's active, so nobody has to
 * remember to flip the skin back after the festival ends.
 * $themeConfig is [themeId => ['start' => 'YYYY-MM-DD', 'end' => 'YYYY-MM-DD', ...]].
 * Mirrors effectiveTheme() in backend/src/util.js and frontend/lib/theme.js.
 */
function effectiveTheme($theme, $themeConfig) {
  $today = date('Y-m-d');
  foreach (FESTIVAL_THEME_IDS as $id) {
    $w = $themeConfig[$id] ?? null;
    if (!empty($w['start']) && !empty($w['end']) && $today >= $w['start'] && $today <= $w['end']) return $id;
  }
  return in_array($theme, THEME_IDS, true) ? $theme : 'default';
}

// Returns an error message, or null when the theme configuration is well-formed.
function validateThemeConfig($themeConfig) {
  if ($themeConfig === null) return null;
  if (!is_array($themeConfig)) return 'Invalid theme configuration.';
  foreach ($themeConfig as $id => $cfg) {
    if (!in_array($id, FESTIVAL_THEME_IDS, true)) return "Unknown theme \"$id\" in configuration.";
    if ($cfg === null) continue;
    if (!is_array($cfg)) return "Invalid configuration for \"$id\".";
    $start = $cfg['start'] ?? null;
    $end = $cfg['end'] ?? null;
    if ($start || $end) {
      if (!preg_match(DATE_RE, (string)$start) || !preg_match(DATE_RE, (string)$end))
        return "\"$id\" dates must be in YYYY-MM-DD format.";
      if ($start > $end) return "\"$id\"'s start date must be before its end date.";
    }
    if (isset($cfg['themeColor']) && !preg_match(HEX_COLOR_RE, (string)$cfg['themeColor']))
      return "\"$id\" theme color must be a hex color like #aabbcc.";
    if (isset($cfg['accentColor']) && !preg_match(HEX_COLOR_RE, (string)$cfg['accentColor']))
      return "\"$id\" accent color must be a hex color like #aabbcc.";
    if (isset($cfg['particles']) && !in_array($cfg['particles'], PARTICLE_IDS, true))
      return "\"$id\" particle effect must be one of: " . implode(', ', PARTICLE_IDS) . '.';
    if (isset($cfg['bgImage']) && (!is_string($cfg['bgImage']) || strlen($cfg['bgImage']) > MAX_THEME_BG_CHARS))
      return "\"$id\" background image is too large.";
  }
  return null;
}

/**
 * Dynamic festivals list. When the column has never been written (NULL),
 * synthesize entries from the legacy theme/theme_config shape so older
 * shops keep their skins. An explicit empty array means the admin saved
 * an empty list and is law — do not re-synthesize.
 */
function normalizeFestivals($raw, $theme, $themeConfig) {
  if ($raw !== null && $raw !== '') {
    if (is_array($raw)) return $raw;
    if (is_string($raw)) {
      $parsed = json_decode($raw, true);
      if (is_array($parsed)) return $parsed;
    }
    return [];
  }
  $out = [];
  foreach (FESTIVAL_THEME_IDS as $id) {
    $preset = FESTIVAL_PRESETS[$id];
    $cfg = is_array($themeConfig) ? ($themeConfig[$id] ?? []) : [];
    $out[] = [
      'id' => $id,
      'name' => $preset['name'],
      'start' => $cfg['start'] ?? '',
      'end' => $cfg['end'] ?? '',
      'themeColor' => $cfg['themeColor'] ?? $preset['themeColor'],
      'accentColor' => $cfg['accentColor'] ?? $preset['accentColor'],
      'bgFrom' => $preset['bgFrom'],
      'bgTo' => $preset['bgTo'],
      'bgImage' => $cfg['bgImage'] ?? null,
      'particles' => $cfg['particles'] ?? $preset['particles'],
      'enabled' => true,
    ];
  }
  return $out;
}

/**
 * Which festival is live right now. A festival inside its date window wins
 * (latest start if windows overlap); otherwise the admin's manual pick.
 * Returns the festival plus `via`: "schedule" | "manual", or null.
 */
function liveFestival($settings) {
  $list = array_values(array_filter($settings['festivals'] ?? [], function ($f) {
    return is_array($f) && (($f['enabled'] ?? true) !== false);
  }));
  $today = date('Y-m-d');
  $scheduled = array_values(array_filter($list, function ($f) use ($today) {
    return !empty($f['start']) && !empty($f['end']) && $today >= $f['start'] && $today <= $f['end'];
  }));
  usort($scheduled, fn($a, $b) => strcmp((string)($b['start'] ?? ''), (string)($a['start'] ?? '')));
  if ($scheduled) return $scheduled[0] + ['via' => 'schedule'];
  $manualId = $settings['activeFestivalId'] ?? $settings['theme'] ?? null;
  foreach ($list as $f) {
    if (($f['id'] ?? null) === $manualId) return $f + ['via' => 'manual'];
  }
  return null;
}

/** Returns an error message, or null when the festivals list is well-formed. */
function validateFestivals($festivals) {
  if ($festivals === null) return null;
  if (!is_array($festivals) || !array_is_list($festivals))
    return 'Festivals must be a list.';
  if (count($festivals) > MAX_FESTIVALS)
    return 'You can keep at most ' . MAX_FESTIVALS . ' festivals. Delete one first.';
  $seen = [];
  foreach ($festivals as $f) {
    if (!is_array($f)) return 'Invalid festival entry.';
    $id = $f['id'] ?? null;
    if (!is_string($id) || $id === '') return 'Every festival needs an id.';
    if (isset($seen[$id])) return 'Two festivals share the same id — reload and try again.';
    $seen[$id] = true;
    $name = trim((string)($f['name'] ?? ''));
    if ($name === '') return 'Every festival needs a name.';
    if (strlen($name) > 60)
      return 'Festival name "' . substr($name, 0, 20) . '…" is too long (60 characters max).';
    $start = $f['start'] ?? '';
    $end = $f['end'] ?? '';
    if (($start && !preg_match(DATE_RE, (string)$start)) || ($end && !preg_match(DATE_RE, (string)$end)))
      return "\"$name\" dates must be in YYYY-MM-DD format.";
    if ($start && $end && $start > $end) return "\"$name\"'s start date must be before its end date.";
    foreach (['themeColor', 'accentColor', 'bgFrom', 'bgTo'] as $key) {
      $v = $f[$key] ?? null;
      if ($v !== null && $v !== '' && !preg_match(HEX_COLOR_RE, (string)$v))
        return "\"$name\" $key must be a hex color like #aabbcc.";
    }
    $particles = $f['particles'] ?? null;
    if ($particles !== null && $particles !== '' && !in_array($particles, PARTICLE_IDS, true))
      return "\"$name\" particle effect must be one of: " . implode(', ', PARTICLE_IDS) . '.';
    if (array_key_exists('bgImage', $f) && $f['bgImage'] !== null
        && (!is_string($f['bgImage']) || strlen($f['bgImage']) > MAX_THEME_BG_CHARS))
      return "\"$name\" background image is too large.";
  }
  return null;
}

// Short unique id, e.g. "c-1a2b3c4d" — mirrors uid() in db.js.
function uid($p = 'id') {
  return $p . '-' . substr(bin2hex(random_bytes(8)), 0, 8);
}

// RFC-4122-ish random UUID for session ids / login tokens.
function uuidv4() {
  $data = random_bytes(16);
  $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
  $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

// Current time in milliseconds (the codebase stores epoch-ms everywhere).
function nowMs() {
  return (int) round(microtime(true) * 1000);
}

// "24 Jun" — matches fmtDate() (en-GB day+month) used for validUntil.
function fmtDate($ms) {
  if (!$ms) return null;
  return date('j M', (int)($ms / 1000));
}

/* ---------- JSON response helpers ---------- */
function send_json($data, $status = 200) {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_SLASHES);
  exit;
}
function fail($message, $status = 400) {
  send_json(['error' => $message], $status);
}

// Parsed JSON request body (cached).
function body() {
  static $cached = null;
  if ($cached === null) {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw, true);
    $cached = is_array($decoded) ? $decoded : [];
  }
  return $cached;
}
