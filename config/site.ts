// Deployment-level constant, not property content — stays env-driven rather
// than moving to the properties table (see lib/dal/public/property.ts for
// the rest).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://saywalodges.com";

// Temporary (SD-104): the only tenant until SD-105 (host-based tenant
// resolution) replaces this with resolving the slug from the request host.
export const PROPERTY_SLUG = "saywa-lodges";
