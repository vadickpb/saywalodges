import { Geist } from "next/font/google";
import type { MarketingLocale } from "@/dictionaries/marketing";
import "@/app/globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

// Separate root layouts keep the document language correct without changing
// authentication pages, tenant layouts or host-based proxy routing.
export function MarketingDocument({ children, locale }: { children: React.ReactNode; locale: MarketingLocale }) {
  return <html lang={locale} className={`${geist.variable} h-full antialiased`}><body>{children}</body></html>;
}
