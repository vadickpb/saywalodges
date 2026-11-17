import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Geist } from "next/font/google";
import { PRODUCT_NAME, SITE_URL } from "@/config/site";
import { env } from "@/lib/env";
import "@/app/globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const description = "Web propia, reservas directas y calendario sincronizado con Airbnb para anfitriones.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${PRODUCT_NAME} · Solución integral para anfitriones`,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_PE",
    url: "/",
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME} · Solución integral para anfitriones`,
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17352b",
};

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  if (env.DEPLOYMENT_MODE !== "vendor") notFound();
  await connection();

  return (
    <html lang="es" className={`${geist.variable} scroll-smooth antialiased`}>
      <body className="min-h-screen bg-cream text-charcoal">{children}</body>
    </html>
  );
}
