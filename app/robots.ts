import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSiteByHost, getSiteUrl, siteIdentifierFromHost } from "@/lib/dal/public/site";
import { SITE_URL } from "@/config/site";
import { env } from "@/lib/env";

// Only the `sitemap` URL needs to be per-host (ADR-0001) — the rules
// themselves are the same shape for every tenant. headers() opts this out
// of the default static caching, same reasoning as app/sitemap.ts.
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (env.DEPLOYMENT_MODE === "vendor") {
    return {
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/app/", "/login", "/vendor"] },
      sitemap: `${SITE_URL}/sitemap.xml`,
    };
  }

  const host = (await headers()).get("host") ?? "";
  // Checked the same way sitemap.ts is, for consistency: an unrecognized
  // host gets disallow: "/" instead of a sitemap pointing at a site that
  // doesn't exist.
  const site = await getSiteByHost(siteIdentifierFromHost(host));
  if (!site) return { rules: { userAgent: "*", disallow: "/" } };

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // SD-1125: capability pages (booking status, checkout, private guide) carry a token in the URL and are noindex; keep crawlers out.
      disallow: ["/admin", "/api/", "/*/reserva/", "/*/reservar/", "/*/guia/"],
    },
    sitemap: `${getSiteUrl(host)}/sitemap.xml`,
  };
}
