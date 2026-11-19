import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const results: Record<string, { data: unknown; error: null | { code: string; message: string } }> = {};
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  function from(table: string) {
    const builder = {
      select(...args: unknown[]) { calls.push({ table, method: "select", args }); return builder; },
      eq(...args: unknown[]) { calls.push({ table, method: "eq", args }); return builder; },
      is(...args: unknown[]) { calls.push({ table, method: "is", args }); return builder; },
      order(...args: unknown[]) { calls.push({ table, method: "order", args }); return builder; },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve(results[table]).then(resolve, reject);
      },
    };
    return builder;
  }
  return { results, calls, from: vi.fn(from) };
});

vi.mock("@/lib/supabase/anon", () => ({ getSupabaseAnon: () => ({ from: mocks.from }) }));

import { getShowcaseUnits } from "./showcase-units";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  for (const key of Object.keys(mocks.results)) delete mocks.results[key];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function rows() {
  mocks.results.units = { data: [
    { id: "u2", name: "Second", showcase_type: "apartment", description_en: "", description_es: "", max_guests: 2, bedrooms: 1, beds: 1, bed_details_en: "", bed_details_es: "", bathrooms: 1, sort_order: 2, created_at: "2026-01-02" },
    { id: "u1", name: "First", showcase_type: "house", description_en: "Desc", description_es: "Descripción", max_guests: 6, bedrooms: 2, beds: 3, bed_details_en: "1 queen", bed_details_es: "1 queen", bathrooms: 2, sort_order: 1, created_at: "2026-01-01" },
  ], error: null };
  mocks.results.spaces = { data: [
    { id: "s1", unit_id: "u1", category: "rooms", icon: "🛏️", label_en: "Bedroom", label_es: "Dormitorio", desc_en: "", desc_es: "", capacity: "2", badge_en: null, badge_es: null, sort_order: 0 },
    { id: "s2", unit_id: "u1", category: "outdoor", icon: "🌿", label_en: "Terrace", label_es: "Terraza", desc_en: "", desc_es: "", capacity: null, badge_en: null, badge_es: null, sort_order: 1 },
    { id: "common", unit_id: null, category: "pool", icon: "🏊", label_en: "Pool", label_es: "Piscina", desc_en: "", desc_es: "", capacity: null, badge_en: null, badge_es: null, sort_order: 2 },
  ], error: null };
  mocks.results.photos = { data: [
    { space_id: "s1", storage_path: "first.jpg", sort_order: 0 },
    { space_id: "s1", storage_path: "second.jpg", sort_order: 1 },
    { space_id: "s2", storage_path: "terrace.jpg", sort_order: 0 },
    { space_id: "common", storage_path: "pool.jpg", sort_order: 0 },
  ], error: null };
  mocks.results.unit_rates = { data: [
    { unit_id: "u1", nightly_cents: 12000, weekend_nightly_cents: 9000 },
    { unit_id: "u1", nightly_cents: 10000, weekend_nightly_cents: null },
  ], error: null };
  mocks.results.unit_components = { data: [{ parent_unit_id: "u2", child_unit_id: "u1" }], error: null };
}

describe("getShowcaseUnits", () => {
  it("keeps database order and groups only each unit's ordered spaces and photos", async () => {
    rows();
    const units = await getShowcaseUnits("property-groups");
    expect(units.map((unit) => unit.id)).toEqual(["u2", "u1"]);
    expect(units[1].spaces.map((space) => space.id)).toEqual(["s1", "s2"]);
    expect(units[1].spaces[0].photos[0]).toContain("first.jpg");
    expect(units[1].cover).toContain("first.jpg");
    expect(units[1].fromCents).toBe(9000);
    expect(units[0].partIds).toEqual(["u1"]);
    expect(units[1].partIds).toEqual([]);
    expect(units.some((unit) => unit.spaces.some((space) => space.id === "common"))).toBe(false);
  });

  it("uses only active units and base rates scoped to the property", async () => {
    rows();
    await getShowcaseUnits("property-filters");
    expect(mocks.calls).toContainEqual({ table: "units", method: "eq", args: ["property_id", "property-filters"] });
    expect(mocks.calls).toContainEqual({ table: "units", method: "eq", args: ["active", true] });
    expect(mocks.calls).toContainEqual({ table: "unit_rates", method: "is", args: ["season_id", null] });
  });

  it("throws a generic error and logs only the database code", async () => {
    rows();
    mocks.results.photos = { data: null, error: { code: "42501", message: "secret table details" } };
    await expect(getShowcaseUnits("property-error")).rejects.toThrow("No se pudieron cargar los alojamientos.");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });
});
