import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { marketingUrls } from "@/lib/domain/marketing";
import { marketingContent } from "@/config/marketing-content";
import { getSiteByHost, getSiteUrl, siteIdentifierFromHost } from "@/lib/dal/public/site";

// Reads the request's host (not a param — this file is a root-level
// special route, outside app/sites/[host]) so it's per-tenant, per ADR-0001.
// Using headers() here opts this out of the default static caching (Next.js
// docs: "sitemap.js is cached by default unless it uses a Request-time
// API") — intentional, this must vary by host.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host") ?? "";
  if (host === env.ROOT_DOMAIN) {
    const { languages } = marketingUrls(env.ROOT_DOMAIN, marketingContent.demoSubdomain, "es");
    return Object.values(languages).map((url) => ({
      url, changeFrequency: "monthly", priority: 1, alternates: { languages },
    }));
  }
  if (host === `app.${env.ROOT_DOMAIN}`) return [];
  const site = await getSiteByHost(siteIdentifierFromHost(host));
  if (!site) return [];

  const baseUrl = getSiteUrl(host);
  const now = new Date();
  return [
    { url: `${baseUrl}/en`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${baseUrl}/es`, lastModified: now, changeFrequency: "monthly", priority: 1 },
  ];
}
