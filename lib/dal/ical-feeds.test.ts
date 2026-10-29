import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

vi.mock("server-only", () => ({}));
import { createFeed, deleteFeed, getIcalExport, listFeeds, regenerateToken } from "./ical-feeds";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const UNIT = "ee204001-0000-4000-8000-000000000001";
const TOKEN = "a".repeat(64);
type Result = { data: unknown; error: unknown };

function fake(opts: { table?: Result[]; rpc?: Result }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const queue = [...(opts.table ?? [])];
  const from = vi.fn(() => {
    const take = (): Result => queue.shift() ?? { data: [], error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "insert", "delete"]) {
      b[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args });
        return b;
      });
    }
    b.single = vi.fn(() => Promise.resolve(take()));
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(take()).then(resolve);
    return b;
  });
  const rpc = vi.fn((...args: unknown[]) => {
    calls.push({ method: "rpc", args });
    return Promise.resolve(opts.rpc ?? { data: null, error: null });
  });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, calls };
}
const silent = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("feeds", () => {
  it("lists them for the org", async () => {
    const row = { id: "f1", unit_id: UNIT, channel: "airbnb", export_token: TOKEN, import_url: null, last_synced_at: null, last_error: null };
    const { client, calls } = fake({ table: [{ data: [row], error: null }] });
    expect(await listFeeds(client, ORG)).toEqual([{ id: "f1", unitId: UNIT, channel: "airbnb", exportToken: TOKEN, importUrl: null, lastSyncedAt: null, lastError: null }]);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["org_id", ORG]);
    silent();
    await expect(listFeeds(fake({ table: [{ data: null, error: { message: "secret db detail" } }] }).client, ORG)).rejects.toThrow("No se pudieron cargar los calendarios.");
  });

  it("creates with the session org, and reports a failure generically", async () => {
    const { client, calls } = fake({ table: [{ data: { id: "new" }, error: null }] });
    expect(await createFeed(client, ORG, { unitId: UNIT, channel: "booking" })).toEqual({ ok: true, id: "new" });
    expect(calls.find((c) => c.method === "insert")?.args[0]).toEqual({ org_id: ORG, unit_id: UNIT, channel: "booking" });
    silent();
    expect(await createFeed(fake({ table: [{ data: null, error: { message: "dup" } }] }).client, ORG, { unitId: UNIT, channel: "booking" })).toEqual({ ok: false });
  });

  it("deletes only when exactly one row goes", async () => {
    silent();
    expect(await deleteFeed(fake({ table: [{ data: [{ id: "f1" }], error: null }] }).client, ORG, "f1")).toEqual({ ok: true });
    expect(await deleteFeed(fake({ table: [{ data: [], error: null }] }).client, ORG, "f1")).toEqual({ ok: false });
    expect(await deleteFeed(fake({ table: [{ data: null, error: { message: "x" } }] }).client, ORG, "f1")).toEqual({ ok: false });
  });

  it("regenerates through the function with the session org", async () => {
    const { client, calls } = fake({ rpc: { data: "b".repeat(64), error: null } });
    expect(await regenerateToken(client, ORG, "f1")).toEqual({ ok: true });
    expect(calls[0]).toEqual({ method: "rpc", args: ["regenerate_ical_token", { p_org_id: ORG, p_feed_id: "f1" }] });
    silent();
    expect(await regenerateToken(fake({ rpc: { data: null, error: { message: "x" } } }).client, ORG, "f1")).toEqual({ ok: false });
    expect(await regenerateToken(fake({ rpc: { data: null, error: null } }).client, ORG, "f1")).toEqual({ ok: false });
  });
});

describe("getIcalExport", () => {
  const payload = { unit: "Casa", channel: "airbnb", blocks: [{ id: "b1", starts: "2027-03-10", ends: "2027-03-12" }] };

  it("returns the validated payload", async () => {
    const { client, calls } = fake({ rpc: { data: payload, error: null } });
    expect(await getIcalExport(client, TOKEN)).toEqual(payload);
    expect(calls[0]).toEqual({ method: "rpc", args: ["get_ical_export", { p_token: TOKEN }] });
  });

  it("returns null for a malformed token without touching the database, and for an unknown one", async () => {
    const { client, calls } = fake({});
    expect(await getIcalExport(client, "nope")).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await getIcalExport(fake({ rpc: { data: null, error: null } }).client, TOKEN)).toBeNull();
  });

  it("throws a generic error on a database error or a payload of the wrong shape", async () => {
    silent();
    await expect(getIcalExport(fake({ rpc: { data: null, error: { message: "secret" } } }).client, TOKEN)).rejects.toThrow("No se pudo generar el calendario.");
    await expect(getIcalExport(fake({ rpc: { data: { unit: 1 }, error: null } }).client, TOKEN)).rejects.toThrow("No se pudo generar el calendario.");
  });
});
