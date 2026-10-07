import type { NextConfig } from "next";
import { env } from "./lib/env";

// Scoped to this project's own Storage host instead of *.supabase.co, so an
// image URL from a different Supabase project can't be proxied through
// next/image. Derived from SUPABASE_URL (single source of truth) instead of
// hardcoding the project ref.
const supabaseHostname = new URL(env.SUPABASE_URL).hostname;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.18.12"],
  compress: true,

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31_536_000, // 1 year
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname,
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
