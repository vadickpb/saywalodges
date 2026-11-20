import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OWNER_ALERT_TEMPLATES, ownerAlertKinds, ownerBookingParams, ownerConflictParams, ownerVoucherParams } from "./whatsapp-owner-alerts";

describe("owner alert templates", () => {
  it("each body has contiguous variables matching its description and samples, and none at the edges", () => {
    for (const kind of ownerAlertKinds) {
      const t = OWNER_ALERT_TEMPLATES[kind];
      const slots = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(slots).toEqual(slots.map((_, i) => i + 1));
      expect(t.variables).toHaveLength(slots.length);
      expect(t.samples).toHaveLength(slots.length);
      expect(t.body.startsWith("{{") || t.body.endsWith("}}")).toBe(false);
      expect(t.name).toBe(kind);
    }
  });
  it("docs/whatsapp.md carries the exact bodies", () => {
    const doc = readFileSync("docs/whatsapp.md", "utf8");
    for (const kind of ownerAlertKinds) expect(doc).toContain(OWNER_ALERT_TEMPLATES[kind].body);
  });
  it("params are never empty and strip control characters", () => {
    expect(ownerBookingParams("Casa\n1", "2026-12-21", "2026-12-24")).toHaveLength(3);
    expect(ownerBookingParams("", "2026-12-21", "2026-12-24")[0]).toBe("—");
    expect(ownerVoucherParams("Casa", "2026-12-21")).toHaveLength(2);
    expect(ownerConflictParams(null, 3)).toEqual(["tu calendario", "3"]);
  });
});
