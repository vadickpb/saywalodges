// SD-303 smoke test. Only the seeded local Supabase and localhost app are used.
// Run after `supabase db reset`, `npm run build` and starting the app with local env.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createRequire } from "node:module";
const { encodeReply } = createRequire(import.meta.url)("next/dist/compiled/react-server-dom-webpack/client.node");

const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
assert.equal(status.API_URL, "http://127.0.0.1:54321", "Only local Supabase is allowed");
const base = "http://localhost:3000";
const url = `${base}/app/calendar?month=2027-03`;
const cookies = new Map();
const client = createServerClient(status.API_URL, status.ANON_KEY, { cookies: {
  getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
  setAll: (entries) => entries.forEach(({ name, value }) => cookies.set(name, value)),
} });
const { error: loginError } = await client.auth.signInWithPassword({ email: "owner@saywalodges.com", password: "devpassword123" });
assert.equal(loginError, null);
const cookie = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const actionId = (name) => {
  const match = Object.entries(manifest.node).find(([, action]) => action.filename === "app/app/calendar/actions.ts" && action.exportedName === name);
  assert.ok(match, `Missing built action ${name}`);
  return match[0];
};
async function action(name, fields, authenticated = true) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  const body = await encodeReply(name === "createManualBlockAction" ? [{ ok: false }, data] : [data]);
  const response = await fetch(url, { method: "POST", headers: { "Next-Action": actionId(name), Origin: base, ...(authenticated ? { Cookie: cookie() } : {}) }, body, redirect: "manual" });
  return { status: response.status, text: await response.text() };
}
const unit = "ee204001-0000-4000-8000-000000000001";
const foreign = "ee204001-0000-4000-8000-000000000002";
const note = `SD303 HTTP local ${Date.now()} <script>alert(1)</script>`;
const fields = { unitId: unit, start: "2027-03-10", end: "2027-03-12", note };
const created = new Set();
async function ownedBlocks() {
  const { data, error } = await client.from("calendar_blocks").select("id, period, note").eq("unit_id", unit).eq("note", note);
  assert.equal(error, null);
  return data;
}
try {
  const anon = await fetch(url, { redirect: "manual" });
  assert.equal(anon.status, 307); assert.match(anon.headers.get("location"), /login/);
  console.log("PASS unauthenticated GET redirects to login");
  const initial = await fetch(url, { headers: { Cookie: cookie() } });
  assert.equal(initial.status, 200); assert.match(await initial.text(), /Ocupación mensual/);
  console.log("PASS authenticated compact calendar GET");
  const success = await action("createManualBlockAction", fields);
  assert.equal(success.status, 200); assert.match(success.text, /"ok":true/);
  const rows = await ownedBlocks(); assert.equal(rows.length, 1); created.add(rows[0].id);
  assert.equal(rows[0].period, "[2027-03-10,2027-03-12)");
  console.log("PASS HTTP Server Action creates persisted half-open manual block");
  const overlap = await action("createManualBlockAction", fields);
  assert.match(overlap.text, /Estas fechas ya están ocupadas/); assert.doesNotMatch(overlap.text, /calendar_blocks_no_overlap|conflicting key|23P01/);
  assert.equal((await ownedBlocks()).length, 1);
  console.log("PASS overlapping HTTP action returns safe constraint message");
  const adjacent = await action("createManualBlockAction", { ...fields, start: "2027-03-12", end: "2027-03-13" });
  assert.match(adjacent.text, /"ok":true/);
  for (const row of await ownedBlocks()) created.add(row.id);
  assert.equal(created.size, 2);
  console.log("PASS adjacent checkout/checkin creates successfully");
  const detail = await fetch(`${url}&unit=${unit}`, { headers: { Cookie: cookie() } });
  const html = await detail.text(); assert.equal(detail.status, 200); assert.match(html, /Ocupación de 2027-03/); assert.match(html, /SD303 HTTP local/);
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  console.log("PASS unit calendar GET and escaped manual note");
  const foreignRead = await fetch(`${url}&unit=${foreign}`, { headers: { Cookie: cookie() } });
  assert.match(await foreignRead.text(), /Unidad no disponible/);
  const foreignWrite = await action("createManualBlockAction", { ...fields, unitId: foreign });
  assert.match(foreignWrite.text, /No se pudo completar la operación del calendario/); assert.doesNotMatch(foreignWrite.text, /unit not found|42501/);
  console.log("PASS foreign unit reads/writes rejected without DB details");
  const invalid = await action("createManualBlockAction", { ...fields, end: fields.start });
  assert.match(invalid.text, /la salida debe ser posterior/);
  const unauthWrite = await action("createManualBlockAction", fields, false);
  assert.ok([200, 303, 307].includes(unauthWrite.status)); assert.match(unauthWrite.text, /login|NEXT_REDIRECT/);
  assert.equal((await ownedBlocks()).length, 2);
  console.log("PASS invalid dates and unauthenticated HTTP mutation rejected");
  for (const id of created) {
    const removed = await action("deleteManualBlockAction", { id });
    assert.match(removed.text, /"ok":true/);
  }
  assert.equal((await ownedBlocks()).length, 0);
  const missing = await action("deleteManualBlockAction", { id: [...created][0] });
  assert.match(missing.text, /No se pudo completar la operación del calendario/); assert.doesNotMatch(missing.text, /block not found|42501/);
  console.log("PASS HTTP delete persists; repeated deletion returns safe error");
} finally {
  // Only remove fixture rows created by this run, using the member RPC.
  for (const row of await ownedBlocks()) await client.rpc("delete_manual_calendar_block", { p_org_id: "bf88f504-051f-4fdc-ab73-4fa12d715817", p_block_id: row.id });
  await client.auth.signOut({ scope: "local" });
}
