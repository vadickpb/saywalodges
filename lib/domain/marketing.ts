import type { MarketingLocale } from "@/dictionaries/marketing";

// Deployment configuration, never the request Host, is used for public links.
export function marketingUrls(rootDomain: string, demoSubdomain: string, locale: MarketingLocale) {
  const hostname = rootDomain.split(":")[0];
  const scheme = hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";
  const base = `${scheme}://${rootDomain}`;
  const languages = { es: `${base}/`, en: `${base}/en` };
  return {
    base,
    languages,
    canonical: languages[locale],
    demo: `${scheme}://${demoSubdomain}.${rootDomain}/${locale}`,
  };
}

export function whatsappUrl(number: string, message: string) {
  const url = new URL(`https://wa.me/${number}`);
  url.searchParams.set("text", message);
  return url.toString();
}
