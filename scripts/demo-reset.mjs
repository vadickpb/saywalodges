#!/usr/bin/env node
// Nightly reset of the shared demo installation (SD-1007, ADR 0010):
//   node scripts/demo-reset.mjs            dry run (default): checks and prints, changes nothing
//   node scripts/demo-reset.mjs --apply    deletes the demo organization (cascade) and re-creates it
//   node scripts/demo-reset.mjs --apply --init   FIRST run only (by hand, never from the workflow): creates the demo in an
//                                          EMPTY project. Without --init the demo organization must already exist.
//
// Environment: DEMO_SUPABASE_URL (https://<ref>.supabase.co), DEMO_SERVICE_ROLE_KEY, optional DEMO_ROOT_DOMAIN.
//
// This is DESTRUCTIVE, so it refuses to run unless the target project holds NO organization other than the
// demo's: a real installation always has its own, so pointing this at a client's project aborts before deleting
// anything. It only ever deletes the organization with the fixed demo id.
import { DEMO_ORG_ID, DEMO_STAFF_EMAIL, DEMO_STAFF_PASSWORD, INSERT_ORDER, PRIVATE_BUCKETS, TABLE_OF, buildDemoData, validateDemoData } from "./lib/demo-data.mjs";

const apply = process.argv.includes("--apply");
const init = process.argv.includes("--init");
const fail = (m) => { console.error(`::error::${m}`); process.exit(1); };

const base = process.env.DEMO_SUPABASE_URL?.trim().replace(/\/$/, "");
const key = process.env.DEMO_SERVICE_ROLE_KEY;
if (!base || !key) fail("DEMO_SUPABASE_URL and DEMO_SERVICE_ROLE_KEY are required");
// The local stack (supabase start) is allowed so the script can be tried on a laptop; anything else must be a hosted project.
if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(base)) fail("DEMO_SUPABASE_URL must look like https://<20-letter-ref>.supabase.co");
const rootDomain = process.env.DEMO_ROOT_DOMAIN?.trim() || undefined;

async function call(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...(prefer ? { prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  // Status and path only: bodies can echo submitted data.
  if (!res.ok) fail(`${method} ${path.split("?")[0]} → HTTP ${res.status}`);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

// 1 ── guard: nothing but the demo organization may exist here
const others = await call(`/rest/v1/organizations?select=id&id=neq.${DEMO_ORG_ID}&limit=1`);
if (!Array.isArray(others) || others.length > 0) fail("REFUSING TO RESET: this project has an organization that is not the demo. DEMO_SUPABASE_URL must point to the demo project only.");
// Positive identification: the guard above also passes on a project with NO organizations (a client installed but not
// yet seeded). So the demo organization must already be there, unless the operator explicitly passes --init by hand.
const existing = await call(`/rest/v1/organizations?select=id&id=eq.${DEMO_ORG_ID}`);
if (!Array.isArray(existing)) fail("unexpected answer from the project");
if (existing.length === 0 && !init) fail("REFUSING TO RESET: the demo organization does not exist here, so this project is not recognised as the demo. For the very first run use --apply --init by hand.");
if (existing.length > 0 && init) fail("--init is only for an empty project: the demo organization already exists.");
// New users must not be able to register themselves in the demo (a registered user has no membership, but the door stays shut).
const settings = await call("/auth/v1/settings");
if (settings?.disable_signup !== true) fail('Sign-up is open in this project. Turn OFF "Allow new users to sign up" (Supabase → Authentication → Sign In / Providers) and retry.');
console.log("Guard passed: only the demo organization (or an empty project with --init), sign-up closed.");

const data = buildDemoData(new Date(), { rootDomain });
// Validate everything BEFORE touching data: a failure after the delete would leave the demo empty.
const problems = validateDemoData(data);
if (problems.length > 0) fail(`Invalid demo configuration: ${problems.join("; ")}`);
if (!apply) {
  console.log(`[dry-run] would reset the demo: ${INSERT_ORDER.map((k) => `${TABLE_OF[k]}(${[].concat(data[k]).length})`).join(", ")} + staff ${DEMO_STAFF_EMAIL}`);
  process.exit(0);
}

// 2 ── staff user (kept between resets; its password is re-set every night because anyone may change it in the demo)
const list = await call("/auth/v1/admin/users?per_page=200");
let staffId = list.users?.find((u) => u.email?.toLowerCase() === DEMO_STAFF_EMAIL)?.id;
if (staffId) await call(`/auth/v1/admin/users/${staffId}`, { method: "PUT", body: { password: DEMO_STAFF_PASSWORD, email_confirm: true } });
else staffId = (await call("/auth/v1/admin/users", { method: "POST", body: { email: DEMO_STAFF_EMAIL, password: DEMO_STAFF_PASSWORD, email_confirm: true } })).id;
if (!staffId) fail("could not create or find the demo staff user");

// 3 ── files uploaded to the demo (the staff user may upload photos / receipts): they live under "<org id>/" and are NOT
//      removed by the cascade, so empty that prefix in both buckets first. Failing here aborts before the delete.
async function listFiles(bucket, prefix) {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const page = await call(`/storage/v1/object/list/${bucket}`, { method: "POST", body: { prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } } });
    for (const item of page) {
      if (item.id === null) files.push(...(await listFiles(bucket, `${prefix}/${item.name}`))); // a folder
      else files.push(`${prefix}/${item.name}`);
    }
    if (page.length < 100) return files;
  }
}
for (const bucket of PRIVATE_BUCKETS) {
  const files = await listFiles(bucket, DEMO_ORG_ID);
  for (let i = 0; i < files.length; i += 100) {
    await call(`/storage/v1/object/${bucket}`, { method: "DELETE", body: { prefixes: files.slice(i, i + 100) } });
  }
  if (files.length > 0) console.log(`Removed ${files.length} file(s) from ${bucket}.`);
}

// 4 ── delete the demo organization (ON DELETE CASCADE removes bookings, guests, rates, content…) and rebuild it
await call(`/rest/v1/organizations?id=eq.${DEMO_ORG_ID}`, { method: "DELETE", prefer: "return=minimal" });
for (const group of INSERT_ORDER) {
  await call(`/rest/v1/${TABLE_OF[group]}`, { method: "POST", body: [].concat(data[group]), prefer: "return=minimal" });
}
await call("/rest/v1/memberships", { method: "POST", body: { ...data.membership, user_id: staffId }, prefer: "return=minimal" });
console.log("Demo reset done.");
