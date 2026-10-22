import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { PHOTOS_BUCKET, getPublicPhotoUrl } from "@/lib/storage";
import { buildPhotoPath, type ImageKind, type PhotoScope } from "@/lib/domain/content-manager";
import type { Result } from "@/lib/dal/content";

// Member-only photo management with the SESSION client: Storage writes are
// authorised by the storage.objects policies ({org_id}/ prefix, migration
// 20261022203128) and row writes by the photos RLS — no service-role. Row and
// object are two systems, so every multi-step operation orders its steps so a
// failure leaves something a retry can finish, never a silent orphan:
//   upload  = object then row; row failure removes the object again.
//   delete  = object then row; Storage `remove` of a missing object succeeds,
//             so a failed row delete can simply be retried.

type Client = SupabaseClient<Database>;

export type PhotoItem = {
  id: string;
  spaceId: string | null;
  role: Database["public"]["Enums"]["photo_role"];
  path: string;
  url: string;
  sortOrder: number;
};

export async function listPhotos(supabase: Client, orgId: string): Promise<PhotoItem[]> {
  const { data, error } = await supabase
    .from("photos")
    .select("id, space_id, role, storage_path, sort_order")
    .eq("org_id", orgId)
    .order("sort_order")
    .order("id");
  if (error) {
    console.error("listPhotos failed:", error);
    return [];
  }
  return data.map((p) => ({
    id: p.id,
    spaceId: p.space_id,
    role: p.role,
    path: p.storage_path,
    url: getPublicPhotoUrl(p.storage_path),
    sortOrder: p.sort_order,
  }));
}

async function removeObjects(supabase: Client, paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).remove(paths);
  if (error) {
    console.error("storage remove failed:", error);
    return false;
  }
  // `remove` succeeds with fewer entries when RLS hides an object (e.g. a
  // legacy path that migrate-photo-paths.mjs has not moved yet). Treat that as
  // a failure so the row is kept instead of orphaning a public object.
  if (data.length < paths.length) {
    console.error(`storage remove: requested ${paths.length}, removed ${data.length}`);
    return false;
  }
  return true;
}

export async function uploadPhoto(
  supabase: Client,
  args: {
    orgId: string;
    propertyId: string;
    scope: Exclude<PhotoScope, { kind: "branding" }>;
    bytes: Uint8Array;
    kind: ImageKind;
  }
): Promise<Result<{ id: string }>> {
  const { orgId, propertyId, scope, bytes, kind } = args;
  const spaceId = scope.kind === "space" ? scope.spaceId : null;

  // The space must belong to this org: RLS on photos checks org_id, not that
  // space_id is theirs, but the composite FK (space_id, property_id) → spaces
  // already rejects a foreign space — this read just gives a clean failure
  // before anything is uploaded.
  if (spaceId) {
    const { data } = await supabase.from("spaces").select("id").eq("org_id", orgId).eq("id", spaceId).maybeSingle();
    if (!data) return { ok: false };
  }

  const scoped = supabase
    .from("photos")
    .select("role, sort_order")
    .eq("org_id", orgId)
    .eq("property_id", propertyId);
  const { data: existing, error: listError } = await (spaceId ? scoped.eq("space_id", spaceId) : scoped.is("space_id", null))
    .order("sort_order", { ascending: false });
  if (listError) {
    console.error("uploadPhoto list failed:", listError);
    return { ok: false };
  }
  const nextOrder = (existing[0]?.sort_order ?? -1) + 1;
  // First site photo becomes the hero; later ones are gallery; space photos
  // always use role 'room'.
  const role: PhotoItem["role"] =
    scope.kind === "space" ? "room" : existing.some((p) => p.role === "hero") ? "gallery" : "hero";

  const path = buildPhotoPath(orgId, scope, crypto.randomUUID(), kind.ext);
  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (uploadError) {
    console.error("uploadPhoto storage upload failed:", uploadError);
    return { ok: false };
  }

  const { data: row, error: insertError } = await supabase
    .from("photos")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      space_id: spaceId,
      storage_path: path,
      role,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (insertError) {
    console.error("uploadPhoto insert failed:", insertError);
    await removeObjects(supabase, [path]); // compensation: no orphan object
    return { ok: false };
  }
  return { ok: true, id: row.id };
}

export async function deletePhoto(supabase: Client, orgId: string, photoId: string): Promise<Result> {
  const { data: photo, error } = await supabase
    .from("photos")
    .select("storage_path, role, space_id, property_id")
    .eq("org_id", orgId)
    .eq("id", photoId)
    .maybeSingle();
  if (error || !photo) {
    if (error) console.error("deletePhoto lookup failed:", error);
    return { ok: false };
  }
  if (!(await removeObjects(supabase, [photo.storage_path]))) return { ok: false };

  const { data: deleted, error: deleteError } = await supabase
    .from("photos")
    .delete()
    .eq("org_id", orgId)
    .eq("id", photoId)
    .select("id");
  if (deleteError || deleted.length !== 1) {
    console.error("deletePhoto row delete failed:", deleteError ?? `got ${deleted?.length} rows`);
    return { ok: false };
  }

  // Deleting the hero must not leave the public site without a cover: promote
  // the next site photo. Best effort — the delete itself already succeeded.
  if (photo.role === "hero" && photo.space_id === null) {
    const { data: next } = await supabase
      .from("photos")
      .select("id")
      .eq("org_id", orgId)
      .eq("property_id", photo.property_id)
      .is("space_id", null)
      .order("sort_order")
      .order("id")
      .limit(1);
    if (next?.[0]) await setHeroPhoto(supabase, photo.property_id, next[0].id);
  }
  return { ok: true };
}

// Objects first, then the space (the FK cascade removes its photo rows but
// never Storage objects). If the space delete fails the rows now point at
// removed objects; a retry re-lists them and finishes.
export async function deleteSpaceWithPhotos(
  supabase: Client,
  orgId: string,
  spaceId: string,
  deleteSpaceRow: (supabase: Client, orgId: string, id: string) => Promise<Result>
): Promise<Result> {
  const { data: photos, error } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("org_id", orgId)
    .eq("space_id", spaceId);
  if (error) {
    console.error("deleteSpaceWithPhotos list failed:", error);
    return { ok: false };
  }
  if (!(await removeObjects(supabase, photos.map((p) => p.storage_path)))) return { ok: false };
  return deleteSpaceRow(supabase, orgId, spaceId);
}

export async function reorderPhotos(
  supabase: Client,
  propertyId: string,
  spaceId: string | null,
  ids: string[]
): Promise<Result> {
  const { data, error } = await supabase.rpc("reorder_photos", {
    p_property_id: propertyId,
    p_ids: ids,
    p_space_id: spaceId ?? undefined,
  });
  if (error || data !== ids.length) {
    console.error("reorder_photos failed:", error ?? `expected ${ids.length} rows, changed ${data}`);
    return { ok: false };
  }
  return { ok: true };
}

export async function setHeroPhoto(supabase: Client, propertyId: string, photoId: string): Promise<Result> {
  const { data, error } = await supabase.rpc("set_hero_photo", { p_property_id: propertyId, p_photo_id: photoId });
  if (error || data !== 1) {
    console.error("set_hero_photo failed:", error ?? `changed ${data}`);
    return { ok: false };
  }
  return { ok: true };
}

// ─── Logo ───────────────────────────────────────────────────────────────────

export async function setLogo(
  supabase: Client,
  args: { orgId: string; bytes: Uint8Array; kind: ImageKind }
): Promise<Result> {
  const { orgId, bytes, kind } = args;
  const { data: current, error: readError } = await supabase
    .from("properties")
    .select("logo_path")
    .eq("org_id", orgId)
    .maybeSingle();
  if (readError || !current) {
    if (readError) console.error("setLogo read failed:", readError);
    return { ok: false };
  }

  const path = buildPhotoPath(orgId, { kind: "branding" }, crypto.randomUUID(), kind.ext);
  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (uploadError) {
    console.error("setLogo upload failed:", uploadError);
    return { ok: false };
  }

  const { data: updated, error: updateError } = await supabase
    .from("properties")
    .update({ logo_path: path })
    .eq("org_id", orgId)
    .select("id");
  if (updateError || updated.length !== 1) {
    console.error("setLogo update failed:", updateError ?? `got ${updated?.length} rows`);
    await removeObjects(supabase, [path]);
    return { ok: false };
  }
  // Best effort: a leftover old logo is harmless; a failed removal is logged.
  if (current.logo_path) await removeObjects(supabase, [current.logo_path]);
  return { ok: true };
}

export async function removeLogo(supabase: Client, orgId: string): Promise<Result> {
  const { data: current, error: readError } = await supabase
    .from("properties")
    .select("logo_path")
    .eq("org_id", orgId)
    .maybeSingle();
  if (readError || !current) {
    if (readError) console.error("removeLogo read failed:", readError);
    return { ok: false };
  }
  const { data: updated, error } = await supabase
    .from("properties")
    .update({ logo_path: null })
    .eq("org_id", orgId)
    .select("id");
  if (error || updated.length !== 1) {
    console.error("removeLogo update failed:", error ?? `got ${updated?.length} rows`);
    return { ok: false };
  }
  if (current.logo_path) await removeObjects(supabase, [current.logo_path]);
  return { ok: true };
}

export async function getLogoUrl(supabase: Client, orgId: string): Promise<string | null> {
  const { data } = await supabase.from("properties").select("logo_path").eq("org_id", orgId).maybeSingle();
  return data?.logo_path ? getPublicPhotoUrl(data.logo_path) : null;
}
