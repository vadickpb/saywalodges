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

function clientWith(result: { data: unknown; error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient<Database>, from, eq };
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
      { id: "u1", name: "Casa A", active: true, availableFrom: "2027-01-10", availableUntil: null },
      // 03:00 UTC is still the previous evening in Lima.
      { id: "u2", name: "Casa B", active: false, availableFrom: "2027-01-10", availableUntil: "2027-06-01" },
    ]);
  });

  it("throws a generic error without the database message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientWith({ data: null, error: { message: "secret db detail" } });
    await expect(listReportUnits(client, ORG)).rejects.toThrow("No se pudieron cargar las casas.");
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
