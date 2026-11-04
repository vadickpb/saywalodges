import { describe, expect, it } from "vitest";
import { createGuideToken, digestGuideToken } from "./guide-credentials";
describe("guide credentials", () => {
  it("generates unpredictable URL-safe tokens and stores a digest", () => {
    const first = createGuideToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createGuideToken()).not.toBe(first);
    expect(digestGuideToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(digestGuideToken(first)).toBe(digestGuideToken(first));
  });
});
