import { Sora, Plus_Jakarta_Sans, Bricolage_Grotesque, Public_Sans } from "next/font/google";
import "./globals.css";

const display = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

// Admin-only faces. Exposed as variables so the public page keeps
// Sora / Plus Jakarta and only the admin stylesheet opts in.
const adminDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-admin-display",
  display: "swap",
});

const admin = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-admin",
  display: "swap",
});

export const metadata = {
  // Placeholder only — app/page.js overwrites this with the admin's brand name once config loads.
  title: "Scratch & Win",
  description: "Scratch a card and win instant café rewards.",
};

export const viewport = {
  themeColor: "#07080c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${admin.variable} ${adminDisplay.variable}`}>
      <body>{children}</body>
    </html>
  );
}
