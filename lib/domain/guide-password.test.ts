import { afterEach, describe, expect, it, vi } from "vitest";
import { generateGuidePassword, GUIDE_PASSWORD_WORDS } from "./guide-password";
import { guidePasswordSchema } from "./house-guide";

afterEach(() => vi.restoreAllMocks());
describe("memorable guide passwords", () => {
  it("has at least 200 unique accent-free words of four to six letters", () => {
    expect(GUIDE_PASSWORD_WORDS.length).toBeGreaterThanOrEqual(200);
    expect(new Set(GUIDE_PASSWORD_WORDS).size).toBe(GUIDE_PASSWORD_WORDS.length);
    for (const word of GUIDE_PASSWORD_WORDS) expect(word).toMatch(/^[a-z]{4,6}$/);
  });
  it("uses Web Crypto for every word and number, padding to three digits", () => {
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation(array => {
      if (array instanceof Uint32Array) array[0] = 0;
      return array;
    });
    expect(generateGuidePassword()).toBe(`${GUIDE_PASSWORD_WORDS[0]}000`);
    expect(random).toHaveBeenCalledTimes(2);
  });
  it("rejects biased values for both selections", () => {
    const values = [0xffffffff, GUIDE_PASSWORD_WORDS.length - 1, 0xffffffff, 999];
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation(array => {
      if (array instanceof Uint32Array) array[0] = values.shift() ?? 0;
      return array;
    });
    expect(generateGuidePassword()).toBe(`${GUIDE_PASSWORD_WORDS.at(-1)}999`);
    expect(random).toHaveBeenCalledTimes(4);
  });
  it("always returns the requested format and satisfies the password schema", () => {
    for (let i = 0; i < 100; i++) {
      const password = generateGuidePassword();
      expect(password).toMatch(/^[a-z]{4,6}[0-9]{3}$/);
      expect(guidePasswordSchema.safeParse(password).success).toBe(true);
    }
    expect(guidePasswordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(guidePasswordSchema.safeParse("é".repeat(37)).success).toBe(false);
  });
});
