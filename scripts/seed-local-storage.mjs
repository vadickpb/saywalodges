#!/usr/bin/env node
// Uploads the real property photos into the LOCAL Supabase Storage bucket, so
// the public site looks like production in local dev instead of a page of
// broken images. `supabase db reset` seeds the `photos` rows but never the
// files themselves; those originals still live in git, at the commit right
// before SD-001 moved them into Storage.
//
// Credentials come from `supabase status` (the local stack's own dev keys),
// never from .env files — so this script can only ever reach the local
// stack. The host check below is a second guard on top of that.
//
// Usage: npm run db:seed-storage   (after `npx supabase start` / `db reset`)

import { execFileSync, execSync } from "node:child_process";

const SOURCE_COMMIT = "2317c8c^";
const BUCKET = "property-photos";

function localStackEnv() {
  const out = execSync("npx supabase status -o env", { encoding: "utf8" });
  const read = (key) => out.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, "m"))?.[1];
  return { url: read("API_URL"), serviceKey: read("SERVICE_ROLE_KEY") };
}

// "site/foto3.jpeg" → "public/images/foto3.jpeg"
// "rooms/pool/pool-01.jpeg" → "public/images/pool/pool-01.jpeg"
// "demo/<same as above>" → same source file (the demo tenant reuses photos)
// Paths come from the (local) DB, which any signed-in dev user can write to:
// only plain image paths pass, so nothing odd reaches git or the upload URL.
const SAFE_PATH = /^(demo\/)?(site|rooms)\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.jpe?g$/;

function sourcePathFor(storagePath) {
  if (!SAFE_PATH.test(storagePath)) return null;
  const path = storagePath.replace(/^demo\//, "");
  if (path.startsWith("site/")) return `public/images/${path.slice("site/".length)}`;
  if (path.startsWith("rooms/")) return `public/images/${path.slice("rooms/".length)}`;
  return null;
}

async function main() {
  const { url, serviceKey } = localStackEnv();
  if (!url || !serviceKey) throw new Error("Local Supabase isn't running — run `npx supabase start` first.");

  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing to upload to non-local Supabase (${hostname}). This script is local-dev only.`);
  }

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const res = await fetch(`${url}/rest/v1/photos?select=storage_path`, { headers });
  if (!res.ok) throw new Error(`Couldn't list photos rows: ${res.status} ${await res.text()}`);
  const paths = [...new Set((await res.json()).map((row) => row.storage_path))];

  let uploaded = 0;
  const skipped = [];
  for (const storagePath of paths) {
    const source = sourcePathFor(storagePath);
    if (!source) {
      skipped.push(storagePath);
      continue;
    }
    const file = execFileSync("git", ["show", `${SOURCE_COMMIT}:${source}`], { maxBuffer: 50 * 1024 * 1024 });
    const upload = await fetch(`${url}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "image/jpeg", "x-upsert": "true" },
      body: file,
    });
    if (!upload.ok) throw new Error(`Upload failed for ${storagePath}: ${upload.status} ${await upload.text()}`);
    uploaded++;
  }

  console.log(`Uploaded ${uploaded} photo(s) to local Storage.`);
  if (skipped.length) console.log(`Skipped (no known source in git): ${skipped.join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
