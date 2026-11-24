// Client-side mirror of the rules in backend/src/util.js. The server
// re-validates everything; these exist for instant feedback only, so the two
// implementations must stay byte-for-byte equivalent — change both together.

export const NAME_MAX_LEN = 30;
export const MOBILE_LEN = 10;

const NAME_INPUT_CAP = NAME_MAX_LEN * 10;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Strip control chars, collapse whitespace, and clamp to NAME_MAX_LEN code points. */
export const normalizeName = (n) => {
  const cleaned = String(n ?? "")
    .slice(0, NAME_INPUT_CAP)
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(cleaned).slice(0, NAME_MAX_LEN).join("").trim();
};

/** Returns an error message, or null when the name is acceptable. */
export function validateName(raw) {
  const name = normalizeName(raw);
  if (!name) return "Please enter your name.";
  if (!/\p{L}/u.test(name)) return "Name must contain at least one letter.";
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u.test(name))
    return "Name can only contain letters, spaces, apostrophes, hyphens and periods.";
  return null;
}

// Keep the *last* 10 digits, matching the server's normalizeMobile, so pasting
// a number with a country code ("+91 98765 43210") keeps the right digits.
export const normalizeMobile = (m) => String(m ?? "").replace(/\D/g, "").slice(-MOBILE_LEN);

/** Returns an error message, or null when the mobile number is acceptable. */
export function validateMobile(raw) {
  const mobile = normalizeMobile(raw);
  if (!mobile) return "Please enter your mobile number.";
  if (mobile.length !== MOBILE_LEN) return `Enter a valid ${MOBILE_LEN}-digit mobile number.`;
  return null;
}
