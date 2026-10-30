import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import {
  fetchCalendar,
  parseCalendar,
  validateImportUrl,
  isPublicAddress,
  MAX_BYTES,
  TIMEOUT_MS,
} from "./import";
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.ics`, import.meta.url), "utf8");
const url = "https://www.airbnb.com/calendar/ical/test.ics?s=secret";
const dns = vi.mocked(lookup) as unknown as ReturnType<
  typeof vi.fn<() => Promise<LookupAddress[]>>
>;
const https = vi.mocked(request);
function response(
  body = "calendar",
  status = 200,
  headers: Record<string, string> = {},
) {
  https.mockImplementationOnce((_url, options, callback) => {
    const req = new EventEmitter();
    Object.assign(req, {
      end() {
        const res = new EventEmitter();
        Object.assign(res, { statusCode: status, headers, destroy: vi.fn() });
        // Exercise the actual pinned lookup contract, including Node's all mode.
        if (typeof options === "object" && options.lookup) {
          options.lookup(
            "www.airbnb.com",
            { all: true },
            (error, addresses) => {
              expect(error).toBeNull();
              expect(addresses).toEqual([{ address: "8.8.8.8", family: 4 }]);
            },
          );
        }
        if (typeof callback === "function") callback(res as never);
        queueMicrotask(() => {
          res.emit("data", Buffer.from(body));
          res.emit("end");
        });
      },
    });
    return req as never;
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  dns.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
});
afterEach(() => vi.useRealTimers());

describe("OTA parser", () => {
  it.each(["airbnb", "booking"])(
    "parses anonymized real %s export, only UID digest and dates survive",
    (name) => {
      const rows = parseCalendar(fixture(name));
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => /^[a-f0-9]{64}$/.test(r.uid))).toBe(true);
      expect(JSON.stringify(rows)).not.toMatch(
        /Anonymous|Phone|Reservation|SUMMARY|DESCRIPTION|ANONYMIZED|@/,
      );
      expect(parseCalendar(fixture(name))).toEqual(rows);
    },
  );
  it("preserves date-only checkout and adjacent Airbnb events across host timezones", () => {
    const rows = parseCalendar(fixture("airbnb"));
    expect(rows).toContainEqual(
      expect.objectContaining({ start: "2027-10-11", end: "2027-10-15" }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ start: "2027-10-15", end: "2027-10-22" }),
    );
  });
  it("retains valid civil dates even if a host timezone skips that day", () => {
    const body = fixture("booking")
      .replace("20270412", "20111230")
      .replace("20270413", "20111231");
    expect(parseCalendar(body)).toContainEqual(
      expect.objectContaining({ start: "2011-12-30", end: "2011-12-31" }),
    );
  });
  it("accepts an explicitly empty calendar and skips cancelled events", () => {
    expect(
      parseCalendar("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"),
    ).toEqual([]);
    const body = fixture("booking").replaceAll(
      "END:VEVENT",
      "STATUS:CANCELLED\r\nEND:VEVENT",
    );
    expect(parseCalendar(body)).toEqual([]);
  });
  it.each([
    (s: string) => s.replace("20270413", "20270412"),
    (s: string) => s.replace("20270412", "20270230"),
    (s: string) => s.replace("END:VCALENDAR", ""),
    (s: string) =>
      s.replace("END:VEVENT", "RRULE:FREQ=DAILY;COUNT=999999999\r\nEND:VEVENT"),
    (s: string) =>
      s.replace("END:VEVENT", "rrule:FREQ=DAILY;COUNT=2\r\nEND:VEVENT"),
    (s: string) =>
      s.replace(
        "END:VEVENT",
        "RECURRENCE-ID;VALUE=DATE:20270412\r\nEND:VEVENT",
      ),
    (s: string) =>
      s.replace("DTSTART;VALUE=DATE:20270412", "DTSTART:20270412T100000Z"),
    (s: string) => s.replace("anonymous-stay-02", "anonymous-stay-01"),
    (s: string) => s.replace("UID:anonymous-stay-01@booking.com", ""),
    (s: string) => s.replace("END:VEVENT", ""),
    (s: string) => s.replace("BEGIN:VEVENT", "BEGIN:VEVENT\r\nBEGIN:VEVENT"),
    (s: string) => s.replace("END:VCALENDAR", "END:VCALENDAR\r\nEND:VCALENDAR"),
    (s: string) =>
      s.replace("END:VEVENT", "BEGIN:VTIMEZONE\r\nEND:VTIMEZONE\r\nEND:VEVENT"),
    (s: string) =>
      s.replace("END:VEVENT", "RDATE;VALUE=DATE:20270412\r\nEND:VEVENT"),
  ])("rejects malformed/unsupported snapshot atomically", (mutate) =>
    expect(() => parseCalendar(mutate(fixture("booking")))).toThrow("FORMAT"),
  );
  it("rejects noncalendar and oversized bodies", () => {
    expect(() => parseCalendar("<html>upstream error</html>")).toThrow(
      "FORMAT",
    );
    expect(() => parseCalendar("x".repeat(MAX_BYTES + 1))).toThrow("SIZE");
  });
});
describe("SSRF boundary", () => {
  it.each([
    "http://www.airbnb.com/a",
    "https://127.0.0.1/a",
    "https://[::1]/a",
    "https://localhost/a",
    "https://airbnb.com.evil.test/a",
    "https://evilairbnb.com/a",
    "https://www.airbnb.com:444/a",
    "https://user:pass@www.airbnb.com/a",
    "https://evil.test/a",
    "https://www.airbnb.com/a#x",
  ])("rejects %s before DNS", async (value) => {
    expect(() => validateImportUrl(value)).toThrow("URL");
    await expect(fetchCalendar(value)).rejects.toThrow("URL");
    expect(dns).not.toHaveBeenCalled();
    expect(https).not.toHaveBeenCalled();
  });
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.100.100.200",
    "127.0.0.1",
    "169.254.169.254",
    "172.20.0.1",
    "192.168.1.2",
    "192.0.2.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "garbage",
  ])("rejects nonpublic DNS answer %s", async (address) => {
    expect(isPublicAddress(address)).toBe(false);
    dns.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
    await expect(fetchCalendar(url)).rejects.toThrow("URL");
    expect(https).not.toHaveBeenCalled();
  });
  it("rejects mixed public/private answers", async () => {
    dns.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(fetchCalendar(url)).rejects.toThrow("URL");
  });
  it("pins a public DNS address without losing TLS hostname validation", async () => {
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    response();
    expect(await fetchCalendar(url)).toBe("calendar");
    expect(dns).toHaveBeenCalledTimes(1);
    expect(https.mock.calls[0][0]).toEqual(new URL(url));
    expect(https.mock.calls[0][1]).toMatchObject({
      agent: false,
      headers: { "Accept-Encoding": "identity" },
    });
  });
  it("revalidates redirects and rejects an unsafe location", async () => {
    response("", 302, { location: "https://169.254.169.254/latest/meta-data" });
    await expect(fetchCalendar(url)).rejects.toThrow("URL");
    expect(https).toHaveBeenCalledTimes(1);
  });
  it("resolves and validates each safe redirect, bounded to three", async () => {
    response("", 302, { location: "/next" });
    response();
    expect(await fetchCalendar(url)).toBe("calendar");
    expect(dns).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 4; i++) response("", 302, { location: "/next" });
    await expect(fetchCalendar(url)).rejects.toThrow("URL");
  });
  it("rejects a private address on the redirect's new DNS answer", async () => {
    response("", 302, { location: "https://ical.booking.com/test" });
    dns
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(fetchCalendar(url)).rejects.toThrow("URL");
  });
  it("bounds advertised and streamed body sizes and rejects compression/errors", async () => {
    response("", 200, { "content-length": String(MAX_BYTES + 1) });
    await expect(fetchCalendar(url)).rejects.toThrow("SIZE");
    response("x".repeat(MAX_BYTES + 1));
    await expect(fetchCalendar(url)).rejects.toThrow("SIZE");
    response("", 200, { "content-encoding": "gzip" });
    await expect(fetchCalendar(url)).rejects.toThrow("NETWORK");
    response("secret", 500);
    await expect(fetchCalendar(url)).rejects.toThrow("NETWORK");
  });
  it("DNS failure exposes no upstream detail", async () => {
    dns.mockRejectedValue(new Error("secret URL credentials"));
    await expect(fetchCalendar(url)).rejects.toThrow(/^NETWORK$/);
  });
  it("times out even when DNS never settles", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    dns.mockImplementation(() => new Promise(() => {}));
    const result = expect(fetchCalendar(url)).rejects.toThrow("NETWORK");
    controller.abort();
    await result;
    expect(timeout).toHaveBeenCalledWith(TIMEOUT_MS);
    timeout.mockRestore();
  });
});
