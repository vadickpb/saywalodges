import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "../instrumentation";

afterEach(() => vi.restoreAllMocks());

describe("onRequestError", () => {
  it("logs route pattern and digest but not message, path or headers", () => {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => void lines.push(line));
    const err = Object.assign(new Error("db password=hunter2 for guest@example.com"), { digest: "1234567890" });
    onRequestError(
      err,
      { path: "/api/ical/SECRETTOKEN?x=1", method: "GET", headers: { authorization: "Bearer abc", cookie: "sb=1" } },
      { routerKind: "App Router", routePath: "/api/ical/[token]", routeType: "route", renderSource: undefined, revalidateReason: undefined, renderType: undefined } as never,
    );
    expect(JSON.parse(lines[0])).toEqual({
      level: "error",
      event: "request.unhandled_error",
      route: "/api/ical/[token]",
      routeType: "route",
      method: "GET",
      errorName: "Error",
      digest: "1234567890",
    });
    expect(lines[0]).not.toMatch(/SECRETTOKEN|hunter2|guest@|Bearer|cookie/);
  });
});
