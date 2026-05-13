import { NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";

const IMAGES_DIR = join(process.cwd(), "public", "images");

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(IMAGES_DIR, name), buffer);
  return NextResponse.json({ ok: true, filename: name });
}

export async function DELETE(request: Request) {
  const { filename } = await request.json();
  if (!filename || filename.includes(".."))
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  await unlink(join(IMAGES_DIR, filename));
  return NextResponse.json({ ok: true });
}
