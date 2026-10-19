// Deployment-level constant, not property content — stays env-driven rather
// than moving to the properties table (see lib/dal/public/property.ts for
// the rest).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://saywalodges.com";

// Only used by the legacy single-tenant admin routes (app/api/admin/*).
// The public site resolves its tenant from the request host instead
// (lib/dal/public/site.ts, SD-105) — this constant isn't a stand-in for
// that anymore. Goes away when SD-201/202 replace /admin with a real,
// per-org dashboard.
export const PROPERTY_SLUG = "saywa-lodges";
