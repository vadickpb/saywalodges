import { Inter, Lora, Playfair_Display, Plus_Jakarta_Sans, Source_Sans_3 } from "next/font/google";

// Every font pair a tenant theme can pick (lib/domain/site-theme.ts maps
// FontPair → these CSS variables). All variables are declared on <html>, but
// browsers only download a face once CSS actually uses it, so a tenant only
// pays for its own pair. Only the default "editorial" pair is preloaded.

export const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  preload: false,
});

export const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});

export const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
  preload: false,
});

export const fontVariables = [playfair, inter, jakarta, lora, sourceSans]
  .map((font) => font.variable)
  .join(" ");
