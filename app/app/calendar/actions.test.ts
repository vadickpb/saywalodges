import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), create: vi.fn(), remove: vi.fn(), setPrice: vi.fn(), clearPrice: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/dal/calendar", () => ({ getCalendarContext: mocks.context, createManualBlock: mocks.create, deleteManualBlock: mocks.remove, CALENDAR_ERROR: "Error seguro" }));
vi.mock("@/lib/dal/rates", () => ({ setPriceRange: mocks.setPrice, clearPriceRange: mocks.clearPrice }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { clearPriceRangeAction, createManualBlockAction, deleteManualBlockAction, setPriceRangeAction } from "./actions";
const ID = "2c19ef14-e784-4a6b-aafd-82af02488d42";
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ unitId: ID, start: "2027-02-01", end: "2027-02-02", note: "  Nota  ", ...overrides })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ orgId: "verified-org" }); mocks.create.mockResolvedValue({ ok: true }); mocks.remove.mockResolvedValue({ ok: true }); mocks.setPrice.mockResolvedValue({ ok: true }); mocks.clearPrice.mockResolvedValue({ ok: true }); });
describe("calendar actions", () => {
  it("validates and uses the verified context, ignoring forged ownership fields", async () => {
    const result = await createManualBlockAction({ ok: false }, form({ orgId: "foreign", propertyId: "foreign" }));
    expect(result.ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({ orgId: "verified-org" }, { unitId: ID, start: "2027-02-01", end: "2027-02-02", note: "Nota" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/calendar");
  });
  it("rejects invalid ranges and UUIDs without mutation", async () => {
    expect((await createManualBlockAction({ ok: false }, form({ end: "2027-02-01" }))).errors?.end).toBeDefined();
    expect((await createManualBlockAction({ ok: false }, form({ unitId: "invalid" }))).errors?.unitId).toBeDefined();
    expect((await deleteManualBlockAction(form({ id: "invalid" }))).ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("preserves failed input and surfaces the safe constraint result", async () => {
    mocks.create.mockResolvedValue({ ok: false, error: "Estas fechas ya están ocupadas. Elige otro rango." });
    const result = await createManualBlockAction({ ok: false }, form());
    expect(result.formError).toContain("ocupadas"); expect(result.values?.note).toBe("  Nota  ");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("requires active context for both mutations", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await createManualBlockAction({ ok: false }, form())).ok).toBe(false);
    expect((await deleteManualBlockAction(form({ id: ID }))).ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("deletes only through DAL, revalidating only success", async () => {
    expect(await deleteManualBlockAction(form({ id: ID }))).toEqual({ ok: true });
    expect(mocks.remove).toHaveBeenCalledWith({ orgId: "verified-org" }, ID);
    expect(mocks.revalidate).toHaveBeenCalledOnce();
    mocks.remove.mockResolvedValue({ ok: false, error: "Error seguro" });
    expect(await deleteManualBlockAction(form({ id: ID }))).toEqual({ ok: false, error: "Error seguro" });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });
  it("sets and clears a validated price range, revalidating calendar and rates", async () => {
    const setData = form({ start: "2027-02-03", end: "2027-02-06", price: "123,45", minNights: "" });
    expect((await setPriceRangeAction({ ok: false }, setData)).ok).toBe(true);
    expect(mocks.setPrice).toHaveBeenCalledWith({ unitId: ID, start: "2027-02-03", end: "2027-02-06", price: 12345, minNights: null });
    const clearData = form({ start: "2027-02-03", end: "2027-02-06" });
    expect((await clearPriceRangeAction({ ok: false }, clearData)).ok).toBe(true);
    expect(mocks.clearPrice).toHaveBeenCalledWith({ unitId: ID, start: "2027-02-03", end: "2027-02-06" });
    expect(mocks.revalidate.mock.calls).toEqual([["/app/calendar"], ["/app/rates"], ["/app/calendar"], ["/app/rates"]]);
  });
  it("does not mutate invalid price ranges and preserves failed input", async () => {
    const invalid = await setPriceRangeAction({ ok: false }, form({ price: "12.345", minNights: "0" }));
    expect(invalid.ok).toBe(false);
    expect(invalid.errors?.price).toBeDefined();
    expect(invalid.errors?.minNights).toBeDefined();
    expect(invalid.values?.price).toBe("12.345");
    expect(mocks.setPrice).not.toHaveBeenCalled();
    mocks.setPrice.mockResolvedValue({ ok: false, error: "Error seguro" });
    const failedSet = await setPriceRangeAction({ ok: false }, form({ price: "125.50", minNights: "3" }));
    expect(failedSet).toMatchObject({ ok: false, formError: "Error seguro", values: { price: "125.50", minNights: "3" } });
    mocks.clearPrice.mockResolvedValue({ ok: false, error: "Error seguro" });
    expect(await clearPriceRangeAction({ ok: false }, form({ start: "2027-02-03", end: "2027-02-06" }))).toMatchObject({ ok: false, formError: "Error seguro" });
    const invalidClear = await clearPriceRangeAction({ ok: false }, form({ unitId: "invalid", start: "2027-02-06", end: "2027-02-03" }));
    expect(invalidClear.errors?.unitId).toBeDefined();
    expect(invalidClear.errors?.end).toBeDefined();
    expect(mocks.clearPrice).toHaveBeenCalledOnce();
  });
});
