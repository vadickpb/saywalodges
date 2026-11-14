import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/dal/organizations", () => ({ requireActiveOrg: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));

import {
  listUnitComponents,
  setUnitComponents,
  UNIT_COMPONENTS_CHAIN_ERROR,
  UNIT_COMPONENTS_ERROR,
  UNIT_COMPONENTS_OVERLAP_ERROR,
  UNIT_COMPONENTS_OWNER_ERROR,
} from "./units";

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";

function fake(rows: unknown[] = [], rpcResult: { data: unknown; error: { code: string; message?: string } | null } = { data: { ok: true }, error: null }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or"]) builder[method] = (...args: unknown[]) => { calls.push({ method, args }); return builder; };
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const from = vi.fn(() => builder);
  mocks.client.mockResolvedValue({ from, rpc });
  return { calls, from, rpc };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.context.mockResolvedValue({ activeOrg: { id: "verified-org", role: "owner" } });
});

describe("combined units DAL", () => {
  it("lists both sides of a combination within the active organization", async () => {
    const f = fake([
      { parent_unit_id: PARENT, child_unit_id: CHILD },
      { parent_unit_id: PARENT, child_unit_id: "33333333-3333-4333-8333-333333333333" },
    ]);
    expect(await listUnitComponents(PARENT)).toEqual({ parentUnitId: null, childUnitIds: [CHILD, "33333333-3333-4333-8333-333333333333"] });
    expect(f.calls).toContainEqual({ method: "eq", args: ["org_id", "verified-org"] });
    expect(f.calls).toContainEqual({ method: "or", args: [`parent_unit_id.eq.${PARENT},child_unit_id.eq.${PARENT}`] });
    expect(await listUnitComponents(CHILD)).toEqual({ parentUnitId: PARENT, childUnitIds: [] });
  });

  it("calls the owner-only RPC with the organization from the session", async () => {
    const f = fake();
    expect(await setUnitComponents(PARENT, [CHILD])).toEqual({ ok: true });
    expect(f.rpc).toHaveBeenCalledWith("set_unit_components", {
      p_org_id: "verified-org", p_parent_unit_id: PARENT, p_child_unit_ids: [CHILD],
    });
  });

  it("rejects staff before creating a database client", async () => {
    fake();
    mocks.context.mockResolvedValue({ activeOrg: { id: "verified-org", role: "staff" } });
    expect(await setUnitComponents(PARENT, [CHILD])).toEqual({ ok: false, error: UNIT_COMPONENTS_OWNER_ERROR });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("maps only the documented constraints and never exposes database messages", async () => {
    expect(await setUnitComponents(PARENT, [CHILD])).toEqual({ ok: true });
    for (const [code, message] of [["23P01", UNIT_COMPONENTS_OVERLAP_ERROR], ["23514", UNIT_COMPONENTS_CHAIN_ERROR]] as const) {
      fake([], { data: null, error: { code, message: "private database detail" } });
      expect(await setUnitComponents(PARENT, [CHILD])).toEqual({ ok: false, error: message });
    }
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fake([], { data: null, error: { code: "42501", message: "private database detail" } });
    expect(await setUnitComponents(PARENT, [CHILD])).toEqual({ ok: false, error: UNIT_COMPONENTS_ERROR });
    expect(log).toHaveBeenLastCalledWith("setUnitComponents failed:", "42501");
  });
});
