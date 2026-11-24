import crypto from "node:crypto";

// In-memory session store. Swap for Redis / a database in production.
const sessions = new Map();

export function createSession({ name, mobile, marketingOptIn }) {
  const id = crypto.randomUUID();
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  const session = {
    id,
    name,
    mobile,
    marketingOptIn: Boolean(marketingOptIn),
    otp,
    verified: false,
    spun: false,
    reward: null,
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id) {
  return sessions.get(id);
}

export function rotateOtp(session) {
  session.otp = String(Math.floor(1000 + Math.random() * 9000));
  return session.otp;
}

/* ---------- Admin OTP auth ----------
   Same shape as the customer flow (4-digit code, in-memory session, resend
   rotates the code), plus two hardening rules the customer side doesn't
   need: codes expire after 10 minutes and die after 5 wrong guesses.
   A verified login exchanges the session for a bearer token (12h) that the
   admin API middleware checks on every /api/admin/* call. */
const ADMIN_OTP_TTL_MS = 10 * 60 * 1000;
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const adminOtpSessions = new Map();
const adminTokens = new Map();

export function createAdminOtpSession(mobile) {
  const session = {
    id: crypto.randomUUID(),
    mobile,
    otp: String(Math.floor(1000 + Math.random() * 9000)),
    attempts: 0,
    expiresAt: Date.now() + ADMIN_OTP_TTL_MS,
  };
  adminOtpSessions.set(session.id, session);
  return session;
}

export function getAdminOtpSession(id) {
  const s = adminOtpSessions.get(id);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    adminOtpSessions.delete(id);
    return null;
  }
  return s;
}

export function rotateAdminOtp(session) {
  session.otp = String(Math.floor(1000 + Math.random() * 9000));
  session.attempts = 0;
  session.expiresAt = Date.now() + ADMIN_OTP_TTL_MS;
  return session.otp;
}

export function dropAdminOtpSession(id) {
  adminOtpSessions.delete(id);
}

export function issueAdminToken(mobile) {
  const token = crypto.randomUUID();
  adminTokens.set(token, { mobile, expiresAt: Date.now() + ADMIN_TOKEN_TTL_MS });
  return token;
}

export function checkAdminToken(token) {
  if (!token) return null;
  const entry = adminTokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    adminTokens.delete(token);
    return null;
  }
  return entry;
}

export function revokeAdminToken(token) {
  adminTokens.delete(token);
}
