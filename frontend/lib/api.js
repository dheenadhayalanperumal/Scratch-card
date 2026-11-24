const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

// The default API address is localhost:4000, which only resolves on the dev
// machine itself. When the page is opened from another device on the network
// (e.g. http://172.16.60.91:3000 on a phone), "localhost" would mean the phone,
// so point at the host the page was loaded from instead. Relative or real
// production bases (e.g. "/spinapi") are left untouched.
function resolveBase() {
  const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
  if (typeof window === "undefined") return base;
  try {
    const url = new URL(base, window.location.href);
    if (LOCAL_HOSTS.includes(url.hostname) && !LOCAL_HOSTS.includes(window.location.hostname)) {
      url.hostname = window.location.hostname;
      return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
    }
  } catch {}
  return base;
}

const BASE = resolveBase();

const ADMIN_TOKEN_KEY = "scratch-admin-token";
export const getAdminToken = () => {
  try { return localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
};
export const setAdminToken = (token) => {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {}
};

async function request(path, options = {}) {
  const isAdminCall = path.startsWith("/api/admin");
  const token = isAdminCall ? getAdminToken() : null;
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A stale/expired admin token anywhere in the panel bounces the whole
    // layout back to the login screen (it listens for this event).
    if (res.status === 401 && isAdminCall && !path.includes("/auth/")) {
      setAdminToken(null);
      try { window.dispatchEvent(new Event("admin-unauthorized")); } catch {}
    }
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

export const api = {
  // public
  getConfig: () => request("/api/config"),
  me: (token) => request(`/api/me?token=${encodeURIComponent(token)}`),
  checkMobile: (mobile) => request(`/api/lead/check?mobile=${encodeURIComponent(mobile)}`),
  submitLead: (payload) => request("/api/lead", { method: "POST", body: JSON.stringify(payload) }),
  verify: (sessionId, code) => request("/api/verify", { method: "POST", body: JSON.stringify({ sessionId, code }) }),
  resend: (sessionId) => request("/api/resend", { method: "POST", body: JSON.stringify({ sessionId }) }),
  spin: (sessionId) => request("/api/spin", { method: "POST", body: JSON.stringify({ sessionId }) }),
  myCoupons: (token) => request(`/api/my-coupons?token=${encodeURIComponent(token)}`),
};

export const adminApi = {
  // OTP login (same method as customers)
  requestAdminOtp: (mobile) => request("/api/admin/auth/request", { method: "POST", body: JSON.stringify({ mobile }) }),
  verifyAdminOtp: (sessionId, code) => request("/api/admin/auth/verify", { method: "POST", body: JSON.stringify({ sessionId, code }) }),
  resendAdminOtp: (sessionId) => request("/api/admin/auth/resend", { method: "POST", body: JSON.stringify({ sessionId }) }),
  adminMe: () => request("/api/admin/auth/me"),
  logoutAdmin: () => request("/api/admin/auth/logout", { method: "POST" }),

  getSettings: () => request("/api/admin/settings"),
  saveSettings: (patch) => request("/api/admin/settings", { method: "PUT", body: JSON.stringify(patch) }),

  getCoupons: () => request("/api/admin/coupons"),
  createCoupon: (data) => request("/api/admin/coupons", { method: "POST", body: JSON.stringify(data) }),
  updateCoupon: (id, patch) => request(`/api/admin/coupons/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteCoupon: (id) => request(`/api/admin/coupons/${id}`, { method: "DELETE" }),

  getSegments: () => request("/api/admin/segments"),
  saveSegments: (segments) => request("/api/admin/segments", { method: "PUT", body: JSON.stringify({ segments }) }),

  getUsers: () => request("/api/admin/users"),
  getSpins: () => request("/api/admin/spins"),
  updateSpinStatus: (id, status) => request(`/api/admin/spins/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getStats: () => request("/api/admin/stats"),

  // Counter redemption (QR scan + manual code entry)
  lookupCoupon: (text) => request(`/api/admin/redeem/lookup?text=${encodeURIComponent(text)}`),
  claimCoupon: (spinId) => request("/api/admin/redeem/claim", { method: "POST", body: JSON.stringify({ spinId }) }),

  // WhatsApp module
  getWhatsAppStatus: () => request("/api/admin/whatsapp/status"),
  getOptOuts: () => request("/api/admin/whatsapp/optouts"),
  addOptOut: (mobile) => request("/api/admin/whatsapp/optouts", { method: "POST", body: JSON.stringify({ mobile }) }),
  removeOptOut: (mobile) => request(`/api/admin/whatsapp/optouts/${mobile}`, { method: "DELETE" }),
  sendWhatsAppTest: (mobile, name) => request("/api/admin/whatsapp/test", { method: "POST", body: JSON.stringify({ mobile, name }) }),
  getRecipients: (segment) => request(`/api/admin/whatsapp/recipients?segment=${encodeURIComponent(segment)}`),
  sendBroadcast: (segment, message) => request("/api/admin/whatsapp/broadcast", { method: "POST", body: JSON.stringify({ segment, message }) }),

  getTemplates: () => request("/api/admin/whatsapp/templates"),
  createTemplate: (data) => request("/api/admin/whatsapp/templates", { method: "POST", body: JSON.stringify(data) }),
  updateTemplate: (id, patch) => request(`/api/admin/whatsapp/templates/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteTemplate: (id) => request(`/api/admin/whatsapp/templates/${id}`, { method: "DELETE" }),
};
