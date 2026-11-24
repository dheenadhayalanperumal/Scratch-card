"use client";

import FireworksEngine from "@/components/FireworksEngine";

/**
 * Win-celebration fireworks: the full canvas simulation from the reference
 * demo (comet launches, spherical bursts, glitter sparks, trails) plus its
 * lift/burst/crackle sounds. Thin wrapper over the shared engine — see
 * FireworksEngine.jsx for the port and the shell catalogue. Rendered inside
 * Modal's celebration layer, which covers the whole device screen, so
 * shells launch from the real bottom edge and burst around the card.
 */
export default function FireworksCanvas() {
  return <FireworksEngine mode="celebration" withSound />;
}
