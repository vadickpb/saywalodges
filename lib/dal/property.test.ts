import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getPropertySettings, getSiteAppearance, updatePropertySettings, updateSiteAppearance } from "./property";

const row = {
  name: "Saywa Lodges",
  whatsapp_number: "51963416766",
  whatsapp_message_en: "Hi!",
  whatsapp_message_es: "Hola!",
  email: "reservas@saywalodges.com",
  maps_url: "https://maps.app.goo.gl/x",
  airbnb_url: "",
  address_locality: "Urubamba",
  address_region: "Cusco",
  address_country: "PE",
  latitude: -13.3162,
  longitude: -72.1263,
  meta_title_en: "Saywa Lodges",
  meta_title_es: "Saywa Lodges",
  meta_description_en: "A lodge",
  meta_description_es: "Un lodge",
  meta_keywords_en: ["lodge"],
  meta_keywords_es: ["lodge"],
  price_range: "$$",
  star_rating: 4,
  pets_allowed: false,
};

const settings = {
  name: "Saywa Lodges",
  whatsappNumber: "51963416766",
  whatsappMessageEn: "Hi!",
  whatsappMessageEs: "Hola!",
  email: "reservas@saywalodges.com",
  mapsUrl: "https://maps.app.goo.gl/x",
  airbnbUrl: "",
  addressLocality: "Urubamba",
  addressRegion: "Cusco",
  addressCountry: "PE",
  latitude: -13.3162,
  longitude: -72.1263,
  metaTitleEn: "Saywa Lodges",
  metaTitleEs: "Saywa Lodges",
  metaDescriptionEn: "A lodge",
  metaDescriptionEs: "Un lodge",
  metaKeywordsEn: ["lodge"],
  metaKeywordsEs: ["lodge"],
  priceRange: "$$",
  starRating: 4,
  petsAllowed: false,
};

// Same minimal query-builder stub as lib/dal/organizations.test.ts.
function stubSupabase(response: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(response),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>;
}

describe("getPropertySettings", () => {
  it("maps the property row to camelCase settings", async () => {
    const supabase = stubSupabase({ data: row, error: null });
    expect(await getPropertySettings(supabase, "org-1")).toEqual(settings);
  });

  it("returns null when the org has no property yet", async () => {
    const supabase = stubSupabase({ data: null, error: null });
    expect(await getPropertySettings(supabase, "org-1")).toBeNull();
  });

  it("returns null on a DB error rather than throwing", async () => {
    const supabase = stubSupabase({ data: null, error: new Error("boom") });
    expect(await getPropertySettings(supabase, "org-1")).toBeNull();
  });
});

describe("updatePropertySettings", () => {
  it("returns ok when exactly one row was updated", async () => {
    const supabase = stubSupabase({ data: [{ id: "property-1" }], error: null });
    expect(await updatePropertySettings(supabase, "org-1", settings)).toEqual({ ok: true });
  });

  it("returns not-ok when 0 rows were updated (RLS filtered a cross-org write, or the org has no property)", async () => {
    const supabase = stubSupabase({ data: [], error: null });
    expect(await updatePropertySettings(supabase, "org-1", settings)).toEqual({ ok: false });
  });

  it("returns not-ok on a DB error rather than throwing", async () => {
    const supabase = stubSupabase({ data: null, error: new Error("boom") });
    expect(await updatePropertySettings(supabase, "org-1", settings)).toEqual({ ok: false });
  });
});

describe("getSiteAppearance", () => {
  it("resolves stored theme and content", async () => {
    const supabase = stubSupabase({
      data: { theme: { preset: "costa", primary: "#112233" }, content: { capacity: 6 } },
      error: null,
    });
    const result = await getSiteAppearance(supabase, "org-1");
    expect(result?.theme).toMatchObject({ preset: "costa", primary: "#112233", fontPair: "modern" });
    expect(result?.content).toEqual({ capacity: 6 });
  });

  it("falls back to the default preset and empty copy for invalid JSON", async () => {
    const supabase = stubSupabase({ data: { theme: { primary: "red" }, content: "x" }, error: null });
    const result = await getSiteAppearance(supabase, "org-1");
    expect(result?.theme.preset).toBe("andino");
    expect(result?.content).toEqual({});
  });

  it("returns null without a property or on a DB error", async () => {
    expect(await getSiteAppearance(stubSupabase({ data: null, error: null }), "org-1")).toBeNull();
    expect(await getSiteAppearance(stubSupabase({ data: null, error: new Error("boom") }), "org-1")).toBeNull();
  });
});

describe("updateSiteAppearance", () => {
  const input = { theme: { preset: "costa" }, content: { capacity: 4 } };

  it("writes only theme and content, scoped to the org", async () => {
    const supabase = stubSupabase({ data: [{ id: "p1" }], error: null });
    expect(await updateSiteAppearance(supabase, "org-1", input)).toEqual({ ok: true });
    const builder = vi.mocked(supabase.from).mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ theme: input.theme, content: input.content });
    expect(builder.eq).toHaveBeenCalledWith("org_id", "org-1");
  });

  it("fails when RLS filters the write to 0 rows (cross-org or no property)", async () => {
    expect(await updateSiteAppearance(stubSupabase({ data: [], error: null }), "org-1", input)).toEqual({ ok: false });
  });

  it("fails on a DB error without throwing", async () => {
    expect(await updateSiteAppearance(stubSupabase({ data: null, error: new Error("boom") }), "org-1", input)).toEqual({ ok: false });
  });
});
