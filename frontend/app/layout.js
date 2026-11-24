import { Sora, Plus_Jakarta_Sans, Urbanist } from "next/font/google";
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

// Admin-only face (Luma-style admin). Exposed as a variable so the public page
// keeps Sora / Plus Jakarta and only the admin stylesheet opts in.
const admin = Urbanist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
    <html lang="en" className={`${display.variable} ${body.variable} ${admin.variable}`}>
      <body>{children}</body>
    </html>
  );
}
