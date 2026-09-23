import { NextResponse } from "next/server";
import { getSupabase, getPublicPhotoUrl, PHOTOS_BUCKET } from "@/lib/supabase";
import { getProperty } from "@/lib/property";
import {
  photosOrderPayloadSchema,
  photoDeletePayloadSchema,
  validateImageFile,
} from "@/lib/validation/admin";
import { serverError, validationError } from "@/lib/api-error";

// Manages the top-level hero + gallery photos (room_id null). Room photos are
// seeded once by the migration script and not yet editable here — see the
// Fase 0 plan for why that's deliberately out of scope for now.

export async function GET() {
  const property = await getProperty();
  const { data, error } = await getSupabase()
    .from("photos")
    .select("id, storage_path, role, sort_order")
    .eq("property_id", property.id)
    .is("room_id", null)
    .in("role", ["hero", "gallery"])
    .order("role")
    .order("sort_order");

  if (error) return serverError("admin/photos GET", error);

  return NextResponse.json({
    photos: (data ?? []).map((p) => ({
      id: p.id,
      url: getPublicPhotoUrl(p.storage_path),
      role: p.role as "hero" | "gallery",
    })),
  });
}

export async function POST(request: Request) {
  const property = await getProperty();
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const fileError = validateImageFile(file);
  if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

  const supabase = getSupabase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `gallery/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) return serverError("admin/photos POST upload", uploadError);

  const { data: existing, error: readError } = await supabase
    .from("photos")
    .select("sort_order")
    .eq("property_id", property.id)
    .eq("role", "gallery")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (readError) return serverError("admin/photos POST read", readError);

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data: inserted, error: insertError } = await supabase
    .from("photos")
    .insert({
      property_id: property.id,
      room_id: null,
      storage_path: storagePath,
      role: "gallery",
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (insertError) return serverError("admin/photos POST insert", insertError);

  return NextResponse.json({ id: inserted.id, url: getPublicPhotoUrl(storagePath) });
}

export async function PUT(request: Request) {
  const json = await request.json();
  const parsed = photosOrderPayloadSchema.safeParse(json);
  if (!parsed.success) return validationError("admin/photos PUT", parsed.error);
  const { heroId, order } = parsed.data;

  const supabase = getSupabase();

  try {
    if (heroId) {
      const { error } = await supabase.from("photos").update({ role: "hero" }).eq("id", heroId);
      if (error) throw error;
    }

    for (let i = 0; i < order.length; i++) {
      const { error } = await supabase
        .from("photos")
        .update({ role: "gallery", sort_order: i })
        .eq("id", order[i]);
      if (error) throw error;
    }
  } catch (err) {
    return serverError("admin/photos PUT", err);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const json = await request.json();
  const parsed = photoDeletePayloadSchema.safeParse(json);
  if (!parsed.success) return validationError("admin/photos DELETE", parsed.error);
  const { id } = parsed.data;

  const supabase = getSupabase();
  const { data: photo, error: readError } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (readError || !photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error: storageError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .remove([photo.storage_path]);
  if (storageError) return serverError("admin/photos DELETE storage", storageError);

  const { error: deleteError } = await supabase.from("photos").delete().eq("id", id);
  if (deleteError) return serverError("admin/photos DELETE", deleteError);

  return NextResponse.json({ ok: true });
}
