import { describe, expect, it } from "vitest";
import { isModuleEnabled, parseDisabledModules } from "./modules";

describe("parseDisabledModules", () => {
  it("is empty by default: every module on", () => {
    for (const raw of [undefined, null, "", "  ", ","]) {
      const r = parseDisabledModules(raw);
      expect(r.ok && r.disabled.size).toBe(0);
    }
  });
  it("parses names ignoring case and spaces", () => {
    const r = parseDisabledModules(" Finance, whatsapp ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(isModuleEnabled(r.disabled, "finance")).toBe(false);
      expect(isModuleEnabled(r.disabled, "whatsapp")).toBe(false);
      expect(isModuleEnabled(r.disabled, "guide")).toBe(true);
    }
  });
  it("rejects unknown names", () => {
    expect(parseDisabledModules("finanzas")).toEqual({ ok: false, unknown: ["finanzas"] });
  });
});
