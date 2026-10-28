import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

vi.mock("server-only", () => ({}));
import {
  confirmRecurring,
  createTemplate,
  deleteTemplate,
  getTemplate,
  listConfirmed,
  listTemplates,
  setTemplateActive,
  updateTemplate,
} from "./finance-recurring";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const CAT = "0bcf73ac-1c1d-4418-9982-2edde9a3e50c";
type Result = { data: unknown; error: unknown };

function fake(opts: { tables?: Record<string, Result[]>; rpc?: Result }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const queues = Object.fromEntries(Object.entries(opts.tables ?? {}).map(([k, v]) => [k, [...v]]));
  const from = vi.fn((table: string) => {
    const take = (): Result => queues[table]?.shift() ?? { data: [], error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "insert", "update", "delete"]) {
      b[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args });
        return b;
      });
    }
    b.single = vi.fn(() => Promise.resolve(take()));
    b.maybeSingle = vi.fn(() => Promise.resolve(take()));
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(take()).then(resolve);
    return b;
  });
  const rpc = vi.fn((...args: unknown[]) => {
    calls.push({ method: "rpc", args });
    return Promise.resolve(opts.rpc ?? { data: null, error: null });
  });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, calls };
}
const silent = () => vi.spyOn(console, "error").mockImplementation(() => {});

const row = (over: Record<string, unknown> = {}) => ({
  id: "t1", name: "Agua", category_id: CAT, unit_id: null, day_of_month: 10, estimated_cents: 5000, currency: "PEN",
  counterparty: "Sedapal", payment_method: "bank_transfer", active: true, starts_month: "2027-03-01", ...over,
});
const form = { name: "Agua", categoryId: CAT, unitId: undefined, dayOfMonth: 10, amount: 5000, currency: "PEN" as const, counterparty: undefined, paymentMethod: undefined };

describe("templates", () => {
  it("lists them for the org, with the month as YYYY-MM", async () => {
    const { client, calls } = fake({ tables: { finance_recurring: [{ data: [row()], error: null }] } });
    expect(await listTemplates(client, ORG)).toEqual([
      { id: "t1", name: "Agua", categoryId: CAT, unitId: null, dayOfMonth: 10, estimatedCents: 5000, currency: "PEN", counterparty: "Sedapal", paymentMethod: "bank_transfer", active: true, startsMonth: "2027-03" },
    ]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["org_id", ORG]);
  });

  it("gets one or null, and throws a generic error on failure", async () => {
    expect((await getTemplate(fake({ tables: { finance_recurring: [{ data: row(), error: null }] } }).client, ORG, "t1"))?.id).toBe("t1");
    expect(await getTemplate(fake({ tables: { finance_recurring: [{ data: null, error: null }] } }).client, ORG, "x")).toBeNull();
    silent();
    const bad = { data: null, error: { message: "secret db detail" } };
    await expect(listTemplates(fake({ tables: { finance_recurring: [bad] } }).client, ORG)).rejects.toThrow("No se pudieron cargar los gastos recurrentes.");
    await expect(getTemplate(fake({ tables: { finance_recurring: [bad] } }).client, ORG, "t1")).rejects.toThrow("No se pudo cargar el gasto recurrente.");
  });

  it("creates with the session org and blank optionals as null", async () => {
    const { client, calls } = fake({ tables: { finance_recurring: [{ data: { id: "new" }, error: null }] } });
    expect(await createTemplate(client, ORG, form)).toEqual({ ok: true, id: "new" });
    expect(calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      org_id: ORG, name: "Agua", category_id: CAT, unit_id: null, day_of_month: 10, estimated_cents: 5000, counterparty: null, payment_method: null,
    });
    silent();
    expect(await createTemplate(fake({ tables: { finance_recurring: [{ data: null, error: { message: "x" } }] } }).client, ORG, form)).toEqual({ ok: false });
  });

  it("updates, pauses and deletes only when exactly one row is affected", async () => {
    const one = { data: [{ id: "t1" }], error: null };
    const none = { data: [], error: null };
    silent();
    expect(await updateTemplate(fake({ tables: { finance_recurring: [one] } }).client, ORG, "t1", form)).toEqual({ ok: true });
    expect(await updateTemplate(fake({ tables: { finance_recurring: [none] } }).client, ORG, "t1", form)).toEqual({ ok: false });
    expect(await setTemplateActive(fake({ tables: { finance_recurring: [one] } }).client, ORG, "t1", false)).toEqual({ ok: true });
    expect(await setTemplateActive(fake({ tables: { finance_recurring: [none] } }).client, ORG, "t1", false)).toEqual({ ok: false });
    expect(await deleteTemplate(fake({ tables: { finance_recurring: [one] } }).client, ORG, "t1")).toEqual({ ok: true });
    expect(await deleteTemplate(fake({ tables: { finance_recurring: [{ data: null, error: { message: "x" } }] } }).client, ORG, "t1")).toEqual({ ok: false });
  });
});

describe("listConfirmed", () => {
  it("groups the confirmed template ids by month and starts every month empty", async () => {
    const runs = [{ recurring_id: "t1", month: "2027-03-01" }, { recurring_id: "t2", month: "2027-03-01" }, { recurring_id: "t1", month: "2027-02-01" }];
    const { client, calls } = fake({ tables: { finance_recurring_runs: [{ data: runs, error: null }] } });
    const out = await listConfirmed(client, ORG, ["2027-03", "2027-02", "2027-01"]);
    expect([...(out.get("2027-03") ?? [])]).toEqual(["t1", "t2"]);
    expect([...(out.get("2027-02") ?? [])]).toEqual(["t1"]);
    expect(out.get("2027-01")?.size).toBe(0);
    expect(calls.find((c) => c.method === "in")?.args).toEqual(["month", ["2027-03-01", "2027-02-01", "2027-01-01"]]);
  });

  it("skips the query for invalid months and throws a generic error on failure", async () => {
    const { client, calls } = fake({});
    expect((await listConfirmed(client, ORG, ["garbage"])).get("garbage")?.size).toBe(0);
    expect(calls).toHaveLength(0);
    silent();
    await expect(listConfirmed(fake({ tables: { finance_recurring_runs: [{ data: null, error: { message: "x" } }] } }).client, ORG, ["2027-03"])).rejects.toThrow(
      "No se pudieron cargar las confirmaciones."
    );
  });
});

describe("confirmRecurring", () => {
  const input = { recurringId: "t1", month: "2027-03-01", amount: 6120, currency: "USD" as const, fxRate: "3.75", occurredOn: undefined };
  it("calls the idempotent function with the session org and returns what it says", async () => {
    const { client, calls } = fake({ rpc: { data: [{ out_entry_id: "e1", out_created: false }], error: null } });
    expect(await confirmRecurring(client, ORG, input)).toEqual({ ok: true, entryId: "e1", created: false });
    expect(calls[0]).toEqual({
      method: "rpc",
      args: ["confirm_recurring_expense", { p_org_id: ORG, p_recurring_id: "t1", p_month: "2027-03-01", p_amount_cents: 6120, p_currency: "USD", p_fx_rate_pen: 3.75, p_occurred_on: undefined }],
    });
  });
  it("fails generically on an error or an empty answer", async () => {
    silent();
    expect(await confirmRecurring(fake({ rpc: { data: null, error: { message: "secret" } } }).client, ORG, input)).toEqual({ ok: false });
    expect(await confirmRecurring(fake({ rpc: { data: [], error: null } }).client, ORG, input)).toEqual({ ok: false });
  });
});
