import "server-only";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { createHash } from "node:crypto";
import ical, { type VEvent } from "node-ical";
import { parseDateRange } from "@/lib/domain/availability";

// Exact hosts only. No suffix matching, credentials, arbitrary ports or proxies.
export const IMPORT_HOSTS = [
  "airbnb.com",
  "www.airbnb.com",
  "ical.booking.com",
  "admin.booking.com",
  "www.booking.com",
  "www.vrbo.com",
  "vrbo.com",
];
export const MAX_BYTES = 1024 * 1024;
export const TIMEOUT_MS = 10_000;
export class ImportError extends Error {
  constructor(public readonly code: "URL" | "NETWORK" | "SIZE" | "FORMAT") {
    super(code);
  }
}
export function validateImportUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ImportError("URL");
  }
  if (
    value.length > 2000 ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !IMPORT_HOSTS.includes(url.hostname)
  )
    throw new ImportError("URL");
  return url;
}
const denied = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] satisfies [string, number][])
  denied.addSubnet(ip, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [ip, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] satisfies [string, number][])
  denied.addSubnet(ip, prefix, "ipv6");
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  return family === 4
    ? !denied.check(ip, "ipv4")
    : family === 6 && globalV6.check(ip, "ipv6") && !denied.check(ip, "ipv6");
}

// A single deadline includes DNS, TLS, headers, redirects and streamed body.
// Pin the vetted address in lookup: there is no second resolution / DNS rebinding.
export async function fetchCalendar(value: string): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    let url = validateImportUrl(value);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const addresses = await new Promise<LookupAddress[]>(
        (resolve, reject) => {
          signal.throwIfAborted();
          const abort = () => reject(new ImportError("NETWORK"));
          signal.addEventListener("abort", abort, { once: true });
          lookup(url.hostname, { all: true, verbatim: true })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", abort));
        },
      );
      if (
        !Array.isArray(addresses) ||
        !addresses.length ||
        addresses.some((a) => !isPublicAddress(a.address))
      )
        throw new ImportError("URL");
      const address = addresses[0];
      const result = await new Promise<{ location?: string; body: string }>(
        (resolve, reject) => {
          const req = request(
            url,
            {
              signal,
              agent: false,
              headers: {
                Accept: "text/calendar",
                "Accept-Encoding": "identity",
              },
              lookup: (_host, options, callback) => {
                if (options.all) callback(null, [address]);
                else callback(null, address.address, address.family);
              },
            },
            (res) => {
              const status = res.statusCode ?? 0;
              if (
                [301, 302, 303, 307, 308].includes(status) &&
                res.headers.location
              ) {
                res.destroy();
                resolve({ location: res.headers.location, body: "" });
                return;
              }
              if (
                status !== 200 ||
                (res.headers["content-encoding"] &&
                  res.headers["content-encoding"] !== "identity")
              ) {
                res.destroy();
                reject(new ImportError("NETWORK"));
                return;
              }
              if (Number(res.headers["content-length"]) > MAX_BYTES) {
                res.destroy();
                reject(new ImportError("SIZE"));
                return;
              }
              const chunks: Buffer[] = [];
              let size = 0;
              res.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_BYTES) {
                  res.destroy();
                  reject(new ImportError("SIZE"));
                } else chunks.push(chunk);
              });
              res.on("error", reject);
              res.on("end", () =>
                resolve({ body: Buffer.concat(chunks).toString("utf8") }),
              );
            },
          );
          req.on("error", reject);
          req.end();
        },
      );
      if (!result.location) return result.body;
      url = validateImportUrl(new URL(result.location, url).href);
    }
    throw new ImportError("URL");
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("NETWORK");
  }
}

export type ImportedEvent = { uid: string; start: string; end: string };
export function parseCalendar(body: string): ImportedEvent[] {
  try {
    if (Buffer.byteLength(body) > MAX_BYTES) throw new ImportError("SIZE");
    const unfolded = body.replace(/\r?\n[ \t]/g, "").trim();
    if (
      !unfolded.startsWith("BEGIN:VCALENDAR\n") &&
      !unfolded.startsWith("BEGIN:VCALENDAR\r\n")
    )
      throw new ImportError("FORMAT");
    if (
      !unfolded.endsWith("END:VCALENDAR") ||
      (unfolded.match(/^BEGIN:VCALENDAR\r?$/gm) ?? []).length !== 1 ||
      /^((RRULE|RDATE|EXDATE|RECURRENCE-ID)[;:]|BEGIN:(?!VCALENDAR|VEVENT))/im.test(
        unfolded,
      )
    )
      throw new ImportError("FORMAT");
    const stack: string[] = [];
    for (const line of unfolded.split(/\r?\n/)) {
      if (line.startsWith("BEGIN:")) {
        const component = line.slice(6);
        if (
          (component === "VCALENDAR" && stack.length !== 0) ||
          (component === "VEVENT" &&
            (stack.length !== 1 || stack[0] !== "VCALENDAR"))
        )
          throw new ImportError("FORMAT");
        stack.push(component);
      } else if (line.startsWith("END:")) {
        if (stack.pop() !== line.slice(4)) throw new ImportError("FORMAT");
      } else if (!stack.length) throw new ImportError("FORMAT");
    }
    if (stack.length) throw new ImportError("FORMAT");
    const rawEvents = [
      ...unfolded.matchAll(/^BEGIN:VEVENT\r?\n([\s\S]*?)^END:VEVENT\r?$/gm),
    ];
    if (
      rawEvents.length > 2000 ||
      rawEvents.length !==
        (unfolded.match(/^BEGIN:VEVENT\r?$/gm) ?? []).length ||
      rawEvents.length !== (unfolded.match(/^END:VEVENT\r?$/gm) ?? []).length
    )
      throw new ImportError("FORMAT");
    const seen = new Set<string>();
    const events: ImportedEvent[] = [];
    // Parse each bounded component with node-ical, retaining its validated source
    // dates. A floating civil date must never pass through a timezone conversion
    // or Date normalization (some host zones even skip entire calendar days).
    for (const [component, raw] of rawEvents) {
      const dates = [
        ...raw.matchAll(
          /^(DTSTART|DTEND);VALUE=DATE:(\d{4})(\d{2})(\d{2})\r?$/gm,
        ),
      ];
      if (
        dates.length !== 2 ||
        dates.filter((d) => d[1] === "DTSTART").length !== 1 ||
        dates.filter((d) => d[1] === "DTEND").length !== 1 ||
        (raw.match(/^DT(?:START|END)[;:]/gm) ?? []).length !== 2 ||
        (raw.match(/^UID:/gm) ?? []).length !== 1
      )
        throw new ImportError("FORMAT");
      const date = (name: string) => {
        const d = dates.find((d) => d[1] === name)!;
        return `${d[2]}-${d[3]}-${d[4]}`;
      };
      const start = date("DTSTART");
      const end = date("DTEND");
      if (!parseDateRange(start, end).ok) throw new ImportError("FORMAT");
      const parsed = Object.values(
        ical.sync.parseICS(
          `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${component.replace(/\r/g, "")}\r\nEND:VCALENDAR\r\n`,
        ),
      ).filter((event): event is VEvent => event?.type === "VEVENT");
      if (parsed.length !== 1) throw new ImportError("FORMAT");
      const event = parsed[0];
      if (
        !event.uid ||
        event.uid.length > 1000 ||
        seen.has(event.uid) ||
        !event.start?.dateOnly ||
        !event.end?.dateOnly
      )
        throw new ImportError("FORMAT");
      seen.add(event.uid);
      if (event.status === "CANCELLED") continue;
      events.push({
        uid: createHash("sha256").update(event.uid).digest("hex"),
        start,
        end,
      });
    }
    return events.sort((a, b) => a.uid.localeCompare(b.uid));
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("FORMAT");
  }
}
