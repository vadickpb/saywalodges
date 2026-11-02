import { describe, expect, it } from "vitest";
import { validateDemoData, PRIVATE_BUCKETS, DEMO_ORG_ID, DEMO_PROPERTY_ID, DEMO_STAFF_EMAIL, INSERT_ORDER, TABLE_OF, buildDemoData } from "./demo-data.mjs";

const today = new Date("2026-11-03T05:00:00Z");
const data = buildDemoData(today, { rootDomain: "demo.example.org" });
const rows = (k) => [].concat(data[k]);

describe("demo data", () => {
  it("every row belongs to the demo organization (so deleting it removes everything)", () => {
    for (const k of INSERT_ORDER.filter((x) => x !== "organization")) {
      for (const r of rows(k)) expect(r.org_id, k).toBe(DEMO_ORG_ID);
    }
    expect(data.organization.id).toBe(DEMO_ORG_ID);
    expect(data.membership.org_id).toBe(DEMO_ORG_ID);
  });
  it("is published, fictional and never an owner", () => {
    expect(data.property.published).toBe(true);
    expect(data.property.id).toBe(DEMO_PROPERTY_ID);
    expect(data.membership.role).toBe("staff");
    expect(DEMO_STAFF_EMAIL).toBe("demo-staff@example.com");
  });
  it("contains nothing from the real Saywa Lodges", () => {
    const text = JSON.stringify(data).toLowerCase();
    for (const real of ["51963416766", "saywalodges", "urubamba", "reservas@"]) expect(text).not.toContain(real);
  });
  it("uses unique ids and respects the pricing constraints", () => {
    const ids = INSERT_ORDER.flatMap((k) => rows(k)).map((r) => r.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    const season = data.seasons[0];
    expect(season.end_date > season.start_date).toBe(true);
    expect(season.start_date).toBe("2026-11-03");
    expect(season.end_date).toBe("2027-03-03");
    for (const r of data.unit_rates) {
      expect(data.units.some((u) => u.id === r.unit_id)).toBe(true);
      expect(r.season_id === null || r.season_id === season.id).toBe(true);
    }
    // exactly one base rate (season_id null) per unit, as the unique index requires
    for (const u of data.units) expect(data.unit_rates.filter((r) => r.unit_id === u.id && r.season_id === null)).toHaveLength(1);
    for (const u of data.units) expect(u.included_guests <= u.max_guests).toBe(true);
  });
  it("seasons follow the injected date", () => {
    const later = buildDemoData(new Date("2027-01-10T00:00:00Z"));
    expect(later.seasons[0].start_date).toBe("2027-01-10");
    expect(later.property.custom_domain).toBeNull();
  });
  it("rows of one insert share the same columns (PostgREST bulk insert rejects mixed keys with HTTP 400)", () => {
    for (const k of INSERT_ORDER) {
      const keySets = new Set(rows(k).map((r) => Object.keys(r).sort().join(",")));
      expect(keySets.size, k).toBe(1);
    }
  });
  it("accepts the default data and a valid root domain", () => {
    expect(validateDemoData(buildDemoData(today))).toEqual([]);
    expect(validateDemoData(data)).toEqual([]);
  });
  it.each(["Demo.Example.org", "demo.example.org:3000", "demo.example.org.", "https://demo.example.org", "demo", "-demo.example.org", "demo example.org"])(
    "rejects the root domain %s before anything is deleted",
    (rootDomain) => {
      expect(validateDemoData(buildDemoData(today, { rootDomain })).join()).toMatch(/DEMO_ROOT_DOMAIN/);
    },
  );
  it("uses the root domain as the canonical site URL, and none otherwise", () => {
    expect(data.property.site_url).toBe("https://demo.example.org");
    expect(buildDemoData(today).property.site_url).toBe("");
  });
  it("covers every storage bucket that holds org files, so the nightly reset leaves none behind", () => {
    expect(PRIVATE_BUCKETS).toEqual(["property-photos", "finance-receipts", "payment-vouchers"]);
  });
  it("has a table for every insert group", () => {
    for (const k of INSERT_ORDER) expect(TABLE_OF[k]).toMatch(/^[a-z_]+$/);
  });
});
