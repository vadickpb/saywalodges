#!/usr/bin/env node
// Nightly reset of the shared demo installation (SD-1007, ADR 0010):
//   node scripts/demo-reset.mjs            dry run (default): checks and prints, changes nothing
//   node scripts/demo-reset.mjs --apply    deletes the demo organization (cascade) and re-creates it
//
// Environment: DEMO_SUPABASE_URL (https://<ref>.supabase.co), DEMO_SERVICE_ROLE_KEY, optional DEMO_ROOT_DOMAIN.
//
// This is DESTRUCTIVE, so it refuses to run unless the target project holds NO organization other than the
// demo's: a real installation always has its own, so pointing this at a client's project aborts before deleting
// anything. It only ever deletes the organization with the fixed demo id.
import { DEMO_ORG_ID, DEMO_STAFF_EMAIL, DEMO_STAFF_PASSWORD, INSERT_ORDER, TABLE_OF, buildDemoData } from "./lib/demo-data.mjs";

const apply = process.argv.includes("--apply");
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
if (others.length > 0) fail("REFUSING TO RESET: this project has an organization that is not the demo. DEMO_SUPABASE_URL must point to the demo project only.");
console.log("Guard passed: no organization other than the demo.");

const data = buildDemoData(new Date(), { rootDomain });
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

// 3 ── delete the demo organization (ON DELETE CASCADE removes bookings, guests, rates, content…) and rebuild it
await call(`/rest/v1/organizations?id=eq.${DEMO_ORG_ID}`, { method: "DELETE", prefer: "return=minimal" });
for (const group of INSERT_ORDER) {
  await call(`/rest/v1/${TABLE_OF[group]}`, { method: "POST", body: [].concat(data[group]), prefer: "return=minimal" });
}
await call("/rest/v1/memberships", { method: "POST", body: { ...data.membership, user_id: staffId }, prefer: "return=minimal" });
console.log("Demo reset done.");
