import { describe, it, expect } from "vitest";
import { format } from "./format";

describe("format", () => {
  it("fills placeholders", () => {
    expect(format("Photo {index} of {count}", { index: 2, count: 9 })).toBe("Photo 2 of 9");
  });

  it("leaves unknown placeholders visible", () => {
    expect(format("Up to {count} guests", {})).toBe("Up to {count} guests");
  });
});
