// SD-308 HTTP + real local Postgres integration for the public availability calendar.
// Build first with local Supabase env (see docs/roadmap.md SD-308). Owns its app process
// on port 3308, writes only fixtures marked SD308 and restores what it changes.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

for (const file of [".env", ".env.local", ".env.production", ".env.production.local"])
  assert.ok(!existsSync(file), `Must not load ${file}`);
const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
assert.equal(status.API_URL, "http://127.0.0.1:54321", "Only local Supabase is allowed");

const PORT = 3308;
const ROOT = `localhost:${PORT}`;
const saywa = { org: "bf88f504-051f-4fdc-ab73-4fa12d715817", property: "131583b5-785e-4127-81f0-e097163c5654", unit: "ee204001-0000-4000-8000-000000000001" };
const demo = { org: "ff24bacc-47d2-40bc-9210-f860e98892fd", property: "57f914ac-3890-47c1-9d6d-1492782cf712", unit: "ee204001-0000-4000-8000-000000000002" };
const NOTE = "SD308-SECRET-NOTE";
const UID = "SD308-SECRET-UID@airbnb.example";
const feed = randomUUID();
const booking = randomUUID();

const sql = (query) =>
  execFileSync("docker", ["exec", "-i", "supabase_db_saywa-lodges", "psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres", "-c", query], { encoding: "utf8" }).trim();

// Civil dates in Lima, independent of this machine's timezone.
const todayLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const [y0, m0] = todayLima.split("-").map(Number);
const monthOf = (delta) => { const i = y0 * 12 + (m0 - 1) + delta; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; };
const CURRENT = monthOf(0);
const M = monthOf(1); // fully in the future, always navigable
const MAX = monthOf(22);
const day = (n) => `${M}-${String(n).padStart(2, "0")}`;

const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_URL: status.API_URL, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, ROOT_DOMAIN: ROOT },
  stdio: ["ignore", "pipe", "pipe"],
});
let appOutput = "";
app.stdout.on("data", (b) => { appOutput += b; });
app.stderr.on("data", (b) => { appOutput += b; });

const get = (host, path) => new Promise((resolve, reject) => {
  const req = httpRequest({ host: "127.0.0.1", port: PORT, path, headers: { Host: `${host}:${PORT}` }, signal: AbortSignal.timeout(15000) }, (res) => {
    let body = ""; res.setEncoding("utf8"); res.on("data", (c) => (body += c)); res.on("end", () => resolve({ status: res.statusCode, body }));
  });
  req.on("error", reject); req.end();
});
const labels = (html) => [...html.matchAll(/<span class="sr-only">([^<]*?: [^<]+)<\/span>/g)].map((m) => m[1]);
const daysWith = (html, word) => labels(html).filter((l) => l.endsWith(`: ${word}`) || l.includes(`: ${word},`)).map((l) => Number(/ (\d{1,2}) (?:de )?[^\d]+ (?:de )?\d{4}:/.exec(l)?.[1]));
const rest = async (path, init = {}) => fetch(`${status.API_URL}${path}`, { ...init, headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.ANON_KEY}`, "Content-Type": "application/json", ...init.headers } });

const original = {
  demoPublished: sql(`select published from public.properties where id='${demo.property}'`),
  sayaUnitActive: sql(`select active from public.units where id='${saywa.unit}'`),
};
const ok = (name) => console.log(`PASS ${name}`);

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await get("saywa-lodges.localhost", "/")).status < 500) break; } catch {}
    await sleep(500);
    assert.ok(i < 59, `App did not start:\n${appOutput}`);
  }

  sql(`insert into public.ical_feeds(id,org_id,unit_id,channel) values ('${feed}','${saywa.org}','${saywa.unit}','airbnb');
    insert into public.calendar_blocks(org_id,property_id,unit_id,period,source,note) values
      ('${saywa.org}','${saywa.property}','${saywa.unit}','[${day(10)},${day(12)})','manual','${NOTE}'),
      ('${demo.org}','${demo.property}','${demo.unit}','[${day(10)},${day(15)})','manual','${NOTE}-DEMO');
    insert into public.calendar_blocks(org_id,property_id,unit_id,period,source,feed_id,external_uid) values
      ('${saywa.org}','${saywa.property}','${saywa.unit}','[${day(12)},${day(14)})','ical','${feed}','${UID}');
    insert into public.calendar_blocks(org_id,property_id,unit_id,period,source,booking_id,expires_at) values
      ('${saywa.org}','${saywa.property}','${saywa.unit}','[${day(20)},${day(23)})','booking','${booking}', now() + interval '1 hour');`);

  // ── Tenant data, adjacency, half-open semantics (es) ──
  const es = await get("saywa-lodges.localhost", `/es?month=${M}`);
  assert.equal(es.status, 200);
  assert.deepEqual(daysWith(es.body, "Ocupado"), [10, 11, 12, 13, 20, 21, 22]);
  assert.ok(daysWith(es.body, "Libre").includes(14), "check-out day of the last stay is free");
  assert.ok(daysWith(es.body, "Libre").includes(23), "check-out day of the hold is free");
  assert.ok(daysWith(es.body, "Libre").includes(9));
  assert.equal(daysWith(es.body, "Ocupado").length + daysWith(es.body, "Libre").length, new Date(Date.UTC(+M.slice(0, 4), +M.slice(5), 0)).getUTCDate());
  ok("Saywa es: occupied nights [) incl. adjacent manual+ical+hold; check-out days free");

  const en = await get("saywa-lodges.localhost", `/en?month=${M}`);
  assert.deepEqual(daysWith(en.body, "Occupied"), [10, 11, 12, 13, 20, 21, 22]);
  assert.match(en.body, /aria-label="Previous month"/);
  assert.match(en.body, /Occupied night/);
  ok("Saywa en: same data, English labels and controls");

  // ── Tenant isolation ──
  const demoEs = await get("demo.localhost", `/es?month=${M}`);
  assert.equal(demoEs.status, 200);
  assert.deepEqual(daysWith(demoEs.body, "Ocupado"), [10, 11, 12, 13, 14]);
  assert.ok(!demoEs.body.includes(saywa.unit) && !es.body.includes(demo.unit), "no cross-tenant unit ids");
  ok("demo.localhost shows only its own unit's nights");

  const spoof = await get("saywa-lodges.localhost", `/es?month=${M}&unit=${demo.unit}`);
  assert.deepEqual(daysWith(spoof.body, "Ocupado"), [10, 11, 12, 13, 20, 21, 22]);
  // The id only comes back as the echoed query string; no link, label or data uses it.
  assert.ok(!spoof.body.includes(`href="?unit=${demo.unit}`));
  assert.ok(spoof.body.includes(`?unit=${saywa.unit}&`), "links use the resolved own unit");
  ok("?unit= of another tenant is ignored (falls back to own unit)");

  const unknown = await get("nope.localhost", "/es");
  assert.equal(unknown.status, 404);
  ok("unknown host 404");

  // ── Privacy of the rendered page ──
  for (const html of [es.body, en.body, demoEs.body]) {
    for (const secret of [NOTE, UID, feed, booking, "airbnb.example", "calendar_blocks", "external_uid", "feed_id", "booking_id", '"source"', "expires_at"])
      assert.ok(!html.includes(secret), `page leaks ${secret}`);
  }
  ok("rendered HTML (RSC payload included) carries no note, uid, feed, booking or source");

  // ── Month limits ──
  const first = await get("saywa-lodges.localhost", `/es?month=${CURRENT}`);
  assert.match(first.body, /<span aria-disabled="true"[^>]*><span class="sr-only">Mes anterior/);
  assert.match(first.body, /aria-label="Mes siguiente"/);
  for (const bad of ["2020-01", "garbage", "2026-13", "", `${CURRENT}-01`]) {
    const r = await get("saywa-lodges.localhost", `/es?month=${encodeURIComponent(bad)}`);
    assert.equal(r.status, 200);
    assert.match(r.body, /<span aria-disabled="true"[^>]*><span class="sr-only">Mes anterior/, `bad month ${bad} falls back to current`);
  }
  const last = await get("saywa-lodges.localhost", `/es?month=2099-01`);
  assert.match(last.body, /<span aria-disabled="true"[^>]*><span class="sr-only">Mes siguiente/);
  assert.match(last.body, /aria-label="Mes anterior"/);
  assert.ok(last.body.includes(`month=${monthOf(21)}`), `max month is ${MAX}, previous link points to ${monthOf(21)}`);
  ok("month navigation: lower/upper bounds disabled, malformed or out-of-range input clamped");

  // ── Mobile-friendly markup ──
  assert.match(es.body, /<meta name="viewport"/);
  assert.match(es.body, /<table[^>]*class="[^"]*w-full[^"]*table-fixed/);
  assert.equal((es.body.match(/<th[^>]*scope="col"/g) ?? []).length, 7);
  assert.match(es.body, /min-h-10/);
  assert.match(es.body, /aria-labelledby="availability-calendar-caption"/);
  ok("mobile/a11y markup: viewport, fixed 7-column table, 40px+ cells, labelled caption, column headers");

  // ── Direct anonymous API access ──
  const direct = await rest("/rest/v1/calendar_blocks?select=*");
  assert.ok([401, 403].includes(direct.status), `anon table read is denied, got ${direct.status}`);
  assert.doesNotMatch(await direct.text(), new RegExp(NOTE));
  const rpcBody = (p, u) => JSON.stringify({ p_property_id: p, p_unit_id: u, p_from: day(1), p_to: monthOf(2) + "-01" });
  const good = await rest("/rest/v1/rpc/get_public_unit_availability", { method: "POST", body: rpcBody(saywa.property, saywa.unit) });
  const rows = await good.json();
  assert.equal(good.status, 200);
  assert.deepEqual(rows.map((r) => Object.keys(r).sort()).flat().filter((k, i, a) => a.indexOf(k) === i), ["end_date", "start_date"]);
  assert.deepEqual(rows.map((r) => [r.start_date, r.end_date]), [[day(10), day(12)], [day(12), day(14)], [day(20), day(23)]]);
  const cross = await rest("/rest/v1/rpc/get_public_unit_availability", { method: "POST", body: rpcBody(saywa.property, demo.unit) });
  assert.ok([401, 403].includes(cross.status)); // PostgREST surfaces 42501 as 401 (anon) / 403
  assert.equal((await cross.json()).code, "42501");
  ok("PostgREST anon: table denied; RPC returns bare ranges only; cross-tenant pair rejected");

  // ── Unpublished property / inactive unit ──
  sql(`update public.properties set published=false where id='${demo.property}'`);
  assert.equal((await get("demo.localhost", "/es")).status, 404);
  sql(`update public.properties set published=${original.demoPublished === "t"} where id='${demo.property}'`);
  sql(`update public.units set active=false where id='${saywa.unit}'`);
  const inactive = await get("saywa-lodges.localhost", "/es");
  assert.equal(inactive.status, 200);
  assert.ok(!inactive.body.includes("availability-calendar"), "no calendar when the property has no active unit");
  sql(`update public.units set active=${original.sayaUnitActive === "t"} where id='${saywa.unit}'`);
  ok("unpublished tenant 404; no active unit => no calendar section");
  console.log("ALL PASS");
} catch (error) {
  console.error(appOutput.slice(-3000));
  throw error;
} finally {
  sql(`update public.properties set published=${original.demoPublished === "t"} where id='${demo.property}';
    update public.units set active=${original.sayaUnitActive === "t"} where id='${saywa.unit}';
    delete from public.calendar_blocks where note like '${NOTE}%' or feed_id='${feed}' or booking_id='${booking}';
    delete from public.ical_feeds where id='${feed}';`);
  app.kill("SIGTERM");
  await new Promise((resolve) => (app.exitCode !== null ? resolve() : app.once("exit", resolve)));
}
