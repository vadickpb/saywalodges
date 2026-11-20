// Search-engine helpers (SD-1125). Pure.

/**
 * A meta description search engines show whole: whitespace collapsed and cut at a word boundary near `max` characters
 * (Google truncates around 155-160). Long texts end with "…"; short ones are returned as they are.
 */
export function metaDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const base = (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/u, "");
  return `${base}…`;
}

/** hreflang alternates for a path that exists in both site languages. */
export function languageAlternates(siteUrl: string, path: string): { languages: Record<"es" | "en", string> } {
  const suffix = path ? `/${path.replace(/^\/+/, "")}` : "";
  return { languages: { es: `${siteUrl}/es${suffix}`, en: `${siteUrl}/en${suffix}` } };
}
