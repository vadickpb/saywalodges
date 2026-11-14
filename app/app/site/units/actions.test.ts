import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setComponents: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/dal/units", () => ({
  createUnit: vi.fn(), deleteUnit: vi.fn(), setUnitActive: vi.fn(), updateUnit: vi.fn(), setUnitComponents: mocks.setComponents,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../_lib/context", () => ({ GENERIC_ERROR: "Error seguro", NO_CONTEXT_ERROR: "Sin contexto", getSiteContext: vi.fn() }));

import { setUnitComponentsAction } from "./actions";

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";

function form(unitId = PARENT, children: string[] = [CHILD]) {
  const data = new FormData();
  data.set("unitId", unitId);
  for (const child of children) data.append("children", child);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setComponents.mockResolvedValue({ ok: true });
});

describe("setUnitComponentsAction", () => {
  it("passes a validated parent and child list to the DAL", async () => {
    expect(await setUnitComponentsAction(null, form())).toEqual({ ok: true });
    expect(mocks.setComponents).toHaveBeenCalledWith(PARENT, [CHILD]);
    expect(mocks.revalidate.mock.calls).toEqual([["/app/site/units", "layout"], ["/app/calendar"]]);
  });

  it("accepts an empty list to stop being a combination", async () => {
    expect((await setUnitComponentsAction(null, form(PARENT, []))).ok).toBe(true);
    expect(mocks.setComponents).toHaveBeenCalledWith(PARENT, []);
  });

  it.each([
    ["invalid parent", "invalid", [CHILD]],
    ["invalid child", PARENT, ["invalid"]],
    ["duplicate children", PARENT, [CHILD, CHILD]],
    ["the parent itself", PARENT, [PARENT]],
    ["more than 20 children", PARENT, Array.from({ length: 21 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`)],
  ])("rejects %s before mutation", async (_name, parent, children) => {
    expect((await setUnitComponentsAction(null, form(parent, children))).ok).toBe(false);
    expect(mocks.setComponents).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("returns the safe DAL error without revalidation", async () => {
    mocks.setComponents.mockResolvedValue({ ok: false, error: "Conflicto seguro" });
    expect(await setUnitComponentsAction(null, form())).toEqual({ ok: false, error: "Conflicto seguro" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
