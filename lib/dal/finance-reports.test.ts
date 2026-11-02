import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/finance", () => ({
  listAllEntries: vi.fn(),
  listCategories: vi.fn(),
}));
import { listAllEntries, listCategories } from "@/lib/dal/finance";
import { listReportUnits, loadReportData } from "./finance-reports";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";

// units (select -> eq) and manual blocks (select -> eq -> eq), each answered by its own table.
function clientWith(units: { data: unknown; error: unknown }, blocks: { data: unknown; error: unknown } = { data: [], error: null }) {
  const unitsEq = vi.fn().mockResolvedValue(units);
  const blocksEqSource = vi.fn().mockResolvedValue(blocks);
  const blocksEqOrg = vi.fn(() => ({ eq: blocksEqSource }));
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({ eq: table === "units" ? unitsEq : blocksEqOrg })),
  }));
  return { client: { from } as unknown as SupabaseClient<Database>, from, eq: unitsEq, blocksEqOrg, blocksEqSource };
}

describe("listReportUnits", () => {
  it("keeps archived houses and closes their availability on the day they were last edited", async () => {
    const { client, from, eq } = clientWith({
      data: [
        { id: "u1", name: "Casa A", active: true, created_at: "2027-01-10T15:00:00Z", updated_at: "2027-05-01T15:00:00Z" },
        { id: "u2", name: "Casa B", active: false, created_at: "2027-01-10T15:00:00Z", updated_at: "2027-06-02T03:00:00Z" },
      ],
      error: null,
    });
    const units = await listReportUnits(client, ORG);
    expect(from).toHaveBeenCalledWith("units");
    expect(eq).toHaveBeenCalledWith("org_id", ORG);
    expect(units).toEqual([
      { id: "u1", name: "Casa A", active: true, availableFrom: "2027-01-10", availableUntil: null, blockedRanges: [] },
      // 03:00 UTC is still the previous evening in Lima.
      { id: "u2", name: "Casa B", active: false, availableFrom: "2027-01-10", availableUntil: "2027-06-01", blockedRanges: [] },
    ]);
  });

  it("attaches only the owner's manual blocks to their house and ignores malformed ranges", async () => {
    const { client, from, blocksEqOrg, blocksEqSource } = clientWith(
      { data: [{ id: "u1", name: "Casa A", active: true, created_at: "2027-01-10T15:00:00Z", updated_at: "2027-01-10T15:00:00Z" }], error: null },
      { data: [{ unit_id: "u1", period: "[2027-03-01,2027-03-05)" }, { unit_id: "u1", period: "[2027-04-10,2027-04-12)" }, { unit_id: "u1", period: "empty" }, { unit_id: "other", period: "[2027-03-01,2027-03-02)" }], error: null }
    );
    const units = await listReportUnits(client, ORG);
    expect(from).toHaveBeenCalledWith("calendar_blocks");
    expect(blocksEqOrg).toHaveBeenCalledWith("org_id", ORG);
    expect(blocksEqSource).toHaveBeenCalledWith("source", "manual");
    expect(units[0].blockedRanges).toEqual([{ start: "2027-03-01", end: "2027-03-05" }, { start: "2027-04-10", end: "2027-04-12" }]);
  });

  it("throws a generic error without the database message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientWith({ data: null, error: { message: "secret db detail" } });
    await expect(listReportUnits(client, ORG)).rejects.toThrow("No se pudieron cargar las casas.");
    const { client: other } = clientWith({ data: [], error: null }, { data: null, error: { message: "secret db detail" } });
    await expect(listReportUnits(other, ORG)).rejects.toThrow("No se pudieron cargar las casas.");
  });
});

describe("loadReportData", () => {
  const entry = (over: Record<string, unknown>) => ({
    id: "e1", kind: "income", categoryId: "c1", occurredOn: "2026-03-05", amountCents: 1000, amountPenCents: 1000,
    unitId: null, relatedEntryId: null, stayStart: null, stayEnd: null, channel: null, ...over,
  });

  it("reports the first year of the ledger and the truncation flag", async () => {
    vi.mocked(listAllEntries).mockResolvedValue({
      entries: [entry({ id: "e1", occurredOn: "2026-03-05" }), entry({ id: "e2", occurredOn: "2025-11-20" })] as never,
      truncated: true,
    });
    vi.mocked(listCategories).mockResolvedValue([{ id: "c1", systemKey: null }] as never);
    const { client } = clientWith({ data: [], error: null });
    const r = await loadReportData(client, ORG);
    expect(r).toMatchObject({ ok: true, truncated: true, entryCount: 2, firstYear: 2025 });
  });

  it("has no first year for an empty ledger", async () => {
    vi.mocked(listAllEntries).mockResolvedValue({ entries: [], truncated: false });
    vi.mocked(listCategories).mockResolvedValue([]);
    const { client } = clientWith({ data: [], error: null });
    expect(await loadReportData(client, ORG)).toMatchObject({ ok: true, entryCount: 0, firstYear: null });
  });

  it("returns the engine error instead of throwing", async () => {
    vi.mocked(listAllEntries).mockResolvedValue({ entries: [entry({ amountPenCents: -5 })] as never, truncated: false });
    vi.mocked(listCategories).mockResolvedValue([{ id: "c1", systemKey: null }] as never);
    const { client } = clientWith({ data: [], error: null });
    expect(await loadReportData(client, ORG)).toEqual({ ok: false, error: "INVALID_AMOUNT" });
  });
});
