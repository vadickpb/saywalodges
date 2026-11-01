import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { marketingUrls } from "@/lib/domain/marketing";
import { marketingContent } from "@/config/marketing-content";
import { getSiteByHost, getSiteUrl, siteIdentifierFromHost } from "@/lib/dal/public/site";

// Only the `sitemap` URL needs to be per-host (ADR-0001) — the rules
// themselves are the same shape for every tenant. headers() opts this out
// of the default static caching, same reasoning as app/sitemap.ts.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";
  // Checked the same way sitemap.ts is, for consistency: an unrecognized
  // host gets disallow: "/" instead of a sitemap pointing at a site that
  // doesn't exist.
  if (host === env.ROOT_DOMAIN) {
    const { base } = marketingUrls(env.ROOT_DOMAIN, marketingContent.demoSubdomain, "es");
    return {
      rules: { userAgent: "*", allow: "/", disallow: ["/app", "/api/", "/login", "/auth/", "/forgot-password", "/update-password"] },
      sitemap: `${base}/sitemap.xml`,
    };
  }
  if (host === `app.${env.ROOT_DOMAIN}`) return { rules: { userAgent: "*", disallow: "/" } };
  const site = await getSiteByHost(siteIdentifierFromHost(host));
  if (!site) return { rules: { userAgent: "*", disallow: "/" } };

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/"],
    },
    sitemap: `${getSiteUrl(host)}/sitemap.xml`,
  };
}
