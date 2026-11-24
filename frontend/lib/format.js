// Display-only formatting helpers. These never change stored data.

/** How many characters of a customer name the admin tables show. */
export const NAME_DISPLAY_LEN = 25;

/**
 * Shorten `value` to `max` characters, ending with an ellipsis when clipped.
 * Counts code points, so an emoji costs one character and a surrogate pair is
 * never split into an unpaired half. The result is never longer than `max`.
 */
export function truncate(value, max = NAME_DISPLAY_LEN) {
  const s = String(value ?? "").trim();
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

/** The full value as a hover tooltip, but only when `truncate` actually clipped it. */
export const fullTitle = (value, max = NAME_DISPLAY_LEN) =>
  Array.from(String(value ?? "").trim()).length > max ? value : undefined;
