import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_STORAGE_NEXT_PUBLIC_SUPABASE_URL_SUPABASE_URL;
    return new URL(supabaseUrl ?? "").hostname;
  } catch {
    return undefined;
  }
})();

/**
 * Baseline security headers, applied to every response. A full nonce-based
 * Content-Security-Policy is deliberately out of scope here — these are the
 * safe, framework-agnostic headers plus the CSP directives (frame-ancestors,
 * base-uri, object-src) that never break an app.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    typedEnv: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: supabaseHost
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ],
      }
    : undefined,
};

export default nextConfig;
