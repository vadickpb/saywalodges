import { describe, expect, it } from "vitest";
import { createLeadLimiter, leadSchema, leadVerdict } from "./vendor-lead";

const base = { name: "Ana Pérez", email: "ana@example.com", properties: "2-3", package: "pro", startedAt: "1000" };

describe("leadSchema", () => {
  it("accepts a valid lead and strips control characters", () => {
    const r = leadSchema.parse({ ...base, message: "Hola\r\nBcc: x@y.z" });
    expect(r.message).toBe("Hola  Bcc: x@y.z");
  });
  it("rejects bad email, phone and package", () => {
    expect(leadSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, phone: "abc" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, package: "gold" }).success).toBe(false);
  });
});

describe("leadVerdict", () => {
  it("flags honeypot, too-fast and stale submissions", () => {
    expect(leadVerdict({ website: "http://spam", startedAt: 0 }, 10_000)).toBe("bot");
    expect(leadVerdict({ startedAt: 9_000 }, 10_000)).toBe("bot");
    expect(leadVerdict({ startedAt: 0 }, 7 * 60 * 60 * 1000)).toBe("bot");
    expect(leadVerdict({ startedAt: 1_000 }, 10_000)).toBe("ok");
  });
});

describe("createLeadLimiter", () => {
  it("caps per key within the window and recovers after it", () => {
    const allow = createLeadLimiter(2, 1000);
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 1)).toBe(true);
    expect(allow("ip", 2)).toBe(false);
    expect(allow("other", 2)).toBe(true);
    expect(allow("ip", 1500)).toBe(true);
  });
});
