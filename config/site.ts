// Deployment-level constant, not property content — stays env-driven rather
// than moving to the properties table (see lib/property.ts for the rest).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://saywalodges.com";
