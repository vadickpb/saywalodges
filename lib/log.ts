// Structured server logs (SD-606). One JSON line per event on stdout/stderr, which Vercel
// Logs already collect and index, so no vendor or paid service is involved.
//
// Safe by construction, not by scrubbing: a log entry can only carry the closed set of fields
// below, and every value must match a strict, short pattern or it is dropped. Free text never
// gets in: no `error.message`, URLs, headers, request bodies, emails, guest data or keys.
// To log something new, add it to FIELDS on purpose.

export type LogLevel = "info" | "warn" | "error";

// Dotted lowercase identifiers: `cron.expire_holds.failed`.
const IDENT = /^[a-z][a-z0-9_.]{0,63}$/;
// Route patterns as Next reports them (`/api/ical/[token]`), never a concrete URL.
const ROUTE = /^\/[A-Za-z0-9_\-/[\].()@]{0,127}$/;
// Short machine codes: Postgres SQLSTATE (`23P01`), error class names (`TypeError`), digests.
const CODE = /^[A-Za-z0-9_.-]{1,40}$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Check = (value: unknown) => boolean;
const matches = (re: RegExp): Check => (v) => typeof v === "string" && re.test(v);
const count: Check = (v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

const FIELDS = {
  requestId: matches(REQUEST_ID),
  route: matches(ROUTE),
  method: matches(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/),
  status: (v) => count(v) && (v as number) >= 100 && (v as number) <= 599,
  outcome: matches(IDENT),
  code: matches(CODE),
  errorName: matches(CODE),
  digest: matches(CODE),
  routeType: matches(IDENT),
  count,
  durationMs: count,
} as const satisfies Record<string, Check>;

export type LogFields = { [K in keyof typeof FIELDS]?: string | number };

const SINKS: Record<LogLevel, (line: string) => void> = {
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

export function sanitizeFields(fields: Record<string, unknown>): Record<string, string | number> {
  const safe: Record<string, string | number> = {};
  for (const [key, check] of Object.entries(FIELDS)) {
    if (!Object.hasOwn(fields, key)) continue;
    const value = fields[key];
    if (check(value)) safe[key] = value as string | number;
  }
  return safe;
}

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (!IDENT.test(event)) event = "invalid_event";
  SINKS[level](JSON.stringify({ level, event, ...sanitizeFields(fields) }));
}

// A fresh id per request, generated here and never taken from client input.
export const newRequestId = (): string => crypto.randomUUID();

// Only the class name leaves: it says what failed (`TypeError`) without leaking the message.
export function errorName(error: unknown): string | undefined {
  const name = error instanceof Error ? error.name : undefined;
  return name && CODE.test(name) ? name : undefined;
}
