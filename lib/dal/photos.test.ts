import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

vi.mock("server-only", () => ({}));
import { deletePhoto, uploadPhoto, deleteSpaceWithPhotos } from "./photos";
import { reorderItems } from "./content";

const ORG = "bf88f504-051f-4fdc-ab73-4fa12d715817";
const PROP = "131583b5-785e-4127-81f0-e097163c5654";
const JPEG = { mime: "image/jpeg", ext: "jpg" } as const;

// A chainable, thenable query stub: every method returns the builder, and the
// builder resolves to `result` (also via .single()/.maybeSingle()).
function builder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "insert", "update", "delete", "limit"]) b[m] = vi.fn(() => b);
  b.single = vi.fn(() => Promise.resolve(result));
  b.maybeSingle = vi.fn(() => Promise.resolve(result));
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return b;
}

function fakeClient(opts: {
  tables?: Record<string, { data: unknown; error: unknown }[]>; // consumed in call order per table
  upload?: { error: unknown };
  remove?: { error: unknown };
  rpc?: { data: unknown; error: unknown };
}) {
  const queues = Object.fromEntries(Object.entries(opts.tables ?? {}).map(([k, v]) => [k, [...v]]));
  const remove = vi.fn(() => Promise.resolve(opts.remove ?? { error: null }));
  const upload = vi.fn(() => Promise.resolve(opts.upload ?? { error: null }));
  const client = {
    from: vi.fn((table: string) => builder(queues[table]?.shift() ?? { data: [], error: null })),
    storage: { from: vi.fn(() => ({ upload, remove })) },
    rpc: vi.fn(() => Promise.resolve(opts.rpc ?? { data: 0, error: null })),
  };
  return { client: client as unknown as SupabaseClient<Database>, remove, upload };
}

describe("uploadPhoto", () => {
  it("removes the uploaded object when the row insert fails (no orphan)", async () => {
    const { client, remove, upload } = fakeClient({
      tables: { photos: [{ data: [], error: null }, { data: null, error: { message: "boom" } }] },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await uploadPhoto(client, { orgId: ORG, propertyId: PROP, scope: { kind: "site" }, bytes: new Uint8Array([1]), kind: JPEG });
    expect(res.ok).toBe(false);
    expect(upload).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("does not insert a row when the storage upload fails", async () => {
    const { client, remove } = fakeClient({
      tables: { photos: [{ data: [], error: null }] },
      upload: { error: { message: "denied" } },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await uploadPhoto(client, { orgId: ORG, propertyId: PROP, scope: { kind: "site" }, bytes: new Uint8Array([1]), kind: JPEG });
    expect(res.ok).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("uploads under the org prefix and makes the first site photo the hero", async () => {
    const { client, upload } = fakeClient({
      tables: { photos: [{ data: [], error: null }, { data: { id: "p1" }, error: null }] },
    });
    const res = await uploadPhoto(client, { orgId: ORG, propertyId: PROP, scope: { kind: "site" }, bytes: new Uint8Array([1]), kind: JPEG });
    expect(res).toEqual({ ok: true, id: "p1" });
    const path = (upload.mock.calls[0] as unknown as string[])[0];
    expect(path.startsWith(`${ORG}/site/`)).toBe(true);
  });
});

describe("deletePhoto", () => {
  it("keeps the row when the Storage removal fails (retryable)", async () => {
    const { client } = fakeClient({
      tables: { photos: [{ data: { storage_path: `${ORG}/site/a.jpg` }, error: null }] },
      remove: { error: { message: "nope" } },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await deletePhoto(client, ORG, "photo-1");
    expect(res.ok).toBe(false);
    // only the lookup touched `photos`; no delete was attempted
    expect((client.from as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("fails when the row delete affects no row", async () => {
    const { client } = fakeClient({
      tables: { photos: [{ data: { storage_path: "x/y.jpg" }, error: null }, { data: [], error: null }] },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await deletePhoto(client, ORG, "photo-1")).ok).toBe(false);
  });
});

describe("deleteSpaceWithPhotos", () => {
  it("removes every photo object before deleting the space", async () => {
    const order: string[] = [];
    const { client, remove } = fakeClient({
      tables: { photos: [{ data: [{ storage_path: "a.jpg" }, { storage_path: "b.jpg" }], error: null }] },
    });
    remove.mockImplementation(() => {
      order.push("objects");
      return Promise.resolve({ error: null });
    });
    const deleteRow = vi.fn(async () => {
      order.push("row");
      return { ok: true as const };
    });
    expect((await deleteSpaceWithPhotos(client, ORG, "space-1", deleteRow)).ok).toBe(true);
    expect(order).toEqual(["objects", "row"]);
    expect(remove).toHaveBeenCalledWith(["a.jpg", "b.jpg"]);
  });

  it("does not delete the space when object removal fails", async () => {
    const { client } = fakeClient({
      tables: { photos: [{ data: [{ storage_path: "a.jpg" }], error: null }] },
      remove: { error: { message: "nope" } },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deleteRow = vi.fn(async () => ({ ok: true as const }));
    expect((await deleteSpaceWithPhotos(client, ORG, "space-1", deleteRow)).ok).toBe(false);
    expect(deleteRow).not.toHaveBeenCalled();
  });
});

describe("reorderItems", () => {
  it("fails when the RPC changed fewer rows than ids sent", async () => {
    const { client } = fakeClient({ rpc: { data: 1, error: null } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await reorderItems(client, "spaces", PROP, ["a", "b"])).ok).toBe(false);
  });
  it("succeeds when every id was changed", async () => {
    const { client } = fakeClient({ rpc: { data: 2, error: null } });
    expect((await reorderItems(client, "spaces", PROP, ["a", "b"])).ok).toBe(true);
  });
});
