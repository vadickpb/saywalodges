import { z } from "zod";

// Lead form of the HostStay vendor site (SD-1111). Pure validation + anti-abuse
// checks; the action wires them to email. No prices or amounts are accepted.
export const LEAD_MIN_FILL_MS = 3_000;
export const LEAD_MAX_FILL_MS = 6 * 60 * 60 * 1000;
export const LEAD_WINDOW_MS = 60 * 60 * 1000;
export const LEAD_MAX_PER_WINDOW = 5;

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f  ]/g;
const clean = (max: number) => z.string().transform((v) => v.replace(CONTROL_CHARS, " ").trim()).pipe(z.string().max(max));

export const leadSchema = z.object({
  name: clean(100).pipe(z.string().min(2)),
  email: z.string().trim().pipe(z.email().max(254)),
  phone: clean(30).pipe(z.string().regex(/^[0-9+()\-\s]*$/)).optional(),
  properties: z.enum(["1", "2-3", "4+"]),
  package: z.enum(["base", "pro", "unsure"]),
  message: clean(1000).optional(),
  // Anti-abuse: `website` is a honeypot, `startedAt` is when the form rendered.
  website: z.string().max(200).optional(),
  startedAt: z.coerce.number().int(),
});
export type LeadInput = z.infer<typeof leadSchema>;

export type LeadVerdict = "ok" | "bot";
export function leadVerdict(input: Pick<LeadInput, "website" | "startedAt">, now: number): LeadVerdict {
  if (input.website) return "bot";
  const elapsed = now - input.startedAt;
  return elapsed < LEAD_MIN_FILL_MS || elapsed > LEAD_MAX_FILL_MS ? "bot" : "ok";
}

// Best-effort per-instance limiter (serverless instances do not share memory); the
// honeypot, the minimum fill time and the recipient being only the owner bound the damage.
export function createLeadLimiter(max = LEAD_MAX_PER_WINDOW, windowMs = LEAD_WINDOW_MS) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    return true;
  };
}
