// Safely serializes a JSON-LD object for a <script type="application/ld+json">
// tag. `data` may contain values sourced from editable content (property
// name, descriptions, addresses, etc.), so this escapes `<` to prevent a
// "</script>" sequence from closing the tag early and injecting a sibling
// <script> — the standard mitigation for untrusted data in inline JSON.
export function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
