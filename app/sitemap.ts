import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSiteByHost, getSiteUrl, siteIdentifierFromHost } from "@/lib/dal/public/site";
import { getProperty } from "@/lib/dal/public/property";
import { getShowcaseUnits } from "@/lib/dal/public/showcase-units";

// Reads the request's host (not a param — this file is a root-level
// special route, outside app/sites/[host]) so it's per-tenant, per ADR-0001.
// Using headers() here opts this out of the default static caching (Next.js
// docs: "sitemap.js is cached by default unless it uses a Request-time
// API") — intentional, this must vary by host.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host") ?? "";
  const site = await getSiteByHost(siteIdentifierFromHost(host));
  if (!site) return [];

  const baseUrl = getSiteUrl(host);
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/en`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${baseUrl}/es`, lastModified: now, changeFrequency: "monthly", priority: 1 },
  ];
  try {
    const property = await getProperty(site.slug);
    const units = await getShowcaseUnits(property.id);
    for (const unit of units) {
      pages.push(
        { url: `${baseUrl}/en/alojamientos/${unit.id}`, lastModified: now, changeFrequency: "weekly", priority: 0.8, images: unit.cover ? [unit.cover] : undefined },
        { url: `${baseUrl}/es/alojamientos/${unit.id}`, lastModified: now, changeFrequency: "weekly", priority: 0.8, images: unit.cover ? [unit.cover] : undefined },
      );
    }
  } catch (error) {
    console.error(`sitemap: loading units of ${site.slug} failed:`, error);
  }
  return pages;
}
