import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), toggle: vi.fn(), remove: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/dal/payment-accounts", () => ({ savePaymentAccount: mocks.save, setPaymentAccountActive: mocks.toggle, deletePaymentAccount: mocks.remove }));
import { paymentAccountAction } from "./actions";
const id = "11111111-1111-4111-8111-111111111111";
function form(over: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ operation: "save", id: "", kind: "yape", holder_name: " Ana ", phone: "999888777", currency: "PEN", instructions: "", sort_order: "0", active: "true", ...over })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.resetAllMocks(); });
describe("payment account actions", () => {
  it("ignores forged scope and passes normalized fields", async () => {
    expect((await paymentAccountAction({ ok: false }, form({ org_id: "other", property_id: "other" }))).ok).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith(null, expect.objectContaining({ holder_name: "Ana", bank_name: null, phone: "999888777" }));
    expect(mocks.save.mock.calls[0][1]).not.toHaveProperty("org_id");
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/settings");
  });
  it("rejects invalid fields, identifiers and operations before writes", async () => {
    const invalid: Record<string, string>[] = [{ phone: "bad" }, { id: "bad" }, { operation: "other" }, { active: "yes" }, { bank_name: "BCP" }];
    for (const over of invalid) {
      expect((await paymentAccountAction({ ok: false }, form(over))).ok).toBe(false);
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("edits, toggles and deletes validated ids", async () => {
    await paymentAccountAction({ ok: false }, form({ id }));
    expect(mocks.save).toHaveBeenCalledWith(id, expect.any(Object));
    await paymentAccountAction({ ok: false }, form({ id, operation: "toggle", active: "false" }));
    expect(mocks.toggle).toHaveBeenCalledWith(id, false);
    await paymentAccountAction({ ok: false }, form({ id, operation: "delete" }));
    expect(mocks.remove).toHaveBeenCalledWith(id);
    expect((await paymentAccountAction({ ok: false }, form({ operation: "delete" }))).ok).toBe(false);
  });
  it("does not expose backend errors or revalidate failed mutations", async () => {
    mocks.save.mockRejectedValue(new Error("secret db details"));
    const state = await paymentAccountAction({ ok: false }, form());
    expect(state.ok).toBe(false);
    expect(JSON.stringify(state)).not.toContain("secret");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
