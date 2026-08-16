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

  // Phase 1 of the Python/FastAPI backend migration: the dashboard-creation
  // feature (dashboards, widgets, AI Dashboard Generator) now lives in
  // backend/ (uvicorn on :8000). Proxying via `beforeFiles` rewrites keeps
  // the browser calling same-origin, so ct_session/ct_workspace cookies pass
  // through untouched — no CORS, no cross-site cookie config needed. Once
  // this is verified working end-to-end, the superseded route.ts files under
  // src/app/api/{dashboards,widgets}/** and
  // src/app/api/models/[id]/generate-dashboard/** should be deleted.
  async rewrites() {
    const pyApi = process.env.PY_API_URL ?? "http://localhost:8000";
    return {
      beforeFiles: [
        { source: "/api/models/:id/generate-dashboard", destination: `${pyApi}/api/v1/models/:id/generate-dashboard` },
        { source: "/api/models/:id/generate-dashboard/preview", destination: `${pyApi}/api/v1/models/:id/generate-dashboard/preview` },
        { source: "/api/dashboards", destination: `${pyApi}/api/v1/dashboards` },
        { source: "/api/dashboards/:id", destination: `${pyApi}/api/v1/dashboards/:id` },
        { source: "/api/dashboards/:id/share", destination: `${pyApi}/api/v1/dashboards/:id/share` },
        { source: "/api/widgets", destination: `${pyApi}/api/v1/widgets` },
        { source: "/api/widgets/:id", destination: `${pyApi}/api/v1/widgets/:id` },
        { source: "/api/widgets/:id/data", destination: `${pyApi}/api/v1/widgets/:id/data` },
      ],
    };
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
