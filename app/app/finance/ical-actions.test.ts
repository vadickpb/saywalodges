import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/finance-ical", () => ({ completeRental: vi.fn() }));
vi.mock("./_lib/context", () => ({
  getFinanceContext: vi.fn(),
  GENERIC_ERROR: "generic",
  NO_CONTEXT_ERROR: "no-context",
}));

import { revalidatePath } from "next/cache";
import * as dal from "@/lib/dal/finance-ical";
import { getFinanceContext } from "./_lib/context";
import { completeRentalAction } from "./ical-actions";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const BLOCK = "7fc45683-5cf1-4bac-8dde-3331b397956c";
const supabase = {};

function fd(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}
const valid = { blockId: BLOCK, amount: "150.00", currency: "PEN", fxRate: "", occurredOn: "2027-03-04", guests: "", cleaning: "" };
const asOwner = () => vi.mocked(getFinanceContext).mockResolvedValue({ supabase, orgId: ORG, role: "owner", isOwner: true } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("completeRentalAction", () => {
  it("refuses without an organization and never calls the database", async () => {
    vi.mocked(getFinanceContext).mockResolvedValue(null);
    expect(await completeRentalAction({ ok: false }, fd(valid))).toMatchObject({ ok: false, formError: "no-context" });
    expect(dal.completeRental).not.toHaveBeenCalled();
  });

  it("refuses staff on the server, whatever the form shows", async () => {
    vi.mocked(getFinanceContext).mockResolvedValue({ supabase, orgId: ORG, role: "staff", isOwner: false } as never);
    const state = await completeRentalAction({ ok: false }, fd(valid));
    expect(state.ok).toBe(false);
    expect(state.formError).toMatch(/dueño/);
    expect(dal.completeRental).not.toHaveBeenCalled();
  });

  it("returns field errors and keeps the typed values on invalid input", async () => {
    asOwner();
    const state = await completeRentalAction({ ok: false }, fd({ ...valid, amount: "0" }));
    expect(state.ok).toBe(false);
    expect(state.errors?.amount).toBeDefined();
    expect(state.values?.amount).toBe("0");
    expect(dal.completeRental).not.toHaveBeenCalled();
  });

  it("completes with the session org (a forged org field is ignored) and refreshes the finance pages", async () => {
    asOwner();
    vi.mocked(dal.completeRental).mockResolvedValue({ ok: true, rentalId: "r1", replayed: false });
    const state = await completeRentalAction({ ok: false }, fd({ ...valid, orgId: "other-org", cleaning: "80" }));
    expect(state.ok).toBe(true);
    expect(dal.completeRental).toHaveBeenCalledWith(supabase, ORG, expect.objectContaining({ blockId: BLOCK, amount: 15000, cleaning: 8000 }));
    expect(revalidatePath).toHaveBeenCalledWith("/app/finance", "layout");
  });

  it("answers a generic error, never the database message, when the call fails", async () => {
    asOwner();
    vi.mocked(dal.completeRental).mockResolvedValue({ ok: false });
    const state = await completeRentalAction({ ok: false }, fd(valid));
    expect(state).toMatchObject({ ok: false, formError: "generic" });
  });
});
