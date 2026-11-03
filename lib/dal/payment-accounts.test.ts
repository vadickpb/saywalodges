import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/dal/organizations", () => ({ requireActiveOrg: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { listPaymentAccounts, savePaymentAccount, setPaymentAccountActive, deletePaymentAccount } from "./payment-accounts";
import { paymentAccountSchema } from "@/lib/domain/payment-accounts";
const id = "11111111-1111-4111-8111-111111111111";
const value = paymentAccountSchema.parse({ kind: "plin", holder_name: "Ana", phone: "999888777", currency: "PEN", instructions: "", active: true, sort_order: 0 });
function fake(result = { data: [{ id }], error: null } as { data: unknown; error: unknown }, property: unknown = { id: "property" }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "insert", "update", "delete"]) builder[method] = (...args: unknown[]) => { calls.push({ method, args }); return builder; };
    builder.maybeSingle = async () => ({ data: property, error: null });
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(table === "properties" ? { data: property, error: null } : result).then(resolve);
    return builder;
  });
  mocks.client.mockResolvedValue({ from });
  return { calls, from };
}
beforeEach(() => { vi.restoreAllMocks(); mocks.context.mockResolvedValue({ activeOrg: { id: "org" } }); });
describe("payment accounts DAL", () => {
  it("lists in stable order within the verified property", async () => {
    const { calls } = fake();
    expect(await listPaymentAccounts()).toEqual([{ id }]);
    expect(calls.filter(c => c.method === "order").map(c => c.args)).toEqual([["sort_order"], ["created_at"], ["id"]]);
    expect(calls).toContainEqual({ method: "eq", args: ["org_id", "org"] });
    expect(calls).toContainEqual({ method: "eq", args: ["property_id", "property"] });
  });
  it("creates with server scope and clears incompatible fields", async () => {
    const { calls } = fake();
    await savePaymentAccount(null, value);
    expect(calls.find(c => c.method === "insert")?.args[0]).toEqual({ ...value, org_id: "org", property_id: "property" });
  });
  it("scopes updates, activation and deletion and verifies membership afresh", async () => {
    for (const operation of [() => savePaymentAccount(id, value), () => setPaymentAccountActive(id, false), () => deletePaymentAccount(id)]) {
      const { calls } = fake();
      await operation();
      for (const scope of [["org_id", "org"], ["property_id", "property"], ["id", id]]) expect(calls).toContainEqual({ method: "eq", args: scope });
    }
    expect(mocks.context).toHaveBeenCalled();
  });
  it("rejects missing scope without accessing accounts", async () => {
    const { from } = fake(undefined, null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(listPaymentAccounts()).rejects.toThrow("No se pudieron gestionar");
    expect(from).not.toHaveBeenCalledWith("property_payment_accounts");
    mocks.context.mockResolvedValue({ activeOrg: null });
    await expect(savePaymentAccount(null, value)).rejects.toThrow("No se pudieron gestionar");
  });
  it("reports generic errors and logs only codes, including RLS-filtered writes", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const operation of [() => listPaymentAccounts(), () => savePaymentAccount(null, value), () => savePaymentAccount(id, value), () => setPaymentAccountActive(id, false), () => deletePaymentAccount(id)]) {
      fake({ data: null, error: { code: "42501", message: "private account details" } });
      await expect(operation()).rejects.toThrow("No se pudieron gestionar");
      expect(log).toHaveBeenLastCalledWith("payment_accounts failed:", "42501");
    }
    for (const operation of [() => savePaymentAccount(id, value), () => setPaymentAccountActive(id, true), () => deletePaymentAccount(id)]) {
      fake({ data: [], error: null });
      await expect(operation()).rejects.toThrow("No se pudieron gestionar");
    }
  });
});
