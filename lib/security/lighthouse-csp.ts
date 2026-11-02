// SD-701: reads CSP violations out of a Lighthouse report. Pure and erasable-only TypeScript, so both Vitest and
// scripts/lighthouse-mobile.mjs (plain Node, type stripping) import the same code.
//
// Chrome reports a blocked script/style/image/connection as a console error (Log.entryAdded, source "security"
// or "violation", text "Refused to ... Content Security Policy directive ..."). Lighthouse's `errors-in-console`
// audit collects them from a real page load. Only CSP violations are fatal here: other console errors (a missing
// favicon, a third-party hiccup) are returned separately so they are visible without making CI flaky.

export const CONSOLE_AUDIT_ID = "errors-in-console";

export interface ConsoleItem {
  source: string;
  description: string;
}

export interface ConsoleReport {
  cspViolations: ConsoleItem[];
  otherErrors: ConsoleItem[];
}

// Every Chrome CSP message ("Refused to execute inline script because it violates the following Content
// Security Policy directive...", also "[Report Only] ...") names the policy.
export function isCspViolation(item: ConsoleItem): boolean {
  return /content security policy/i.test(item.description);
}

function toItem(raw: unknown): ConsoleItem {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return { source: text(record.source), description: text(record.description) };
}

// Throws when the audit did not really run (missing, errored, not applicable): a vacuous "no violations" must
// never pass the gate, e.g. after a Lighthouse upgrade renames the audit or `--only-audits` is dropped.
export function readConsoleReport(lhr: unknown): ConsoleReport {
  const audits = (typeof lhr === "object" && lhr !== null ? (lhr as { audits?: Record<string, unknown> }).audits : undefined) ?? {};
  const audit = audits[CONSOLE_AUDIT_ID] as { scoreDisplayMode?: string; details?: { items?: unknown } } | undefined;
  if (!audit) throw new Error(`Lighthouse report has no ${CONSOLE_AUDIT_ID} audit`);
  if (audit.scoreDisplayMode === "error" || audit.scoreDisplayMode === "notApplicable" || audit.scoreDisplayMode === "manual") {
    throw new Error(`${CONSOLE_AUDIT_ID} did not run (scoreDisplayMode=${audit.scoreDisplayMode})`);
  }
  const items = audit.details?.items;
  if (!Array.isArray(items)) throw new Error(`${CONSOLE_AUDIT_ID} has no details.items list`);
  const parsed = items.map(toItem);
  return { cspViolations: parsed.filter(isCspViolation), otherErrors: parsed.filter((i) => !isCspViolation(i)) };
}
