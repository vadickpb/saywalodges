import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
import { cn } from "cn";
import { SITE_URL } from "@/config/site";
import "@/app/globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const THEME_COOKIE = "dashboard-theme";

// Its own root layout (SD-105: no app/layout.tsx above it anymore — see
// Next.js's "multiple root layouts" pattern), reachable at app.<ROOT_DOMAIN>.
// Not localized yet (SD-106+), so a fixed English <html lang>.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2D4A3E",
};

// Scopes the dashboard's own design tokens (SD-107) to this subtree via the
// .dashboard class, leaving the public tenant site's :root tokens untouched.
// The theme is read from a cookie server-side (not client-side state), so
// there's no flash of the wrong theme on load.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isDark = cookieStore.get(THEME_COOKIE)?.value === "dark";

  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className={cn("dashboard min-h-screen", isDark && "dark")}>{children}</body>
    </html>
  );
}
