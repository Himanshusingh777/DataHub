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

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  // turbopack replaces experimental.turbo in Next.js 15.3+
  turbopack: {},

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
