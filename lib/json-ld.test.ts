import { describe, it, expect } from "vitest";
import { toJsonLd } from "./json-ld";

// Formalizes the manual verification done during SD-001's security fix
// (stored XSS via unescaped JSON-LD) — see docs/roadmap.md SD-005.
describe("toJsonLd", () => {
  it("escapes '<' so a '</script>' sequence can't close the tag early", () => {
    const out = toJsonLd({ name: "Evil</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
  });

  it("still parses back to the original data (escaping is reversible)", () => {
    const data = { name: "<img src=x onerror=alert(1)>", items: ["<b>", 1, null] };
    const out = toJsonLd(data);
    expect(out).not.toContain("<img");
    expect(JSON.parse(out)).toEqual(data);
  });

  it("produces unchanged output for data with no special characters", () => {
    const data = { a: 1, b: "hello", c: [1, 2, 3] };
    expect(JSON.parse(toJsonLd(data))).toEqual(data);
  });
});
