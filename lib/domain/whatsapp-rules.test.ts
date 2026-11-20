import { describe, expect, it } from "vitest";
import { defaultWhatsappRule, mergeWhatsappRules, whatsappRuleSchema } from "./whatsapp-rules";
import { whatsappKinds } from "./whatsapp-templates";

const ok = { kind: "arrival_reminder", enabled: true, offsetDays: "1", windowStart: "9", windowEnd: "20" };

describe("whatsapp rules", () => {
  it("accepts a valid rule and coerces form strings", () => {
    expect(whatsappRuleSchema.parse(ok)).toEqual({ kind: "arrival_reminder", enabled: true, offsetDays: 1, windowStart: 9, windowEnd: 20 });
  });
  it.each([
    { kind: "nope" }, { enabled: "yes" }, { offsetDays: "15" }, { offsetDays: "-1" }, { offsetDays: "1.5" },
    { windowStart: "24" }, { windowEnd: "0" }, { windowEnd: "25" }, { windowStart: "20", windowEnd: "9" }, { windowStart: "9", windowEnd: "9" },
    { kind: "post_stay", offsetDays: "4" },
  ])("rejects %o", (patch) => expect(whatsappRuleSchema.safeParse({ ...ok, ...patch }).success).toBe(false));
  it("merges saved rows over the defaults, in display order", () => {
    const merged = mergeWhatsappRules([{ kind: "post_stay", enabled: false, offset_days: 2, window_start: 10, window_end: 12 }]);
    expect(merged.map((r) => r.kind)).toEqual([...whatsappKinds]);
    expect(merged.find((r) => r.kind === "post_stay")).toEqual({ kind: "post_stay", enabled: false, offsetDays: 2, windowStart: 10, windowEnd: 12 });
    expect(merged.find((r) => r.kind === "confirmation")).toEqual(defaultWhatsappRule("confirmation"));
  });
  it("every default is on and has a valid window", () => {
    for (const kind of whatsappKinds) {
      const rule = defaultWhatsappRule(kind);
      expect(rule.enabled).toBe(true);
      expect(whatsappRuleSchema.safeParse(rule).success).toBe(true);
    }
  });
});
