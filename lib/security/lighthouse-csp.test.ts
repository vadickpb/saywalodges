import { describe, expect, it } from "vitest";
import { CONSOLE_AUDIT_ID, isCspViolation, readConsoleReport } from "./lighthouse-csp";

const report = (items: unknown, scoreDisplayMode = "binary") => ({
  audits: { [CONSOLE_AUDIT_ID]: { scoreDisplayMode, details: { type: "table", items } } },
});

const INLINE =
  "Refused to execute inline script because it violates the following Content Security Policy directive: \"script-src 'self' 'nonce-abc' 'strict-dynamic'\". Either the 'unsafe-inline' keyword, a hash, or a nonce is required to enable inline execution.";
const IMAGE =
  "Refused to load the image 'https://evil.example/x.png' because it violates the following Content Security Policy directive: \"img-src 'self' data: blob:\".";
// Verbatim from Chrome (Lighthouse 13.6.0, source "security") for a blocked inline script.
const CHROME_INLINE =
  "Executing inline script violates the following Content Security Policy directive 'script-src 'self''. Either the 'unsafe-inline' keyword, a hash ('sha256-hUmDl3yY/7GaaX+Zuy8aEy8IzxgpBs7xccqYHs2/7kQ='), or a nonce ('nonce-...') is required to enable inline execution. The action has been blocked.";
const NETWORK = "Failed to load resource: the server responded with a status of 404 ()";

describe("lighthouse CSP console check", () => {
  it("passes a clean page", () => {
    expect(readConsoleReport(report([]))).toEqual({ cspViolations: [], otherErrors: [] });
  });

  it("flags script, style and image violations as CSP violations", () => {
    const { cspViolations, otherErrors } = readConsoleReport(
      report([
        { source: "security", description: INLINE },
        { source: "violation", description: IMAGE },
        { source: "console.error", description: `[Report Only] ${INLINE}` },
        { source: "security", description: CHROME_INLINE },
      ]),
    );
    expect(cspViolations).toHaveLength(4);
    expect(otherErrors).toEqual([]);
  });

  it("keeps unrelated console errors visible but not fatal", () => {
    const { cspViolations, otherErrors } = readConsoleReport(report([{ source: "network", description: NETWORK }]));
    expect(cspViolations).toEqual([]);
    expect(otherErrors).toEqual([{ source: "network", description: NETWORK }]);
  });

  it("tolerates malformed items without throwing or hiding a violation", () => {
    const { cspViolations } = readConsoleReport(report([null, 7, { description: INLINE }]));
    expect(cspViolations).toEqual([{ source: "", description: INLINE }]);
  });

  it("isCspViolation matches only policy messages", () => {
    expect(isCspViolation({ source: "security", description: INLINE })).toBe(true);
    expect(isCspViolation({ source: "network", description: NETWORK })).toBe(false);
  });

  it.each([
    ["no audits at all", {}],
    ["audit missing", { audits: {} }],
    ["audit errored", report([], "error")],
    ["audit not applicable", report([], "notApplicable")],
    ["items missing", report(undefined)],
    ["not an object", null],
  ])("refuses a vacuous pass: %s", (_name, lhr) => {
    expect(() => readConsoleReport(lhr)).toThrow();
  });
});
