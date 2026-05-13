import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-cream text-charcoal">{children}</body>
    </html>
  );
}
