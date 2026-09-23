import { NextResponse } from "next/server";
import { getSupabase, getPublicPhotoUrl, PHOTOS_BUCKET } from "@/lib/supabase";
import { getProperty } from "@/lib/property";

// Single-file logo upload — separate from /api/admin/photos since a logo has
// no role/order, just one path stored directly on the property row.

export async function POST(request: Request) {
  const property = await getProperty();
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const supabase = getSupabase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `branding/logo-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from("properties")
    .update({ logo_path: storagePath })
    .eq("id", property.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ url: getPublicPhotoUrl(storagePath) });
}

export async function DELETE() {
  const property = await getProperty();
  const { error } = await getSupabase()
    .from("properties")
    .update({ logo_path: null })
    .eq("id", property.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
