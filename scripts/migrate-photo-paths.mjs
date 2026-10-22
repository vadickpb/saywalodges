// SD-202 · one-shot: move Storage objects to the `{org_id}/...` prefix that the
// storage.objects RLS policies require, and point the DB at the new paths.
//
//   legacy                         → new
//   site/foto1.jpeg                → {org_id}/site/foto1.jpeg
//   rooms/pool/pool-01.jpeg        → {org_id}/spaces/pool/pool-01.jpeg
//   gallery/<ts>-<name>            → {org_id}/site/gallery/<ts>-<name>
//   branding/logo-<ts>-<name>      → {org_id}/branding/logo-<ts>-<name>
//
// Covers photos.storage_path and properties.logo_path. Uses the service-role
// key, so it is run BY A PERSON against the target project — Claude never
// runs it against the remote (CLAUDE.md). Safe order, nothing is deleted
// until you ask for it:
//
//   1. dry run (default)         node --env-file=.env.local scripts/migrate-photo-paths.mjs
//   2. copy + verify + repoint   node --env-file=.env.local scripts/migrate-photo-paths.mjs --apply
//      (copies each object, checks the NEW public URL answers 200, and only
//       then updates the DB rows; re-running is idempotent)
//   3. check the public site by eye, then remove the old objects:
//                                node --env-file=.env.local scripts/migrate-photo-paths.mjs --prune
//      (deletes legacy objects no DB row references any more)
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.

import { createClient } from "@supabase/supabase-js";

const BUCKET = "property-photos";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. --env-file=.env.local).");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const prune = process.argv.includes("--prune");
if (apply && prune) {
  console.error("Run --apply and --prune as separate steps (check the site in between).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const publicUrl = (p) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p.split("/").map(encodeURIComponent).join("/")}`;

// photos.storage_path is writable by any member of the org (RLS only checks
// org_id), so legacy paths are treated as untrusted: strict allowlist, no "..",
// and anything else is reported and skipped instead of copied with service-role
// or aborting the run for every tenant.
const LEGACY_RE = /^(site|rooms|gallery|branding)\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

function newPathFor(orgId, oldPath) {
  const [first, ...rest] = oldPath.split("/");
  if (UUID_RE.test(first)) return oldPath; // already migrated
  if (!LEGACY_RE.test(oldPath) || oldPath.split("/").includes("..")) return null;
  const tail = rest.join("/");
  if (first === "rooms") return `${orgId}/spaces/${tail}`;
  if (first === "site") return `${orgId}/site/${tail}`;
  if (first === "gallery") return `${orgId}/site/gallery/${tail}`;
  if (first === "branding") return `${orgId}/branding/${tail}`;
  return null;
}

async function load() {
  const { data: photos, error: photosError } = await supabase.from("photos").select("id, org_id, storage_path");
  if (photosError) throw photosError;
  const { data: props, error: propsError } = await supabase.from("properties").select("id, org_id, logo_path");
  if (propsError) throw propsError;

  const items = [];
  for (const p of photos) items.push({ table: "photos", id: p.id, column: "storage_path", orgId: p.org_id, oldPath: p.storage_path });
  for (const p of props) if (p.logo_path) items.push({ table: "properties", id: p.id, column: "logo_path", orgId: p.org_id, oldPath: p.logo_path });
  const mapped = items.map((i) => ({ ...i, newPath: newPathFor(i.orgId, i.oldPath) }));
  for (const i of mapped) {
    if (i.newPath === null) console.warn(`SKIPPED unrecognised path (${i.table}/${i.id}): ${JSON.stringify(i.oldPath)}`);
  }
  return mapped.filter((i) => i.newPath !== null);
}

async function verifyUrl(p) {
  const res = await fetch(publicUrl(p), { method: "HEAD" });
  return res.ok;
}

async function main() {
  const items = await load();
  const todo = items.filter((i) => i.newPath !== i.oldPath);
  console.log(`${items.length} referenced objects, ${todo.length} need moving.`);

  if (prune) {
    // After --apply every row already points at the new prefix, so stale
    // objects are found by listing the legacy top-level folders.
    const referenced = new Set(items.map((i) => i.oldPath));
    const legacy = [];
    for (const folder of ["site", "rooms", "gallery", "branding"]) {
      const walk = async (dir) => {
        const { data, error } = await supabase.storage.from(BUCKET).list(dir, { limit: 1000 });
        if (error) throw error;
        for (const e of data) {
          const full = `${dir}/${e.name}`;
          if (e.id === null) await walk(full); // folder
          else legacy.push(full);
        }
      };
      await walk(folder);
    }
    const unreferenced = legacy.filter((p) => !referenced.has(p));
    console.log(`Legacy objects still in Storage: ${legacy.length}; unreferenced: ${unreferenced.length}.`);
    if (unreferenced.length === 0) return;
    const { error } = await supabase.storage.from(BUCKET).remove(unreferenced);
    if (error) throw error;
    console.log(`Removed ${unreferenced.length} legacy objects.`);
    return;
  }

  for (const i of todo) console.log(`${apply ? "move" : "would move"}  ${i.oldPath}  →  ${i.newPath}`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to copy, verify and repoint.");
    return;
  }

  // 1. copy (skip when the destination already exists → idempotent re-runs)
  for (const i of todo) {
    const { error } = await supabase.storage.from(BUCKET).copy(i.oldPath, i.newPath);
    if (error && !/already exists|Duplicate/i.test(error.message)) {
      throw new Error(`Copy failed for ${i.oldPath}: ${error.message}`);
    }
  }

  // 2. verify every NEW public URL before touching the database
  const broken = [];
  for (const i of todo) if (!(await verifyUrl(i.newPath))) broken.push(i.newPath);
  if (broken.length > 0) {
    console.error(`ABORTING before any DB change — ${broken.length} new URL(s) do not answer 200:`);
    for (const p of broken) console.error(`  ${p}`);
    process.exit(1);
  }

  // 3. repoint the rows
  for (const i of todo) {
    const { error } = await supabase.from(i.table).update({ [i.column]: i.newPath }).eq("id", i.id);
    if (error) throw new Error(`DB update failed for ${i.table}/${i.id}: ${error.message}`);
  }

  // 4. final check from the DB's point of view
  const after = await load();
  const stillBroken = [];
  for (const i of after) if (!(await verifyUrl(i.oldPath))) stillBroken.push(i.oldPath);
  if (stillBroken.length > 0) {
    console.error(`${stillBroken.length} referenced URL(s) are broken after the move:`, stillBroken);
    process.exit(1);
  }
  console.log(`Done: ${todo.length} moved, all ${after.length} referenced URLs answer 200. Old objects are untouched; run with --prune after checking the site.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
