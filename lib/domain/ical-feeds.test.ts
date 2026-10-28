import { describe, it, expect } from "vitest";
import { ICAL_CHANNELS, ICAL_CHANNEL_LABELS, exportUrl, feedFormSchema, isExportToken } from "./ical-feeds";

const ID = "ee204001-0000-4000-8000-000000000001";

describe("feedFormSchema", () => {
  it("accepts a unit and a known channel", () => {
    for (const channel of ICAL_CHANNELS) expect(feedFormSchema.safeParse({ unitId: ID, channel }).success).toBe(true);
  });
  it("rejects anything else", () => {
    expect(feedFormSchema.safeParse({ unitId: "x", channel: "airbnb" }).success).toBe(false);
    expect(feedFormSchema.safeParse({ unitId: ID, channel: "expedia" }).success).toBe(false);
    expect(feedFormSchema.safeParse({ unitId: ID }).success).toBe(false);
  });
  it("labels every channel", () => {
    expect(Object.keys(ICAL_CHANNEL_LABELS).sort()).toEqual([...ICAL_CHANNELS].sort());
  });
});

describe("isExportToken", () => {
  it("is exactly 64 lowercase hex characters", () => {
    expect(isExportToken("a".repeat(64))).toBe(true);
    for (const bad of ["a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64), "", "../" + "a".repeat(61)]) {
      expect(isExportToken(bad)).toBe(false);
    }
  });
});

describe("exportUrl", () => {
  const token = "a".repeat(64);
  it("uses https on real hosts and http on local ones", () => {
    expect(exportUrl("saywalodges.vercel.app", token)).toBe(`https://saywalodges.vercel.app/api/ical/${token}`);
    expect(exportUrl("app.localhost:3000", token)).toBe(`http://app.localhost:3000/api/ical/${token}`);
    expect(exportUrl("localhost:3000", token)).toBe(`http://localhost:3000/api/ical/${token}`);
    expect(exportUrl("localhost", token)).toBe(`http://localhost/api/ical/${token}`);
    expect(exportUrl("a.localhost", token)).toBe(`http://a.localhost/api/ical/${token}`);
  });
});
