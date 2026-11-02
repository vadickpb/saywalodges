import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMatrix, parseRegistry } from "./installations.mjs";

const two = { installations: [{ id: "saywa-lodges", environment: "supabase-production" }, { id: "hotel-andino", environment: "supabase-hotel-andino" }] };

describe("registry", () => {
  it("the committed registry is valid", () => {
    const real = JSON.parse(readFileSync(new URL("../../deploy/installations.json", import.meta.url), "utf8"));
    expect(() => parseRegistry(real)).not.toThrow();
  });
  it("rejects empty, duplicate and malformed entries", () => {
    expect(() => parseRegistry({ installations: [] })).toThrow();
    expect(() => parseRegistry({ installations: [two.installations[0], two.installations[0]] })).toThrow(/duplicate/);
    expect(() => parseRegistry({ installations: [{ id: "a", environment: "production" }] })).toThrow();
    expect(() => parseRegistry({ installations: [{ id: "a", environment: "supabase-a", supabaseRef: "x" }] })).toThrow();
    expect(() => parseRegistry({ installations: [{ id: "A b", environment: "supabase-a" }] })).toThrow();
  });
});

describe("buildMatrix", () => {
  const reg = parseRegistry(two);
  it("one job (and so one approval) per installation", () => {
    expect(buildMatrix(reg).include).toEqual(two.installations);
  });
  it("can target a single installation", () => {
    expect(buildMatrix(reg, "hotel-andino").include).toEqual([two.installations[1]]);
  });
  it("fails on an unknown id instead of deploying nothing silently", () => {
    expect(() => buildMatrix(reg, "nope")).toThrow(/no installation/);
  });
  it("never treats a shell-looking id as anything but a literal that matches nothing", () => {
    expect(() => buildMatrix(reg, "x; rm -rf /")).toThrow(/no installation/);
  });
});
