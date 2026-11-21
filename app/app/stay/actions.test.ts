import { beforeEach, describe, expect, it, vi } from "vitest";
const save = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/dal/stay-details", () => ({ saveStayDetails: save }));
import { saveStayDetailsAction } from "./actions";

const BOOKING = "33333333-3333-4333-8333-333333333333";
const details = { name: "Ana", phone: "", lang: "es", party: "", arrival: "", requests: [], note: "", remindOn: "" };
beforeEach(() => { vi.clearAllMocks(); save.mockResolvedValue(undefined); });

describe("saveStayDetailsAction", () => {
  it("saves valid input", async () => {
    expect(await saveStayDetailsAction({ bookingId: BOOKING }, details)).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith({ bookingId: BOOKING }, expect.objectContaining({ name: "Ana", requests: [] }));
  });
  it("rejects a bad key or bad fields with field errors, without saving", async () => {
    expect(await saveStayDetailsAction({ bookingId: "x" }, details)).toMatchObject({ ok: false });
    const bad = await saveStayDetailsAction({ bookingId: BOOKING }, { ...details, arrival: "99:99" });
    expect(bad).toMatchObject({ ok: false, fields: { arrival: expect.any(Array) } });
    expect(save).not.toHaveBeenCalled();
  });
  it("turns failures into a generic message", async () => {
    save.mockRejectedValue(new Error("relation secret"));
    const result = await saveStayDetailsAction({ bookingId: BOOKING }, details);
    expect(result).toEqual({ ok: false, error: "No se pudo guardar. Inténtalo de nuevo." });
  });
});
