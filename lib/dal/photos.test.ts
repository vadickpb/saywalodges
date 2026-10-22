import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

vi.mock("server-only", () => ({}));
import { deletePhoto, uploadPhoto, deleteSpaceWithPhotos, setLogo, removeLogo, setHeroPhoto, reorderPhotos } from "./photos";
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
  remove?: { data?: unknown[]; error: unknown };
  rpc?: { data: unknown; error: unknown };
}) {
  const queues = Object.fromEntries(Object.entries(opts.tables ?? {}).map(([k, v]) => [k, [...v]]));
  const remove = vi.fn((paths: string[]) => Promise.resolve(opts.remove ?? { data: paths.map((name) => ({ name })), error: null }));
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
    remove.mockImplementation((paths: string[]) => {
      order.push("objects");
      return Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
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

describe("storage remove that RLS silently skips", () => {
  it("keeps the row when Storage removed fewer objects than requested", async () => {
    const { client } = fakeClient({
      tables: { photos: [{ data: { storage_path: "site/legacy.jpg", role: "gallery", space_id: null, property_id: PROP }, error: null }] },
      remove: { data: [], error: null },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await deletePhoto(client, ORG, "photo-1")).ok).toBe(false);
    expect((client.from as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1); // no row delete
  });
});

describe("deletePhoto hero handling", () => {
  it("promotes the next site photo when the hero is deleted", async () => {
    const { client } = fakeClient({
      tables: {
        photos: [
          { data: { storage_path: `${ORG}/site/a.jpg`, role: "hero", space_id: null, property_id: PROP }, error: null },
          { data: [{ id: "photo-1" }], error: null }, // delete
          { data: [{ id: "photo-2" }], error: null }, // next candidate
        ],
      },
      rpc: { data: 1, error: null },
    });
    expect((await deletePhoto(client, ORG, "photo-1")).ok).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("set_hero_photo", { p_property_id: PROP, p_photo_id: "photo-2" });
  });

  it("does not touch the hero when a gallery photo is deleted", async () => {
    const { client } = fakeClient({
      tables: {
        photos: [
          { data: { storage_path: `${ORG}/site/a.jpg`, role: "gallery", space_id: null, property_id: PROP }, error: null },
          { data: [{ id: "photo-1" }], error: null },
        ],
      },
    });
    expect((await deletePhoto(client, ORG, "photo-1")).ok).toBe(true);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe("logo", () => {
  it("removes the new object and keeps the old logo when the row update fails", async () => {
    const { client, remove, upload } = fakeClient({
      tables: { properties: [{ data: { logo_path: `${ORG}/branding/old.jpg` }, error: null }, { data: null, error: { message: "boom" } }] },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await setLogo(client, { orgId: ORG, bytes: new Uint8Array([1]), kind: JPEG })).ok).toBe(false);
    expect(upload).toHaveBeenCalledOnce();
    const removed = (remove.mock.calls[0] as unknown as string[][])[0];
    expect(removed).toHaveLength(1);
    expect(removed[0]).not.toContain("old.jpg");
  });

  it("deletes the previous logo object only after the row points at the new one", async () => {
    const { client, remove } = fakeClient({
      tables: { properties: [{ data: { logo_path: `${ORG}/branding/old.jpg` }, error: null }, { data: [{ id: PROP }], error: null }] },
    });
    expect((await setLogo(client, { orgId: ORG, bytes: new Uint8Array([1]), kind: JPEG })).ok).toBe(true);
    expect(remove).toHaveBeenCalledWith([`${ORG}/branding/old.jpg`]);
  });

  it("removeLogo clears the row then deletes the object", async () => {
    const { client, remove } = fakeClient({
      tables: { properties: [{ data: { logo_path: `${ORG}/branding/old.jpg` }, error: null }, { data: [{ id: PROP }], error: null }] },
    });
    expect((await removeLogo(client, ORG)).ok).toBe(true);
    expect(remove).toHaveBeenCalledWith([`${ORG}/branding/old.jpg`]);
  });
});

describe("rpc wrappers", () => {
  it("setHeroPhoto fails unless exactly one photo was promoted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await setHeroPhoto(fakeClient({ rpc: { data: 0, error: null } }).client, PROP, "p")).ok).toBe(false);
    expect((await setHeroPhoto(fakeClient({ rpc: { data: 1, error: null } }).client, PROP, "p")).ok).toBe(true);
  });
  it("reorderPhotos surfaces an RPC error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await reorderPhotos(fakeClient({ rpc: { data: null, error: { message: "x" } } }).client, PROP, null, ["a"])).ok).toBe(false);
  });
});

describe("uploadPhoto with a space of another org", () => {
  it("fails before uploading anything", async () => {
    const { client, upload } = fakeClient({ tables: { spaces: [{ data: null, error: null }] } });
    const res = await uploadPhoto(client, { orgId: ORG, propertyId: PROP, scope: { kind: "space", spaceId: "0bcf73ac-1c1d-4418-9982-2edde9a3e50c" }, bytes: new Uint8Array([1]), kind: JPEG });
    expect(res.ok).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });
});
