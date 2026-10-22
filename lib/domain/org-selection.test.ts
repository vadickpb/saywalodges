import { describe, it, expect } from "vitest";
import { resolveActiveOrgId } from "./org-selection";

const orgs = [
  { id: "org-1", name: "Saywa Lodges" },
  { id: "org-2", name: "Demo Lodge" },
];

describe("resolveActiveOrgId", () => {
  it("returns null when the user has no orgs", () => {
    expect(resolveActiveOrgId([], "org-1")).toBeNull();
    expect(resolveActiveOrgId([], undefined)).toBeNull();
  });

  it("uses the cookie value when it matches one of the user's orgs", () => {
    expect(resolveActiveOrgId(orgs, "org-2")).toBe("org-2");
  });

  it("falls back to the first org when the cookie is missing", () => {
    expect(resolveActiveOrgId(orgs, undefined)).toBe("org-1");
  });

  it("falls back to the first org when the cookie references an org the user isn't in", () => {
    // Stale cookie (lost that membership) or a forged value — same handling either way.
    expect(resolveActiveOrgId(orgs, "someone-elses-org")).toBe("org-1");
  });
});
