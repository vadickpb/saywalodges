import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist } from "next/font/google";
import { SITE_URL } from "@/config/site";
import "@/app/globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

// Its own root layout (route group, no app/layout.tsx above it) — groups
// platform pages (landing placeholder and auth): one login shared by all
// tenants. Not
// localized yet (SD-106+), so a fixed English <html lang>.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2D4A3E",
};

// Nonce-based CSP (SD-701) only reaches pages rendered per request: without this, /, /login,
// /forgot-password and /update-password would be prerendered at build time with no nonce and their
// scripts blocked by 'strict-dynamic'.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-cream text-charcoal">{children}</body>
    </html>
  );
}
