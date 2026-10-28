import { z } from "zod";
import { positiveMoneySchema } from "./finance";
import { counterparty, currency, currencyAndRate, fxRate, isoDate, optional, paymentMethod, uuid } from "./finance-forms";
import { monthRange, shiftMonth } from "./finance-view";

// Recurring expenses (SD-806), pure. A template says "about X on day D every
// month"; a month is PENDING until the owner confirms it with the real amount.
// Nothing here knows the clock: the current month is always a parameter.

export type RecurringTemplate = {
  id: string;
  name: string;
  categoryId: string;
  unitId: string | null;
  dayOfMonth: number; // 1..28
  estimatedCents: number;
  currency: "PEN" | "USD";
  counterparty: string | null;
  paymentMethod: string | null;
  active: boolean;
  startsMonth: string; // YYYY-MM
};

export type PendingExpense = { template: RecurringTemplate; month: string; dueOn: string };

// 6120 -> "61.20": the text a money input shows (the form parses it back exactly).
export function centsToText(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

// "2027-03" + 10 -> "2027-03-10". Days are 1..28, so the date always exists.
export function dueDate(month: string, dayOfMonth: number): string {
  return `${month}-${String(dayOfMonth).padStart(2, "0")}`;
}

const sortKey = (p: PendingExpense) => `${p.dueOn} ${p.template.name}`; // code-unit order, no locale

// What still needs confirming in `month`: active templates that have started,
// not yet confirmed, and never a month that has not begun (a future bill cannot
// be confirmed). Sorted by due date, then name, so the list is stable.
export function pendingForMonth(
  templates: readonly RecurringTemplate[],
  confirmedIds: ReadonlySet<string>,
  month: string,
  currentMonth: string
): PendingExpense[] {
  if (monthRange(month) === null || month > currentMonth) return [];
  return templates
    .filter((t) => t.active && t.startsMonth <= month && !confirmedIds.has(t.id))
    .map((template) => ({ template, month, dueOn: dueDate(month, template.dayOfMonth) }))
    .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
}

// Months before `month` (back to `from`) that still have unconfirmed templates:
// the "you forgot last month" reminder. Bounded to `limit` months.
export function overdueMonths(
  templates: readonly RecurringTemplate[],
  confirmedByMonth: ReadonlyMap<string, ReadonlySet<string>>,
  currentMonth: string,
  limit = 12
): string[] {
  const out: string[] = [];
  for (let i = 1; i <= limit; i += 1) {
    const month = shiftMonth(currentMonth, -i);
    if (pendingForMonth(templates, confirmedByMonth.get(month) ?? new Set(), month, currentMonth).length > 0) out.push(month);
  }
  return out;
}

// ─── Forms ──────────────────────────────────────────────────────────────────

const name = z.string().trim().min(1, "Ingresa un nombre").max(120, "Máximo 120 caracteres");
const day = z.coerce
  .number({ error: "Usa un número entero" })
  .int("Usa un número entero")
  .min(1, "Entre 1 y 28")
  .max(28, "Entre 1 y 28");

export const templateFormSchema = z.object({
  name,
  categoryId: uuid,
  unitId: optional(uuid),
  dayOfMonth: day,
  amount: positiveMoneySchema,
  currency,
  counterparty,
  paymentMethod,
});
export type TemplateForm = z.infer<typeof templateFormSchema>;

// month: first day of the month being confirmed ("2027-03-01"); occurredOn is
// optional (default: the template's day) and must fall inside that month.
export const confirmFormSchema = z
  .object({
    recurringId: uuid,
    month: isoDate,
    amount: positiveMoneySchema,
    currency,
    fxRate: optional(fxRate),
    occurredOn: optional(isoDate),
  })
  .superRefine(currencyAndRate)
  .superRefine((value, ctx) => {
    if (!value.month.endsWith("-01")) {
      ctx.addIssue({ code: "custom", path: ["month"], message: "Mes inválido" });
      return;
    }
    const range = monthRange(value.month.slice(0, 7));
    if (value.occurredOn !== undefined && range !== null && (value.occurredOn < range.from || value.occurredOn >= range.toExclusive)) {
      ctx.addIssue({ code: "custom", path: ["occurredOn"], message: "La fecha debe estar dentro del mes" });
    }
  });
export type ConfirmForm = z.infer<typeof confirmFormSchema>;
