import { useMemo } from "react";
import QR from "qrcode";

/**
 * Coupon code as a QR, drawn as one SVG path (crisp at any size). Always
 * dark-on-white with a quiet zone — scanners need the contrast, so this
 * ignores the theme on purpose.
 */
export default function QrCode({ value, size = 168, label }) {
  const { n, d } = useMemo(() => {
    const { modules } = QR.create(value, { errorCorrectionLevel: "M" });
    let path = "";
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.data[y * modules.size + x]) path += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { n: modules.size, d: path };
  }, [value]);

  const pad = 2;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`}
      width={size}
      height={size}
      role="img"
      aria-label={label || `QR code for ${value}`}
      shapeRendering="crispEdges"
      style={{ display: "block", background: "#fff" }}
    >
      <path d={d} fill="#111" />
    </svg>
  );
}
