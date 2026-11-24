// Shared WhatsApp message helpers for the admin (Templates + Promotions),
// mirroring the backend token substitution so previews match what is sent.

export const TOKENS = ["[Name]", "[Business Name]", "[Prize]", "[CODE]", "[Days]"];

// Audience segments for promotions. Ids must match the backend BROADCAST_SEGMENTS.
export const SEGMENTS = [
  { id: "all", label: "All customers", desc: "Everyone who has registered (minus opt-outs)." },
  { id: "redeemed", label: "Redeemed", desc: "Customers who have used at least one coupon." },
  { id: "unused", label: "Unused coupon", desc: "Hold a live coupon they haven't redeemed yet." },
  { id: "non-redeemed", label: "Non-redeemed", desc: "Have never redeemed any coupon." },
];

// Sample values used to render the live preview.
const sampleVars = (brandName) => ({
  "[Name]": "Ravi",
  "[Business Name]": brandName || "our store",
  "[Prize]": "Free Coffee",
  "[CODE]": "CCB-7K2M",
  "[Days]": "14",
});

export function renderPreview(body, brandName) {
  let text = body || "";
  for (const [token, value] of Object.entries(sampleVars(brandName))) {
    text = text.replaceAll(token, value);
  }
  return text;
}
