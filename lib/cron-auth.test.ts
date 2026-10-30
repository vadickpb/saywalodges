import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { isCronAuthorized } from "./cron-auth";

const SECRET = "s".repeat(40);

describe("isCronAuthorized", () => {
  it("accepts the exact bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
  it("rejects a missing, malformed or wrong header", () => {
    for (const header of [null, "", SECRET, `Basic ${SECRET}`, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, "Bearer ", `bearer ${SECRET}`]) {
      expect(isCronAuthorized(header, SECRET)).toBe(false);
    }
  });
  it("fails closed when no secret is configured or it is too short", () => {
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer short", "short")).toBe(false);
  });
});
