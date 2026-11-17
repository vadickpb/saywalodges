// Deployment-level values, not property content. Tenant-facing content still
// comes from the database (see lib/dal/public/property.ts).
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const requiresSiteUrl = process.env.NODE_ENV === "production" || process.env.DEPLOYMENT_MODE === "installation";

if (!configuredSiteUrl && requiresSiteUrl) {
  throw new Error(
    "Invalid environment configuration: NEXT_PUBLIC_SITE_URL is required in production and installation mode. Set it to the panel origin (for example, https://app.example.com).",
  );
}

export const SITE_URL = configuredSiteUrl || "http://localhost:3000";
export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim() || "Mi alojamiento";
export const SITE_HOST = new URL(SITE_URL).hostname;
