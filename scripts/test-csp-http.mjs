// SD-701 HTTP smoke for the per-request CSP. Read-only: never writes to the database.
// Starts its own `next start` (CSP_PORT, default 3208 = the port the CI build bakes in; never in parallel with
// the other smokes) from a prior `next build` and checks real responses:
//   - every route sends a nonce CSP with no unsafe-eval and no unsafe-inline outside style attributes;
//   - every executable <script> in the HTML carries exactly the nonce of that response's header;
//   - the nonce changes per request; API/cron/iCal responses and error responses carry the CSP too.
// Default: LOCAL Supabase stack (CI job `db`), also covering the seeded tenant sites.
// `--no-db`: platform routes only, with placeholder env (no Supabase needed; tenant sites need the DB).
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

for (const file of [".env", ".env.local", ".env.production", ".env.production.local"])
  assert.ok(!existsSync(file), `Must not load ${file}`);

const noDb = process.argv.includes("--no-db");
let supabaseEnv;
if (noDb) {
  supabaseEnv = { API_URL: "https://placeholder.supabase.co", ANON_KEY: "placeholder-anon", SERVICE_ROLE_KEY: "placeholder-service" };
} else {
  supabaseEnv = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
  assert.equal(supabaseEnv.API_URL, "http://127.0.0.1:54321", "Only local Supabase is allowed");
}

const PORT = Number(process.env.CSP_PORT ?? 3208);
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: supabaseEnv.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.ANON_KEY, SUPABASE_URL: supabaseEnv.API_URL, SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.SERVICE_ROLE_KEY, ROOT_DOMAIN: `localhost:${PORT}` },
  stdio: ["ignore", "pipe", "pipe"],
});
let appOutput = "";
app.stdout.on("data", (b) => { appOutput += b; });
app.stderr.on("data", (b) => { appOutput += b; });

const get = (host, path) => new Promise((resolve, reject) => {
  const req = httpRequest({ host: "127.0.0.1", port: PORT, path, headers: { Host: `${host}:${PORT}` }, signal: AbortSignal.timeout(15000) }, (res) => {
    let body = ""; res.setEncoding("utf8"); res.on("data", (c) => (body += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on("error", reject); req.end();
});
const ok = (name) => console.log(`PASS ${name}`);
const nonceOf = (csp) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];

function assertPolicy(res, label) {
  const csp = res.headers["content-security-policy"];
  assert.ok(csp, `${label}: missing Content-Security-Policy`);
  assert.ok(nonceOf(csp), `${label}: no nonce`);
  assert.ok(!csp.includes("unsafe-eval"), `${label}: unsafe-eval`);
  const unsafeInline = csp.split("; ").filter((d) => d.includes("'unsafe-inline'")).map((d) => d.split(" ")[0]);
  assert.deepEqual(unsafeInline, ["style-src-attr"], `${label}: unsafe-inline only on style-src-attr`);
  assert.match(csp, /script-src 'self' 'nonce-[^']+' 'strict-dynamic'(;|$)/, `${label}: script-src`);
  assert.match(csp, /object-src 'none'/);
  assert.equal(res.headers["x-content-type-options"], "nosniff", `${label}: nosniff`);
  assert.equal(res.headers["x-frame-options"], "SAMEORIGIN", `${label}: x-frame-options`);
  assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin", `${label}: referrer-policy`);
  assert.equal(res.headers["cross-origin-opener-policy"], "same-origin-allow-popups", `${label}: coop`);
  return nonceOf(csp);
}

// Every executable script (not a JSON-LD data block) must carry this response's nonce; no inline handlers.
function assertHtmlNonces(res, nonce, label) {
  const tags = [...res.body.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]).filter((attrs) => !/type="application\/ld\+json"/.test(attrs));
  assert.ok(tags.length > 0, `${label}: no scripts found (page not interactive?)`);
  for (const attrs of tags) assert.ok(attrs.includes(`nonce="${nonce}"`), `${label}: script without the response nonce: <script${attrs}>`);
  assert.ok(!/\son[a-z]+="/i.test(res.body.replace(/<script[\s\S]*?<\/script>/g, "")), `${label}: inline event handler in HTML`);
}

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await get("localhost", "/login")).status < 500) break; } catch {}
    await sleep(500);
    assert.ok(i < 59, `App did not start:\n${appOutput}`);
  }

  const pages = [
    ["localhost", "/", 200],
    ["localhost", "/login", 200],
    ["localhost", "/forgot-password", 200],
    ["localhost", "/update-password", 200],
    ...(noDb ? [] : [["saywa-lodges.localhost", "/es", 200], ["saywa-lodges.localhost", "/en", 200], ["demo.localhost", "/es", 200]]),
  ];
  for (const [host, path, status] of pages) {
    const label = `${host}${path}`;
    const res = await get(host, path);
    assert.equal(res.status, status, `${label} status`);
    assertHtmlNonces(res, assertPolicy(res, label), label);
    ok(`${label}: CSP, security headers and nonce on every script`);
  }

  const a = nonceOf((await get("localhost", "/login")).headers["content-security-policy"]);
  const b = nonceOf((await get("localhost", "/login")).headers["content-security-policy"]);
  assert.notEqual(a, b, "nonce must change per request");
  ok("nonce differs per request");

  // Dashboard is auth-gated by lib/dal (redirect to /login), but the redirect still carries the policy.
  const dash = await get("app.localhost", "/app");
  assertPolicy(dash, "app.localhost/app");
  ok(`dashboard route (status ${dash.status}) carries the CSP`);

  // Cron without a bearer secret answers 401 but is still behind the same headers.
  const cron = await get("localhost", "/api/cron/expire-holds");
  assert.equal(cron.status, 401);
  assertPolicy(cron, "cron");
  ok("cron route: 401 without secret, CSP present");

  const ical = await get("localhost", "/api/ical/not-a-real-token");
  assert.equal(ical.status, 404);
  assertPolicy(ical, "ical");
  ok("iCal route: 404 for unknown token, CSP present");

  const notFound = await get("localhost", "/definitely-missing");
  assert.equal(notFound.status, 404);
  assertPolicy(notFound, "404");
  ok("404 carries the CSP");

  const direct = await get("localhost", "/sites/demo/es");
  assert.equal(direct.status, 404);
  assertPolicy(direct, "direct /sites");
  ok("direct /sites path still 404 with CSP");
} finally {
  app.kill("SIGTERM");
}
