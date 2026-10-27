import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

vi.mock("server-only", () => ({}));
import {
  LEDGER_LIMIT,
  createEntry,
  createRental,
  deleteEntry,
  getCleaningDefaults,
  getEntry,
  getLastFxRate,
  listCategories,
  listEntries,
  listLinkedCosts,
  removeReceipt,
  signReceipt,
  updateEntry,
  uploadReceipt,
} from "./finance";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const CAT = "0bcf73ac-1c1d-4418-9982-2edde9a3e50c";
type Result = { data: unknown; error: unknown };

// A recording fake of the Supabase client: every builder call is logged in
// `order`, and results are consumed per table in call order.
function fake(opts: {
  tables?: Record<string, Result[]>;
  rpc?: Result;
  upload?: { error: unknown };
  remove?: { data?: unknown[]; error: unknown };
  sign?: { data: { signedUrl: string } | null; error: unknown };
}) {
  const order: string[] = [];
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const queues = Object.fromEntries(Object.entries(opts.tables ?? {}).map(([k, v]) => [k, [...v]]));
  const from = vi.fn((table: string) => {
    const take = (): Result => queues[table]?.shift() ?? { data: [], error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lt", "is", "not", "in", "order", "limit", "insert", "update", "delete"]) {
      b[m] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method: m, args });
        if (m === "insert" || m === "update" || m === "delete") order.push(`${m}:${table}`);
        return b;
      });
    }
    b.single = vi.fn(() => Promise.resolve(take()));
    b.maybeSingle = vi.fn(() => Promise.resolve(take()));
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(take()).then(resolve);
    return b;
  });
  const upload = vi.fn(() => {
    order.push("storage:upload");
    return Promise.resolve(opts.upload ?? { error: null });
  });
  const remove = vi.fn((paths: string[]) => {
    order.push("storage:remove");
    return Promise.resolve(opts.remove ?? { data: paths.map((name) => ({ name })), error: null });
  });
  const createSignedUrl = vi.fn(() => Promise.resolve(opts.sign ?? { data: { signedUrl: "https://signed.example/x" }, error: null }));
  const rpc = vi.fn(() => Promise.resolve(opts.rpc ?? { data: null, error: null }));
  const client = {
    from,
    rpc,
    storage: { from: vi.fn(() => ({ upload, remove, createSignedUrl })) },
  } as unknown as SupabaseClient<Database>;
  return { client, order, calls, upload, remove, createSignedUrl, rpc };
}

const silent = () => vi.spyOn(console, "error").mockImplementation(() => {});

const row = (over: Record<string, unknown> = {}) => ({
  id: "e1", kind: "expense", category_id: CAT, occurred_on: "2027-03-02", amount_cents: 4550, currency: "PEN",
  fx_rate_pen: null, amount_pen_cents: 4550, unit_id: null, payment_method: "cash", counterparty: "Sedapal", note: null,
  stay_start: null, stay_end: null, channel: null, guests: null, related_entry_id: null, receipt_path: null, created_by: "u1",
  ...over,
});

const form = (over: Record<string, unknown> = {}) =>
  ({ kind: "expense", occurredOn: "2027-03-02", amount: 4550, currency: "PEN", categoryId: CAT, ...over }) as never;

describe("listEntries", () => {
  it("maps rows, hides the receipt path behind hasReceipt and filters by month", async () => {
    const { client, calls } = fake({ tables: { finance_entries: [{ data: [row({ receipt_path: `${ORG}/receipts/a.pdf` })], error: null }] } });
    const r = await listEntries(client, ORG, { month: "2027-03", kind: "expense", categoryId: CAT, unitId: "u", general: true });
    expect(r.entries[0]).toMatchObject({ id: "e1", amountCents: 4550, amountPenCents: 4550, hasReceipt: true, counterparty: "Sedapal" });
    expect(r.entries[0]).not.toHaveProperty("receiptPath");
    expect(r.truncated).toBe(false);
    const methods = calls.map((c) => c.method);
    expect(methods).toEqual(expect.arrayContaining(["gte", "lt", "is"]));
    expect(calls.find((c) => c.method === "gte")?.args).toEqual(["occurred_on", "2027-03-01"]);
    expect(calls.find((c) => c.method === "lt")?.args).toEqual(["occurred_on", "2027-04-01"]);
  });

  it("flags truncation beyond the limit and ignores an invalid month", async () => {
    const many = Array.from({ length: LEDGER_LIMIT + 1 }, (_, i) => row({ id: `e${i}` }));
    const { client, calls } = fake({ tables: { finance_entries: [{ data: many, error: null }] } });
    const r = await listEntries(client, ORG, { month: "garbage" });
    expect(r.truncated).toBe(true);
    expect(r.entries).toHaveLength(LEDGER_LIMIT);
    expect(calls.some((c) => c.method === "gte")).toBe(false);
  });

  it("throws a generic error and refuses a row without a PEN amount", async () => {
    silent();
    await expect(listEntries(fake({ tables: { finance_entries: [{ data: null, error: { message: "secret db detail" } }] } }).client, ORG)).rejects.toThrow(
      "No se pudieron cargar los movimientos."
    );
    const corrupt = fake({ tables: { finance_entries: [{ data: [row({ amount_pen_cents: null })], error: null }] } });
    await expect(listEntries(corrupt.client, ORG)).rejects.toThrow("has no PEN amount");
  });
});

describe("small reads", () => {
  it("lists categories and throws a generic error on failure", async () => {
    silent();
    const ok = fake({ tables: { finance_categories: [{ data: [{ id: "c", kind: "income", name: "Alquiler", system_key: "rental", archived: false }], error: null }] } });
    expect(await listCategories(ok.client, ORG)).toEqual([{ id: "c", kind: "income", name: "Alquiler", systemKey: "rental", archived: false }]);
    await expect(listCategories(fake({ tables: { finance_categories: [{ data: null, error: {} }] } }).client, ORG)).rejects.toThrow("categorías");
  });

  it("gets one entry, or null", async () => {
    silent();
    expect((await getEntry(fake({ tables: { finance_entries: [{ data: row(), error: null }] } }).client, ORG, "e1"))?.id).toBe("e1");
    expect(await getEntry(fake({ tables: { finance_entries: [{ data: null, error: null }] } }).client, ORG, "e1")).toBeNull();
    await expect(getEntry(fake({ tables: { finance_entries: [{ data: null, error: {} }] } }).client, ORG, "e1")).rejects.toThrow("movimiento");
  });

  it("returns the last exchange rate or null", async () => {
    silent();
    expect(await getLastFxRate(fake({ tables: { finance_entries: [{ data: [{ fx_rate_pen: 3.75 }], error: null }] } }).client, ORG, "USD")).toBe(3.75);
    expect(await getLastFxRate(fake({ tables: { finance_entries: [{ data: [], error: null }] } }).client, ORG, "USD")).toBeNull();
    expect(await getLastFxRate(fake({ tables: { finance_entries: [{ data: null, error: {} }] } }).client, ORG, "USD")).toBeNull();
  });

  it("reads the suggested cleaning costs with the property currency", async () => {
    silent();
    const ok = fake({
      tables: {
        finance_unit_settings: [{ data: [{ unit_id: "u1", cleaning_cost_cents: 8000 }, { unit_id: "u2", cleaning_cost_cents: null }], error: null }],
        properties: [{ data: { currency: "USD" }, error: null }],
      },
    });
    expect(await getCleaningDefaults(ok.client, ORG)).toEqual({ currency: "USD", byUnit: { u1: 8000 } });
    const bad = fake({ tables: { finance_unit_settings: [{ data: null, error: {} }], properties: [{ data: null, error: null }] } });
    expect(await getCleaningDefaults(bad.client, ORG)).toEqual({ currency: null, byUnit: {} });
  });

  it("lists linked costs only for the given rentals", async () => {
    silent();
    const { client, calls } = fake({ tables: { finance_entries: [{ data: [row({ related_entry_id: "r1" })], error: null }] } });
    expect(await listLinkedCosts(client, ORG, [])).toEqual([]);
    expect(calls).toHaveLength(0); // no query for an empty list
    expect((await listLinkedCosts(client, ORG, ["r1"]))[0].relatedEntryId).toBe("r1");
    await expect(listLinkedCosts(fake({ tables: { finance_entries: [{ data: null, error: {} }] } }).client, ORG, ["r1"])).rejects.toThrow("costos");
  });
});

describe("createEntry", () => {
  it("inserts under the org with the form's kind and returns the id", async () => {
    const { client, calls } = fake({ tables: { finance_entries: [{ data: { id: "new" }, error: null }] } });
    const r = await createEntry(client, ORG, form({ currency: "USD", fxRate: "3.75", unitId: "u1", note: "n" }), `${ORG}/receipts/a.jpg`);
    expect(r).toEqual({ ok: true, id: "new" });
    expect(calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      org_id: ORG, kind: "expense", category_id: CAT, amount_cents: 4550, currency: "USD", fx_rate_pen: 3.75,
      unit_id: "u1", note: "n", receipt_path: `${ORG}/receipts/a.jpg`,
    });
  });

  it("stores nulls for omitted optionals and leaves the receipt out when none is given", async () => {
    const { client, calls } = fake({ tables: { finance_entries: [{ data: { id: "new" }, error: null }] } });
    await createEntry(client, ORG, form());
    const payload = calls.find((c) => c.method === "insert")?.args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ fx_rate_pen: null, unit_id: null, payment_method: null, counterparty: null, note: null });
    expect(payload).not.toHaveProperty("receipt_path");
  });

  it("reports a generic failure", async () => {
    silent();
    const r = await createEntry(fake({ tables: { finance_entries: [{ data: null, error: { message: "rls detail" } }] } }).client, ORG, form());
    expect(r).toEqual({ ok: false });
  });
});

describe("updateEntry", () => {
  it("replaces the receipt: saves the row first, then removes the previous object", async () => {
    const { client, order, remove } = fake({
      tables: { finance_entries: [{ data: { receipt_path: `${ORG}/receipts/old.pdf` }, error: null }, { data: [{ id: "e1" }], error: null }] },
    });
    expect(await updateEntry(client, ORG, "e1", form(), `${ORG}/receipts/new.pdf`)).toEqual({ ok: true });
    expect(order).toEqual(["update:finance_entries", "storage:remove"]);
    expect(remove).toHaveBeenCalledWith([`${ORG}/receipts/old.pdf`]);
  });

  it("keeps the old receipt when the update fails or affects no row", async () => {
    silent();
    const failing = fake({ tables: { finance_entries: [{ data: { receipt_path: "p" }, error: null }, { data: null, error: { message: "x" } }] } });
    expect(await updateEntry(failing.client, ORG, "e1", form(), "n")).toEqual({ ok: false });
    expect(failing.remove).not.toHaveBeenCalled();
    const empty = fake({ tables: { finance_entries: [{ data: { receipt_path: "p" }, error: null }, { data: [], error: null }] } });
    expect(await updateEntry(empty.client, ORG, "e1", form(), "n")).toEqual({ ok: false });
    expect(empty.remove).not.toHaveBeenCalled();
  });

  it("does not touch storage when no new receipt is given", async () => {
    const { client, order } = fake({ tables: { finance_entries: [{ data: [{ id: "e1" }], error: null }] } });
    expect(await updateEntry(client, ORG, "e1", form())).toEqual({ ok: true });
    expect(order).toEqual(["update:finance_entries"]);
  });

  it("fails when the entry cannot be read (not found or not allowed)", async () => {
    silent();
    expect(await updateEntry(fake({ tables: { finance_entries: [{ data: null, error: null }] } }).client, ORG, "e1", form(), "n")).toEqual({ ok: false });
    expect(await updateEntry(fake({ tables: { finance_entries: [{ data: null, error: {} }] } }).client, ORG, "e1", form(), "n")).toEqual({ ok: false });
  });

  it("does not remove the object when the receipt path is unchanged", async () => {
    const { client, remove } = fake({
      tables: { finance_entries: [{ data: { receipt_path: "same" }, error: null }, { data: [{ id: "e1" }], error: null }] },
    });
    await updateEntry(client, ORG, "e1", form(), "same");
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("deleteEntry", () => {
  it("deletes the row first and then the receipt object", async () => {
    const { client, order, remove } = fake({
      tables: { finance_entries: [{ data: { receipt_path: `${ORG}/receipts/a.jpg` }, error: null }, { data: [{ id: "e1" }], error: null }] },
    });
    expect(await deleteEntry(client, ORG, "e1")).toEqual({ ok: true });
    expect(order).toEqual(["delete:finance_entries", "storage:remove"]);
    expect(remove).toHaveBeenCalledWith([`${ORG}/receipts/a.jpg`]);
  });

  it("skips storage for an entry without a receipt", async () => {
    const { client, remove } = fake({ tables: { finance_entries: [{ data: { receipt_path: null }, error: null }, { data: [{ id: "e1" }], error: null }] } });
    expect(await deleteEntry(client, ORG, "e1")).toEqual({ ok: true });
    expect(remove).not.toHaveBeenCalled();
  });

  it("fails and keeps the receipt when the row is not found, not allowed or not deleted", async () => {
    silent();
    const missing = fake({ tables: { finance_entries: [{ data: null, error: null }] } });
    expect(await deleteEntry(missing.client, ORG, "e1")).toEqual({ ok: false });
    const readError = fake({ tables: { finance_entries: [{ data: null, error: {} }] } });
    expect(await deleteEntry(readError.client, ORG, "e1")).toEqual({ ok: false });
    const blocked = fake({ tables: { finance_entries: [{ data: { receipt_path: "p" }, error: null }, { data: [], error: null }] } });
    expect(await deleteEntry(blocked.client, ORG, "e1")).toEqual({ ok: false });
    expect(blocked.remove).not.toHaveBeenCalled();
  });
});

describe("createRental", () => {
  const input = {
    unitId: "u1", stayStart: "2027-05-01", stayEnd: "2027-05-04", channel: "airbnb", guests: 4, guestName: "Ana",
    occurredOn: "2027-05-04", amount: 100000, currency: "USD", fxRate: "3.75", paymentMethod: "platform", note: "n",
    commission: 15000, cleaning: 8000,
  } as never;

  it("calls the atomic function with the mapped arguments and returns the id", async () => {
    const { client, rpc } = fake({ rpc: { data: "rental-id", error: null } });
    expect(await createRental(client, input, `${ORG}/receipts/a.jpg`)).toEqual({ ok: true, id: "rental-id" });
    expect(rpc).toHaveBeenCalledWith("create_rental_entries", {
      p_unit_id: "u1", p_stay_start: "2027-05-01", p_stay_end: "2027-05-04", p_channel: "airbnb", p_occurred_on: "2027-05-04",
      p_amount_cents: 100000, p_currency: "USD", p_guests: 4, p_guest_name: "Ana", p_fx_rate_pen: 3.75, p_payment_method: "platform",
      p_receipt_path: `${ORG}/receipts/a.jpg`, p_note: "n", p_commission_cents: 15000, p_cleaning_cents: 8000,
    });
  });

  it("omits the exchange rate for PEN", async () => {
    const { client, rpc } = fake({ rpc: { data: "id", error: null } });
    await createRental(client, { ...(input as object), currency: "PEN", fxRate: undefined } as never);
    expect((rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1].p_fx_rate_pen).toBeUndefined();
  });

  it("reports a generic failure on an error or an unexpected result", async () => {
    silent();
    expect(await createRental(fake({ rpc: { data: null, error: { message: "rls" } } }).client, input)).toEqual({ ok: false });
    expect(await createRental(fake({ rpc: { data: 42, error: null } }).client, input)).toEqual({ ok: false });
  });
});

describe("receipts", () => {
  it("uploads without overwriting and reports failure", async () => {
    silent();
    const ok = fake({});
    expect(await uploadReceipt(ok.client, "p", new Uint8Array([1]), "application/pdf")).toBe(true);
    expect(ok.upload).toHaveBeenCalledWith("p", expect.anything(), { contentType: "application/pdf", upsert: false });
    expect(await uploadReceipt(fake({ upload: { error: { message: "denied" } } }).client, "p", new Uint8Array([1]), "image/jpeg")).toBe(false);
  });

  it("treats a removal that RLS skipped as a failure", async () => {
    silent();
    expect(await removeReceipt(fake({}).client, "p")).toBe(true);
    expect(await removeReceipt(fake({ remove: { data: [], error: null } }).client, "p")).toBe(false);
    expect(await removeReceipt(fake({ remove: { error: { message: "x" } } }).client, "p")).toBe(false);
  });

  it("signs a short-lived link only for an entry that has a receipt", async () => {
    silent();
    const ok = fake({ tables: { finance_entries: [{ data: { receipt_path: `${ORG}/receipts/a.pdf` }, error: null }] } });
    expect(await signReceipt(ok.client, ORG, "e1")).toBe("https://signed.example/x");
    expect(ok.createSignedUrl).toHaveBeenCalledWith(`${ORG}/receipts/a.pdf`, 60);
    expect(await signReceipt(fake({ tables: { finance_entries: [{ data: { receipt_path: null }, error: null }] } }).client, ORG, "e1")).toBeNull();
    expect(await signReceipt(fake({ tables: { finance_entries: [{ data: null, error: {} }] } }).client, ORG, "e1")).toBeNull();
    const signFails = fake({
      tables: { finance_entries: [{ data: { receipt_path: "p" }, error: null }] },
      sign: { data: null, error: { message: "denied by storage policy" } },
    });
    expect(await signReceipt(signFails.client, ORG, "e1")).toBeNull();
  });
});
