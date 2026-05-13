import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";
import { getPhotosConfig, savePhotosConfig } from "@/lib/photos";

const IMAGES_DIR = join(process.cwd(), "public", "images");
const ALLOWED = /\.(jpe?g|png|webp|gif|svg)$/i;

export async function GET() {
  const [files, config] = await Promise.all([
    readdir(IMAGES_DIR),
    getPhotosConfig(),
  ]);
  return NextResponse.json({
    files: files.filter((f) => ALLOWED.test(f)),
    config,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  await savePhotosConfig(body);
  return NextResponse.json({ ok: true });
}
