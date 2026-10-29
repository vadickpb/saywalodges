import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
const mocks = vi.hoisted(() => ({ org: vi.fn(), client: vi.fn() }));
vi.mock("./organizations", () => ({ requireActiveOrg: mocks.org }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { getCalendarContext, readCalendar, createManualBlock, deleteManualBlock, CALENDAR_ERROR, OVERLAP_ERROR } from "./calendar";
type Result = { data: unknown; error: unknown };
function fake(results: Result[], rpcResult: Result = { data: "block", error: null }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "range", "overlaps", "maybeSingle"]) builder[method] = (...args: unknown[]) => { calls.push({ method, args }); return builder; };
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(results.shift()).then(resolve);
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const from = vi.fn(() => builder);
  const supabase = { from, rpc } as unknown as SupabaseClient<Database>;
  return { ctx: { supabase, orgId: "org", propertyId: "property" }, calls, rpc, from };
}
const unit = { id: "u1", name: "Cabaña", active: true };
const row = { id: "b1", unit_id: "u1", period: "[2027-01-30,2027-02-02)", source: "manual", note: "Reparación" };
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("authenticated calendar reads", () => {
  it("derives the property from verified active org, never client input", async () => {
    const f = fake([{ data: { id: "property" }, error: null }]);
    mocks.org.mockResolvedValue({ activeOrg: { id: "org" } }); mocks.client.mockResolvedValue(f.ctx.supabase);
    expect(await getCalendarContext()).toEqual(f.ctx);
    expect(mocks.org).toHaveBeenCalledOnce();
    expect(f.calls).toContainEqual({ method: "eq", args: ["org_id", "org"] });
    mocks.org.mockResolvedValue({ activeOrg: null });
    expect(await getCalendarContext()).toBeNull();
  });
  it("does not mask DB failures as an unprovisioned property", async () => {
    mocks.org.mockResolvedValue({ activeOrg: { id: "org" } });
    mocks.client.mockResolvedValue(fake([{ data: null, error: { message: "secret" } }]).ctx.supabase);
    await expect(getCalendarContext()).rejects.toThrow(CALENDAR_ERROR);
  });
  it("scopes reads by org/property/unit and fetches intersecting ranges across months", async () => {
    const f = fake([{ data: [unit], error: null }, { data: [row], error: null }]);
    expect((await readCalendar(f.ctx, "2027-02", "u1")).blocks[0]).toMatchObject({ start: "2027-01-30", end: "2027-02-02", note: "Reparación" });
    expect(f.calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([["org_id", "org"], ["property_id", "property"], ["org_id", "org"], ["property_id", "property"], ["unit_id", "u1"]]);
    expect(f.calls).toContainEqual({ method: "overlaps", args: ["period", "[2027-02-01,2027-03-01)"] });
    expect(f.from.mock.calls).toHaveLength(2);
  });
  it("rejects foreign units before reading blocks", async () => {
    const f = fake([{ data: [unit], error: null }]);
    expect((await readCalendar(f.ctx, "2027-02", "foreign")).invalidUnit).toBe(true);
    expect(f.from).toHaveBeenCalledOnce();
  });
  it("paginates beyond 1000 and hides nonmanual notes/identifiers", async () => {
    const f = fake([{ data: [unit], error: null }, { data: Array.from({ length: 1000 }, () => row), error: null }, { data: [{ ...row, source: "ical", feed_id: "secret", external_uid: "secret", note: "private" }], error: null }]);
    const result = await readCalendar(f.ctx, "2027-02");
    expect(result.blocks).toHaveLength(1001);
    expect(result.blocks.at(-1)).toEqual({ id: "b1", unitId: "u1", start: "2027-01-30", end: "2027-02-02", source: "ical", note: null });
    expect(f.calls).toContainEqual({ method: "range", args: [1000, 1999] });
  });
  it("fails closed on query or corrupt period errors", async () => {
    for (const result of [{ data: null, error: { message: "secret" } }, { data: [{ ...row, period: "empty" }], error: null }]) {
      const f = fake([{ data: [unit], error: null }, result]);
      await expect(readCalendar(f.ctx, "2027-02")).rejects.toThrow(CALENDAR_ERROR);
    }
    await expect(readCalendar(fake([{ data: null, error: {} }]).ctx, "2027-02")).rejects.toThrow(CALENDAR_ERROR);
  });
});
describe("manual RPC writes", () => {
  const input = { unitId: "unit", start: "2027-02-01", end: "2027-02-04", note: "Reparación" };
  it("calls RPC directly without checking availability", async () => {
    const f = fake([]);
    expect(await createManualBlock(f.ctx, input)).toEqual({ ok: true });
    expect(f.rpc).toHaveBeenCalledWith("create_manual_calendar_block", { p_org_id: "org", p_unit_id: "unit", p_start: input.start, p_end: input.end, p_note: input.note });
    expect(f.from).not.toHaveBeenCalled();
    expect(await deleteManualBlock(f.ctx, "block")).toEqual({ ok: true });
    expect(f.rpc).toHaveBeenLastCalledWith("delete_manual_calendar_block", { p_org_id: "org", p_block_id: "block" });
  });
  it("translates only SQLSTATE 23P01 and logs other failures safely", async () => {
    expect(await createManualBlock(fake([], { data: null, error: { code: "23P01", message: "private" } }).ctx, input)).toEqual({ ok: false, error: OVERLAP_ERROR });
    expect(console.error).not.toHaveBeenCalled();
    for (const code of ["42501", "23505", "22023"]) {
      const f = fake([], { data: null, error: { code, message: "private" } });
      expect(await createManualBlock(f.ctx, input)).toEqual({ ok: false, error: CALENDAR_ERROR });
      expect(await deleteManualBlock(f.ctx, "foreign")).toEqual({ ok: false, error: CALENDAR_ERROR });
    }
    expect(console.error).toHaveBeenCalled();
  });
});
