// SD-209 HTTP smoke for the per-tenant site theme. Read-only: it never writes
// to the database. Run against the LOCAL Supabase stack after `supabase db reset` (seed.sql)
// and a `next build` made with the local stack env (see .github/workflows/ci.yml, job `db`).
// Owns its app process on port 3208 (the port the CI build bakes in; run it after the rates smoke,
// never in parallel) and proves each tenant host renders ITS OWN theme CSS variables, the skip link
// and the mobile CTA bar, with nothing from the other tenant.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

for (const file of [".env", ".env.local", ".env.production", ".env.production.local"])
  assert.ok(!existsSync(file), `Must not load ${file}`);
const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
assert.equal(status.API_URL, "http://127.0.0.1:54321", "Only local Supabase is allowed");

const PORT = 3208;
const ROOT = `localhost:${PORT}`;

// Mirrors the presets in lib/domain/site-theme.ts used by supabase/seed.sql.
const tenants = {
  saywa: { host: "saywa-lodges.localhost", primary: "#2D4A3E", accent: "#8A5F10", bg: "#FAF7F2", other: "demo" },
  demo: { host: "demo.localhost", primary: "#0E4D64", accent: "#C2410C", bg: "#F7FAFB", other: "saywa" },
};

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
const ok = (name) => console.log(`PASS ${name}`);
const styleOf = (html) => /<body[^>]*style="([^"]*)"/.exec(html)?.[1] ?? "";

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await get("saywa-lodges.localhost", "/")).status < 500) break; } catch {}
    await sleep(500);
    assert.ok(i < 59, `App did not start:\n${appOutput}`);
  }

  for (const [key, tenant] of Object.entries(tenants)) {
    const other = tenants[tenant.other];
    for (const lang of ["es", "en"]) {
      const res = await get(tenant.host, `/${lang}`);
      assert.equal(res.status, 200, `${key}/${lang} status`);
      const style = styleOf(res.body);
      assert.ok(style.includes(`--site-primary:${tenant.primary}`), `${key}/${lang} primary`);
      assert.ok(style.includes(`--site-accent:${tenant.accent}`), `${key}/${lang} accent`);
      assert.ok(style.includes(`--site-bg:${tenant.bg}`), `${key}/${lang} background`);
      for (const name of ["muted", "surface", "line", "fg", "radius", "font-heading"])
        assert.ok(style.includes(`--site-${name}:`), `${key}/${lang} defines --site-${name}`);
      assert.ok(!style.includes(other.primary) && !style.includes(other.accent), `${key}/${lang} carries the other tenant colors`);
      assert.ok(!/[;{}<>]|url\(/.test(style.replace(/;/g, "")), `${key}/${lang} style has only plain declarations`);
      assert.ok(res.body.includes(`<meta name="theme-color" content="${tenant.primary}"`), `${key}/${lang} theme-color meta`);
      assert.ok(/<a href="#main"/.test(res.body) && /<main id="main"/.test(res.body), `${key}/${lang} skip link targets main`);
      assert.ok(/md:hidden/.test(res.body) && res.body.includes("fixed inset-x-0 bottom-0"), `${key}/${lang} mobile CTA bar`);
      assert.ok(res.body.includes(`lang="${lang}"`), `${key}/${lang} html lang`);
      ok(`${key}/${lang}: own theme variables, theme-color, skip link, mobile CTA`);
    }
  }
  console.log("ALL PASS");
} catch (error) {
  console.error(appOutput.slice(-3000));
  throw error;
} finally {
  app.kill("SIGTERM");
  await new Promise((resolve) => (app.exitCode !== null ? resolve() : app.once("exit", resolve)));
}
