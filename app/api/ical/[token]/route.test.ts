import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const getIcalExport = vi.fn();
vi.mock("@/lib/dal/ical-feeds", () => ({ getIcalExport: (...a: unknown[]) => getIcalExport(...a) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => Promise.resolve({}) }));
import { GET } from "./route";

const TOKEN = "a".repeat(64);
const call = (token: string) => GET(new Request(`http://localhost:3000/api/ical/${token}`), { params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/ical/[token]", () => {
  it("serves the calendar as text/calendar, never cached", async () => {
    getIcalExport.mockResolvedValue({ unit: "Casa Saywa", channel: "airbnb", blocks: [{ id: "b1", starts: "2027-03-10", ends: "2027-03-12" }] });
    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("DTSTART;VALUE=DATE:20270310");
    expect(body).toContain("DTEND;VALUE=DATE:20270312");
    expect(body).toContain("X-WR-CALNAME:Casa Saywa");
  });

  it("answers an empty calendar for a unit with nothing occupied", async () => {
    getIcalExport.mockResolvedValue({ unit: "Casa", channel: "other", blocks: [] });
    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("BEGIN:VEVENT");
  });

  it("answers an empty 404 for an unknown, malformed or regenerated token", async () => {
    getIcalExport.mockResolvedValue(null);
    for (const token of [TOKEN, "short", "../etc/passwd"]) {
      const res = await call(token);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    }
  });

  it("answers a generic 500 when the database fails or the data is malformed", async () => {
    getIcalExport.mockRejectedValue(new Error("secret db detail"));
    const failed = await call(TOKEN);
    expect(failed.status).toBe(500);
    expect(await failed.text()).toBe("No se pudo generar el calendario.");
    getIcalExport.mockResolvedValue({ unit: "Casa", channel: "airbnb", blocks: [{ id: "b1", starts: "bad", ends: "bad" }] });
    const bad = await call(TOKEN);
    expect(bad.status).toBe(500);
    expect(await bad.text()).toBe("No se pudo generar el calendario.");
  });
});
