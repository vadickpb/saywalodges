import { describe, it, expect } from "vitest";
import { buildIcs, exportPayloadSchema } from "./export";

const now = new Date("2027-03-05T15:04:05.678Z");
const ev = (id: string, starts: string, ends: string) => ({ id, starts, ends });
const lines = (ics: string) => ics.split("\r\n");

describe("buildIcs", () => {
  it("writes a valid VCALENDAR with CRLF line endings and a final CRLF", () => {
    const ics = buildIcs({ name: "Casa Saywa", events: [ev("b1", "2027-03-10", "2027-03-13")], now });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/); // no bare LF
    expect(lines(ics)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Saywa Direct//Calendar//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Casa Saywa",
      "BEGIN:VEVENT",
      "UID:b1@saywa.direct",
      "DTSTAMP:20270305T150405Z",
      "DTSTART;VALUE=DATE:20270310",
      "DTEND;VALUE=DATE:20270313",
      "SUMMARY:Reservado",
      "TRANSP:OPAQUE",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]);
  });

  it("is a valid empty calendar when nothing is occupied", () => {
    const ics = buildIcs({ name: "x", events: [], now });
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("one VEVENT per block, in the order given, each with its own UID", () => {
    const ics = buildIcs({ name: "x", events: [ev("a", "2027-01-01", "2027-01-02"), ev("b", "2027-02-01", "2027-02-03")], now });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.indexOf("UID:a@")).toBeLessThan(ics.indexOf("UID:b@"));
  });

  it("escapes text values and drops control characters", () => {
    const ics = buildIcs({ name: "A, B; C\\D\nE\u0007", events: [], now });
    expect(ics).toContain("X-WR-CALNAME:A\\, B\\; C\\\\D\\nE\r\n");
  });

  it("carries nothing but dates: every event is called Reservado", () => {
    const ics = buildIcs({ name: "x", events: [ev("a", "2027-01-01", "2027-01-02")], now });
    expect(ics).toContain("SUMMARY:Reservado");
    expect(ics).not.toMatch(/DESCRIPTION|ATTENDEE|ORGANIZER|LOCATION|CONTACT/);
  });

  it("folds long lines at 75 octets and never splits a multi-byte character", () => {
    const name = "Casa de campo ñandú ".repeat(12) + "🏡".repeat(30);
    const ics = buildIcs({ name, events: [], now });
    const encoder = new TextEncoder();
    for (const line of lines(ics)) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const rows = lines(ics);
    const start = rows.findIndex((l) => l.startsWith("X-WR-CALNAME:"));
    const unfolded = [rows[start], ...rows.slice(start + 1).filter((l) => l.startsWith(" "))]
      .map((l, i) => (i === 0 ? l : l.slice(1)))
      .join("");
    expect(unfolded).toBe(`X-WR-CALNAME:${name}`);
  });

  it("refuses a malformed date instead of writing a broken file", () => {
    expect(() => buildIcs({ name: "x", events: [ev("a", "2027-1-1", "2027-01-02")], now })).toThrow("invalid date");
    expect(() => buildIcs({ name: "x", events: [ev("a", "2027-01-01", "nope")], now })).toThrow("invalid date");
  });
});

describe("exportPayloadSchema", () => {
  const ok = { unit: "Casa", channel: "airbnb", blocks: [{ id: "6f1b-2c", starts: "2027-03-10", ends: "2027-03-12" }] };
  it("accepts what the database function returns", () => {
    expect(exportPayloadSchema.safeParse(ok).success).toBe(true);
    expect(exportPayloadSchema.safeParse({ ...ok, blocks: [] }).success).toBe(true);
  });
  it("rejects anything else, so a surprise in the data never reaches the file", () => {
    for (const bad of [null, {}, { ...ok, unit: 5 }, { ...ok, blocks: [{ id: "a b", starts: "2027-03-10", ends: "2027-03-12" }] },
      { ...ok, blocks: [{ id: "a", starts: "2027-03-10T00:00:00Z", ends: "2027-03-12" }] }, { ...ok, blocks: "x" }]) {
      expect(exportPayloadSchema.safeParse(bad).success).toBe(false);
    }
  });
});
