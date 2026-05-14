import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import { SITE_URL } from "@/config/site";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

// metadataBase makes all relative og:image / twitter:image URLs absolute
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

// Mobile chrome color + viewport
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2D4A3E",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts injects x-lang into every request so the html[lang] is correct
  // for both English and Spanish routes without duplicating html/body tags.
  const headersList = await headers();
  const lang = headersList.get("x-lang") || "en";

  return (
    <html lang={lang} className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-cream text-charcoal">{children}</body>
    </html>
  );
}
