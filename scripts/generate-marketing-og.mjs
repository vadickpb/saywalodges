// Optional regeneration after changing the SD-107 palette. Uses Sharp already
// shipped by Next; no new dependency. Run: node scripts/generate-marketing-og.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const palette = readFileSync("app/globals.css", "utf8").split(".marketing {")[1];
const token = (name) => {
  const value = palette?.match(new RegExp(`--${name}: (#[0-9A-Fa-f]+)`))?.[1];
  if (!value) throw new Error(`Missing marketing palette token: ${name}`);
  return value;
};
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="${token("background")}"/>
<rect x="70" y="70" width="1060" height="490" rx="32" fill="${token("accent")}"/>
<path d="M140 240l60-30 60 30-60 30z m0 30l60 30 60-30 m-120 30l60 30 60-30" fill="none" stroke="${token("primary")}" stroke-width="10" stroke-linejoin="round"/>
<text x="320" y="305" fill="${token("foreground")}" font-family="sans-serif" font-size="76" font-weight="600">Saywa Direct</text>
</svg>`)).png().toFile("public/images/saywa-direct-og.png");
