import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "public", "photos.json");

export interface PhotosConfig {
  hero: string;
  gallery: string[];
}

export async function getPhotosConfig(): Promise<PhotosConfig> {
  const raw = await readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

export async function savePhotosConfig(config: PhotosConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}
