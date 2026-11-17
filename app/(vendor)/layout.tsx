import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { SITE_URL } from "@/config/site";
import { env } from "@/lib/env";
import "@/app/globals.css";
import "./vendor.css";

const bodyFont = Inter({ variable: "--font-hoststay-body", subsets: ["latin"], display: "swap" });
const headingFont = Plus_Jakarta_Sans({ variable: "--font-hoststay-heading", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = { metadataBase: new URL(SITE_URL) };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0C1A22",
};

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  if (env.DEPLOYMENT_MODE !== "vendor") notFound();
  await connection();

  return (
    <html lang="es" className={`${bodyFont.variable} ${headingFont.variable} scroll-smooth antialiased`}>
      <body className="hoststay min-h-screen">{children}</body>
    </html>
  );
}
