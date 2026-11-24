<?php
// Persistent session/OTP store (DB-backed) — replaces the in-memory
// backend/src/store.js so the OTP flow survives across stateless requests.

require_once __DIR__ . '/db.php';

function createSession($name, $mobile, $marketingOptIn, $userId = null) {
  $s = [
    'id' => uuidv4(),
    'name' => $name,
    'mobile' => normalizeMobile($mobile),
    'opt' => $marketingOptIn ? 1 : 0,
    'otp' => strval(random_int(1000, 9999)),
    'uid' => $userId,
    'now' => nowMs(),
  ];
  qx('INSERT INTO sessions (id, name, mobile, marketing_opt_in, otp, verified, user_id, reward, token, created_at)
      VALUES (:id, :name, :mobile, :opt, :otp, 0, :uid, NULL, NULL, :now)', $s);
  return [
    'id' => $s['id'], 'name' => $s['name'], 'mobile' => $s['mobile'],
    'marketingOptIn' => (bool)$s['opt'], 'otp' => $s['otp'], 'verified' => false,
    'userId' => $userId, 'reward' => null, 'token' => null,
  ];
}

function getSession($id) {
  if (!$id) return null;
  $r = q1('SELECT * FROM sessions WHERE id = :id LIMIT 1', ['id' => $id]);
  if (!$r) return null;
  return [
    'id' => $r['id'], 'name' => $r['name'], 'mobile' => $r['mobile'],
    'marketingOptIn' => (bool)$r['marketing_opt_in'], 'otp' => $r['otp'],
    'verified' => (bool)$r['verified'], 'userId' => $r['user_id'],
    'reward' => $r['reward'] ? json_decode($r['reward'], true) : null,
    'token' => $r['token'],
  ];
}

function rotateOtp($sessionId) {
  $otp = strval(random_int(1000, 9999));
  qx('UPDATE sessions SET otp = :otp WHERE id = :id', ['otp' => $otp, 'id' => $sessionId]);
  return $otp;
}

function markVerified($sessionId, $token) {
  qx('UPDATE sessions SET verified = 1, token = :token WHERE id = :id',
     ['token' => $token, 'id' => $sessionId]);
}

function saveReward($sessionId, $reward) {
  qx('UPDATE sessions SET reward = :reward WHERE id = :id',
     ['reward' => json_encode($reward, JSON_UNESCAPED_SLASHES), 'id' => $sessionId]);
}

/* ---------- Admin OTP auth ----------
   Same 4-digit flow as customers, stored in admin_sessions so it survives
   across PHP requests. Codes expire after 10 minutes and die after 5 wrong
   guesses. A verified login exchanges the OTP row for a 12h bearer token. */
const ADMIN_OTP_TTL_MS = 10 * 60 * 1000;
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function createAdminOtpSession($mobile) {
  $s = [
    'id' => uuidv4(),
    'mobile' => normalizeMobile($mobile),
    'otp' => strval(random_int(1000, 9999)),
    'attempts' => 0,
    'expiresAt' => nowMs() + ADMIN_OTP_TTL_MS,
    'createdAt' => nowMs(),
  ];
  qx('INSERT INTO admin_sessions (id, mobile, otp, token, attempts, expires_at, created_at)
      VALUES (:id, :mobile, :otp, NULL, :attempts, :expiresAt, :createdAt)', $s);
  return $s;
}

function getAdminOtpSession($id) {
  if (!$id) return null;
  $r = q1('SELECT * FROM admin_sessions WHERE id = :id AND token IS NULL LIMIT 1', ['id' => $id]);
  if (!$r) return null;
  if (nowMs() > (int)$r['expires_at']) {
    qx('DELETE FROM admin_sessions WHERE id = :id', ['id' => $id]);
    return null;
  }
  return [
    'id' => $r['id'],
    'mobile' => $r['mobile'],
    'otp' => $r['otp'],
    'attempts' => (int)$r['attempts'],
    'expiresAt' => (int)$r['expires_at'],
  ];
}

function bumpAdminAttempts($id) {
  qx('UPDATE admin_sessions SET attempts = attempts + 1 WHERE id = :id', ['id' => $id]);
}

function rotateAdminOtp($id) {
  $otp = strval(random_int(1000, 9999));
  qx('UPDATE admin_sessions SET otp = :otp, attempts = 0, expires_at = :exp WHERE id = :id',
     ['otp' => $otp, 'exp' => nowMs() + ADMIN_OTP_TTL_MS, 'id' => $id]);
  return $otp;
}

function dropAdminOtpSession($id) {
  qx('DELETE FROM admin_sessions WHERE id = :id', ['id' => $id]);
}

function issueAdminToken($mobile) {
  $token = uuidv4();
  qx('INSERT INTO admin_sessions (id, mobile, otp, token, attempts, expires_at, created_at)
      VALUES (:id, :mobile, NULL, :token, 0, :exp, :now)',
     ['id' => uuidv4(), 'mobile' => normalizeMobile($mobile), 'token' => $token,
      'exp' => nowMs() + ADMIN_TOKEN_TTL_MS, 'now' => nowMs()]);
  return $token;
}

function checkAdminToken($token) {
  if (!$token) return null;
  $r = q1('SELECT * FROM admin_sessions WHERE token = :token LIMIT 1', ['token' => $token]);
  if (!$r) return null;
  if (nowMs() > (int)$r['expires_at']) {
    qx('DELETE FROM admin_sessions WHERE token = :token', ['token' => $token]);
    return null;
  }
  return ['mobile' => $r['mobile']];
}

function revokeAdminToken($token) {
  if (!$token) return;
  qx('DELETE FROM admin_sessions WHERE token = :token', ['token' => $token]);
}
