import { afterEach, describe, expect, it, vi } from "vitest";
import { errorName, log, newRequestId, sanitizeFields } from "./log";

afterEach(() => vi.restoreAllMocks());

const capture = () => {
  const lines: string[] = [];
  for (const sink of ["log", "warn", "error"] as const) {
    vi.spyOn(console, sink).mockImplementation((line: string) => void lines.push(line));
  }
  return lines;
};

describe("sanitizeFields", () => {
  it("keeps only allow-listed fields with safe values", () => {
    const requestId = newRequestId();
    expect(sanitizeFields({ requestId, route: "/api/ical/[token]", status: 500, count: 3, errorName: "TypeError", code: "23P01" })).toEqual({
      requestId,
      route: "/api/ical/[token]",
      status: 500,
      count: 3,
      errorName: "TypeError",
      code: "23P01",
    });
  });

  it("drops unknown fields such as PII or credentials", () => {
    const out = sanitizeFields({ email: "guest@example.com", authorization: "Bearer abc", token: "t", body: "{}", message: "boom", status: 401 });
    expect(out).toEqual({ status: 401 });
  });

  it("drops values that look like free text, URLs, emails or secrets", () => {
    const out = sanitizeFields({
      route: "/api/ical/abcdef?token=secret",
      code: "duplicate key value violates constraint",
      errorName: "guest@example.com",
      digest: "https://x.test/?k=1",
      requestId: "not-a-uuid",
      outcome: "Has Spaces",
      method: "get",
    });
    expect(out).toEqual({});
  });

  it("drops out-of-range or non-integer numbers and wrong types", () => {
    expect(sanitizeFields({ status: 42, count: -1, durationMs: 1.5 })).toEqual({});
    expect(sanitizeFields({ status: "500", count: "3", route: 5 })).toEqual({});
  });
});

describe("log", () => {
  it("writes one JSON line per level to the matching sink", () => {
    const lines = capture();
    log("info", "cron.expire_holds.completed", { status: 200, count: 2 });
    log("warn", "cron.expire_holds.unauthorized", { status: 401 });
    log("error", "cron.expire_holds.failed", { status: 500 });
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { level: "info", event: "cron.expire_holds.completed", status: 200, count: 2 },
      { level: "warn", event: "cron.expire_holds.unauthorized", status: 401 },
      { level: "error", event: "cron.expire_holds.failed", status: 500 },
    ]);
  });

  it("never serializes extra fields even when forced past the types", () => {
    const lines = capture();
    log("error", "x.y", { status: 500, email: "a@b.co", message: "secret" } as never);
    expect(lines[0]).not.toMatch(/a@b\.co|secret/);
  });

  it("replaces an unsafe event name", () => {
    const lines = capture();
    log("error", "failed for guest@example.com");
    expect(JSON.parse(lines[0]).event).toBe("invalid_event");
  });
});

describe("errorName", () => {
  it("returns the class name, never the message", () => {
    expect(errorName(new TypeError("secret sk_live_123"))).toBe("TypeError");
    expect(errorName("a string")).toBeUndefined();
  });
  it("ignores unsafe custom names", () => {
    const e = new Error("x");
    e.name = "user@example.com";
    expect(errorName(e)).toBeUndefined();
  });
});

describe("newRequestId", () => {
  it("is a unique uuid", () => {
    expect(newRequestId()).not.toBe(newRequestId());
    expect(sanitizeFields({ requestId: newRequestId() })).toHaveProperty("requestId");
  });
});
