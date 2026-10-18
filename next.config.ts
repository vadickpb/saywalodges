import type { NextConfig } from "next";
import { env } from "./lib/env";

// Scoped to this project's own Storage host instead of *.supabase.co, so an
// image URL from a different Supabase project can't be proxied through
// next/image. Derived from SUPABASE_URL (single source of truth) instead of
// hardcoding the project ref. Protocol is derived too, not hardcoded to
// "https": local Supabase serves over plain http (127.0.0.1:54321).
const supabaseUrl = new URL(env.SUPABASE_URL);
const supabaseProtocol = supabaseUrl.protocol.replace(":", "") as "http" | "https";
// Only ever true against local Supabase (127.0.0.1/localhost) — a real
// project's SUPABASE_URL is always a public *.supabase.co host, so this
// can't accidentally relax anything in production.
const isLocalSupabase = supabaseUrl.hostname === "127.0.0.1" || supabaseUrl.hostname === "localhost";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.18.12"],
  compress: true,

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31_536_000, // 1 year
    // Next.js blocks optimizing images from private IPs by default (SSRF
    // protection) — local Supabase runs on 127.0.0.1, so dev needs this
    // opt-in. Scoped by isLocalSupabase above, not NODE_ENV, since that's
    // what actually determines whether the target is a private IP.
    dangerouslyAllowLocalIP: isLocalSupabase,
    remotePatterns: [
      {
        protocol: supabaseProtocol,
        hostname: supabaseUrl.hostname,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  async headers() {
    return [
      // Security headers on every response. Only here now — vercel.json's
      // copy was removed (SD-003) to avoid two sources of truth.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
