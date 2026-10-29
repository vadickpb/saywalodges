import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), create: vi.fn(), remove: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/dal/calendar", () => ({ getCalendarContext: mocks.context, createManualBlock: mocks.create, deleteManualBlock: mocks.remove, CALENDAR_ERROR: "Error seguro" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { createManualBlockAction, deleteManualBlockAction } from "./actions";
const ID = "2c19ef14-e784-4a6b-aafd-82af02488d42";
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ unitId: ID, start: "2027-02-01", end: "2027-02-02", note: "  Nota  ", ...overrides })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ orgId: "verified-org" }); mocks.create.mockResolvedValue({ ok: true }); mocks.remove.mockResolvedValue({ ok: true }); });
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
});
