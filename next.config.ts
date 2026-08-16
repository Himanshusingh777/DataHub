import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control",      value: "on" },
  { key: "Strict-Transport-Security",   value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options",             value: "DENY" },
  { key: "X-Content-Type-Options",      value: "nosniff" },
  { key: "Referrer-Policy",             value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",          value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // unsafe-eval needed for Next.js dev HMR; tighten in prod
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://avatars.githubusercontent.com https://images.unsplash.com",
      "font-src 'self'",
      "connect-src 'self' https://bigquery.googleapis.com https://oauth2.googleapis.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Fix workspace-root detection when multiple lockfiles exist
  outputFileTracingRoot: path.join(__dirname),

  compress: true,

  experimental: {
    // Rewrites deep imports (lucide-react, recharts, echarts, date-fns, ...)
    // to per-icon/per-module paths at build time instead of pulling each
    // package's full barrel file into every route that imports from it.
    optimizePackageImports: ["lucide-react", "recharts", "echarts", "framer-motion", "date-fns"],
    // App Router's client-side cache treats every dynamic route as instantly
    // stale by default, so re-visiting a page (e.g. via the sidebar) always
    // re-fetches its RSC payload from scratch. 30s keeps recently-visited
    // dashboard pages instant on back/forward and repeat nav without going
    // so long that real data changes go unnoticed.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  eslint: {
    // No eslint config existed in this repo until this refactor, so the
    // build was never actually gated on lint before — `next build` just
    // silently skipped it. `npm run lint` now works as a real, standalone
    // command; decoupling it from the build gate here preserves prior
    // behavior while the repo-wide lint debt (mostly in files slated for
    // deletion in the dead-code cleanup phase) gets paid down separately.
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  // turbopack replaces experimental.turbo in Next.js 15.3+
  turbopack: {},

  // The Python/FastAPI backend (backend/, uvicorn on :8000) still reads
  // from the old local SQLite file — it was never ported to Postgres (see
  // "Phase 3" in the Vercel migration plan). The Next.js app now writes
  // dashboards/widgets/models to Postgres, so anything proxied to Python
  // can no longer see that data ("Model not found" on every request).
  // Disabled these rewrites so requests fall through to the Next.js
  // route.ts implementations under src/app/api/{dashboards,widgets}/** and
  // src/app/api/models/[id]/generate-dashboard/** instead, which are
  // already fully working against Postgres. Re-enable once the Python
  // backend is ported (Phase 3) and verified against the same database.
  async rewrites() {
    return { beforeFiles: [] };
  },

  async headers() {
    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
