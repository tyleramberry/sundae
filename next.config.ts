import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // HTTPS only — Vercel serves over TLS, so tell browsers to
          // never fall back to plain HTTP (2-year max-age, include subs).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Block MIME-type sniffing (IE/Edge legacy XSS vector).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent the app from being iframed (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Only send the origin as referrer to cross-origin destinations.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Opt out of FLoC / Topics API.
          { key: "Permissions-Policy", value: "interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
