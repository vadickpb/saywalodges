import { assertIsoDate, daysInMonth } from "./dates";

export type SpecialDateStatus = "available" | "occupied" | "inquire";
export type PublicLanguage = "es" | "en";

export function resolveSpecialDateStatus(availability: boolean | null, totalCents: number | null): SpecialDateStatus {
  if (availability === false) return "occupied";
  if (availability === true && totalCents !== null) return "available";
  return "inquire";
}

export function specialDateHorizon(today: string): string {
  const { year, month, day } = assertIsoDate(today);
  const monthIndex = year * 12 + (month - 1) + 18;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

const MONTHS = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
} as const;

/** Formats the check-in and check-out days of a half-open stay range. */
export function formatSpecialDateRange(start: string, end: string, lang: PublicLanguage): string {
  const from = assertIsoDate(start);
  const to = assertIsoDate(end);
  const startMonth = MONTHS[lang][from.month - 1];
  const endMonth = MONTHS[lang][to.month - 1];
  if (lang === "es") {
    return from.year === to.year && from.month === to.month
      ? `${from.day}–${to.day} ${startMonth}`
      : `${from.day} ${startMonth} – ${to.day} ${endMonth}`;
  }
  return from.year === to.year && from.month === to.month
    ? `${startMonth} ${from.day}–${to.day}`
    : `${startMonth} ${from.day} – ${endMonth} ${to.day}`;
}

export function publicSpecialDateName(names: { es: string; en: string }, lang: PublicLanguage): string {
  return names[lang] || names[lang === "es" ? "en" : "es"];
}
