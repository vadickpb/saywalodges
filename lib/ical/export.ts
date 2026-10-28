import { z } from "zod";

// iCalendar (RFC 5545) writer for the per-channel export (SD-304). Pure: no I/O,
// no clock (the caller passes `now`). The calendar says WHEN a unit is occupied
// and nothing else - every event is called "Reservado", with no guest, note or
// amount - so the same file can be handed to Airbnb, Booking or Google Calendar.

// What public.get_ical_export returns (jsonb), validated before it is trusted.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const exportPayloadSchema = z.object({
  unit: z.string(), // the database already bounds the name; a long one must never break the feed
  channel: z.string(),
  blocks: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/), starts: isoDate, ends: isoDate })),
});
export type ExportPayload = z.infer<typeof exportPayloadSchema>;

export type IcsInput = { name: string; events: ExportPayload["blocks"]; now: Date };

const CRLF = "\r\n";
const MAX_OCTETS = 75;

// TEXT values: backslash, semicolon, comma and newlines are escaped; other
// control characters are dropped.
function escapeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Content lines are folded at 75 octets (not characters): break before the limit,
// never inside a multi-byte sequence, and continue the next line with one space.
function fold(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = lines.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1; // continuation lines start with a space
    if (octets + size > limit) {
      lines.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  lines.push(current);
  return lines.map((l, i) => (i === 0 ? l : ` ${l}`)).join(CRLF);
}

// "2027-03-05" -> "20270305" (DATE value; DTEND is exclusive, like the stay range).
function dateValue(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`invalid date ${iso}`);
  return iso.replace(/-/g, "");
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs({ name, events, now }: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Saywa Direct//Calendar//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@saywa.direct`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${dateValue(event.starts)}`,
      `DTEND;VALUE=DATE:${dateValue(event.ends)}`,
      "SUMMARY:Reservado",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}
