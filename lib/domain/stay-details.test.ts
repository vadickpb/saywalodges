import { describe, expect, it } from "vitest";
import { airbnbReservationUrl, firstName, greeting, reminderSummary, stayDetailsSchema, stayKeySchema, stayRequestKeys } from "./stay-details";

const base = { name: "Ana Pérez", phone: "+51 999 888 777", lang: "es", party: "4", arrival: "15:30", requests: ["crib"], note: "Llegan en taxi", remindOn: "2030-01-02" };

describe("stayDetailsSchema", () => {
  it("accepts a full form and coerces the numbers", () => {
    expect(stayDetailsSchema.parse(base)).toEqual({ name: "Ana Pérez", phone: "+51 999 888 777", lang: "es", party: 4, arrival: "15:30", requests: ["crib"], note: "Llegan en taxi", remindOn: "2030-01-02" });
  });
  it("only the language is required: blank fields become null (fast to fill)", () => {
    const parsed = stayDetailsSchema.parse({ name: "", phone: "  ", lang: "en", party: "", arrival: "", requests: [], note: "", remindOn: "" });
    expect(parsed).toEqual({ name: null, phone: null, lang: "en", party: null, arrival: null, requests: [], note: null, remindOn: null });
  });
  it.each([
    { lang: "fr" }, { phone: "abc" }, { phone: "123" }, { party: "0" }, { party: "61" }, { arrival: "25:00" }, { arrival: "9:30" },
    { requests: ["teleport"] }, { remindOn: "2030-13-40" }, { name: "x".repeat(201) }, { note: "x".repeat(501) }, { name: "Ana‮" },
  ])("rejects %o", (patch) => expect(stayDetailsSchema.safeParse({ ...base, ...patch }).success).toBe(false));
  it("dedupes chips and every chip key is accepted", () => {
    expect(stayDetailsSchema.parse({ ...base, requests: ["pet", "pet", "crib"] }).requests).toEqual(["pet", "crib"]);
    expect(stayDetailsSchema.safeParse({ ...base, requests: stayRequestKeys }).success).toBe(true);
  });
  it("keeps line breaks in the note", () => {
    expect(stayDetailsSchema.parse({ ...base, note: "uno\ndos" }).note).toBe("uno\ndos");
  });
});

describe("stayKeySchema", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";
  it("is a booking or an iCal reservation, never both or neither", () => {
    expect(stayKeySchema.parse({ bookingId: uuid })).toEqual({ kind: "booking", bookingId: uuid });
    expect(stayKeySchema.parse({ feedId: uuid, externalUid: "a".repeat(64) })).toEqual({ kind: "ical", feedId: uuid, externalUid: "a".repeat(64) });
    for (const bad of [{}, { bookingId: uuid, feedId: uuid, externalUid: "a".repeat(64) }, { feedId: uuid }, { feedId: uuid, externalUid: "zz" }, { bookingId: "x" }]) {
      expect(stayKeySchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("helpers", () => {
  it("builds the Airbnb link only from a valid code", () => {
    expect(airbnbReservationUrl("HMABC12345")).toBe("https://www.airbnb.com/hosting/reservations/details/HMABC12345");
    for (const bad of [null, "", "hm123", "HM12/../x", "A".repeat(21), "HMABC 1234"]) expect(airbnbReservationUrl(bad)).toBeNull();
  });
  it("greets with the first name, or plainly while the name is unknown", () => {
    expect(firstName("  Ana  María Pérez ")).toBe("Ana");
    expect(firstName(null)).toBeNull();
    expect(firstName("   ")).toBeNull();
    expect(greeting("Ana Pérez", "es")).toBe("Hola Ana");
    expect(greeting("Ana Pérez", "en")).toBe("Hi Ana");
    expect(greeting(null, "es")).toBe("Hola");
  });
  it("summarises a reminder on one line", () => {
    expect(reminderSummary({ name: "Ana Pérez", requests: ["crib", "late_checkout"], note: "Llegan de Cusco" })).toBe("Ana · Cuna, Salida tarde · Llegan de Cusco");
    expect(reminderSummary({ name: null, requests: [], note: null })).toBe("Sin nombre");
  });
});
