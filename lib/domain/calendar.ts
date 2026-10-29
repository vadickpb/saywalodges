import { z } from "zod";
import { parseDateRange, type DateRange } from "./availability";
import { addDays, dayOfWeek, daysBetween, monthBounds, monthOf, type IsoMonth } from "./dates";

export const MAX_MANUAL_NIGHTS = 366;
export const manualBlockSchema = z.object({
  unitId: z.uuid("Selecciona una unidad."),
  start: z.string(),
  end: z.string(),
  note: z.string().trim().max(500, "La nota admite hasta 500 caracteres."),
}).superRefine((input, ctx) => {
  const parsed = parseDateRange(input.start, input.end);
  if (!parsed.ok) ctx.addIssue({ code: "custom", path: ["end"], message: "Ingresa fechas válidas; la salida debe ser posterior al inicio." });
  else if (daysBetween(input.start, input.end) > MAX_MANUAL_NIGHTS) ctx.addIssue({ code: "custom", path: ["end"], message: "El bloqueo admite hasta 366 noches." });
});
export type ManualBlockInput = z.infer<typeof manualBlockSchema>;
export type CalendarSource = "booking" | "ical" | "manual";
export type CalendarBlock = DateRange & { id: string; unitId: string; source: CalendarSource; note: string | null };

// SD-301 has no channel metadata yet. Never infer channels from notes, UUIDs or external UIDs.
export const CALENDAR_SOURCES = {
  booking: { label: "Directa", short: "D", className: "bg-emerald-100 text-emerald-950 border-emerald-500" },
  airbnb: { label: "Airbnb", short: "A", className: "bg-rose-100 text-rose-950 border-rose-500" },
  bookingChannel: { label: "Booking", short: "B", className: "bg-blue-100 text-blue-950 border-blue-500" },
  manual: { label: "Manual", short: "M", className: "bg-amber-100 text-amber-950 border-amber-500" },
  ical: { label: "iCal · canal sin identificar", short: "I", className: "bg-violet-100 text-violet-950 border-violet-500" },
};

/** Decode the finite canonical date range returned by PostgREST; fail closed on unexpected data. */
export function parseCalendarPeriod(value: unknown): DateRange {
  const match = typeof value === "string" && /^\["?(\d{4}-\d{2}-\d{2})"?,"?(\d{4}-\d{2}-\d{2})"?\)$/.exec(value);
  const result = match && parseDateRange(match[1], match[2]);
  if (!result || !result.ok) throw new Error("Invalid calendar period");
  return result.range;
}

export function calendarMonth(month: IsoMonth) {
  const bounds = monthBounds(month);
  return {
    ...bounds,
    dates: Array.from({ length: bounds.days }, (_, i) => addDays(bounds.start, i)),
    offset: (dayOfWeek(bounds.start) + 6) % 7,
    previous: month === "0001-01" ? null : monthOf(addDays(bounds.start, -1)),
    next: bounds.endExclusive ? monthOf(bounds.endExclusive) : null,
  };
}
