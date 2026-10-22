import type { Metadata, Viewport } from "next";
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

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-cream text-charcoal">{children}</body>
    </html>
  );
}
