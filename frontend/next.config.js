/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  // Static HTML/CSS/JS export (`next build` -> ./out) so the site can be hosted
  // on plain Apache/cPanel with no Node.js. All pages are client components that
  // call the PHP API in the browser, so nothing needs a server at runtime.
  output: "export",
  // Emit /admin/index.html etc. so Apache serves /admin/ without rewrites.
  trailingSlash: true,
  // next/image optimization needs a server; disable it for the static export.
  images: { unoptimized: true },
  // Keep `next build` from overwriting the running `next dev` cache in `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000",
  },
};

module.exports = nextConfig;
