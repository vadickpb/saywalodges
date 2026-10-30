// SD-209 Lighthouse MOBILE gate (performance and accessibility >= 90) for the public tenant sites.
// Runs against the LOCAL seeded stack only (no production, no paid APIs): run it after `supabase db reset`
// and a `next build` made with the local env (see .github/workflows/ci.yml, job `db`). Owns its app process
// on port 3208 (never in parallel with the other smokes). Lighthouse is fetched pinned with npx so it adds no
// project dependency; it needs a Chrome binary (CHROME_PATH, or the one preinstalled on GitHub runners).
// Only the scores are printed; the raw JSON goes to a temp dir and is deleted.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

for (const file of [".env", ".env.local", ".env.production", ".env.production.local"])
  assert.ok(!existsSync(file), `Must not load ${file}`);
const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" }));
assert.equal(status.API_URL, "http://127.0.0.1:54321", "Only local Supabase is allowed");

const LIGHTHOUSE = "lighthouse@13.6.0";
const THRESHOLD = 90;
const RUNS = Number(process.env.LH_RUNS ?? 3); // median of N runs absorbs CI noise
const PORT = 3208;
const targets = ["saywa-lodges.localhost", "demo.localhost"].flatMap((host) =>
  (process.env.LH_LANGS ?? "es").split(",").map((lang) => ({ host, lang })),
);
const chromePath =
  process.env.CHROME_PATH ??
  ["/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
assert.ok(chromePath, "Chrome not found: set CHROME_PATH");

const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_URL: status.API_URL, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY, ROOT_DOMAIN: `localhost:${PORT}` },
  stdio: ["ignore", "pipe", "pipe"],
});
let appOutput = "";
app.stdout.on("data", (b) => { appOutput += b; });
app.stderr.on("data", (b) => { appOutput += b; });

const probe = (host) => new Promise((resolve, reject) => {
  const req = httpRequest({ host: "127.0.0.1", port: PORT, path: "/", headers: { Host: `${host}:${PORT}` }, signal: AbortSignal.timeout(15000) }, (res) => { res.resume(); resolve(res.statusCode); });
  req.on("error", reject); req.end();
});
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const outDir = mkdtempSync(join(tmpdir(), "lh-"));
const failures = [];

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await probe("saywa-lodges.localhost")) < 500) break; } catch {}
    await sleep(500);
    assert.ok(i < 59, `App did not start:\n${appOutput}`);
  }

  for (const { host, lang } of targets) {
    const url = `http://${host}:${PORT}/${lang}`;
    const perf = [];
    const a11y = [];
    for (let run = 0; run < RUNS; run++) {
      const out = join(outDir, `${host}-${lang}-${run}.json`);
      // Default Lighthouse config = mobile emulation (Moto G Power, simulated slow 4G, 4x CPU slowdown).
      execFileSync("npx", ["--yes", LIGHTHOUSE, url, "--form-factor=mobile", "--only-categories=performance,accessibility", "--output=json", `--output-path=${out}`, "--quiet", "--chrome-flags=--headless=new --no-sandbox --disable-gpu"], { env: { ...process.env, CHROME_PATH: chromePath }, stdio: ["ignore", "inherit", "inherit"], timeout: 180000 });
      const lhr = JSON.parse(readFileSync(out, "utf8"));
      assert.equal(lhr.configSettings.formFactor, "mobile");
      assert.ok(!lhr.runtimeError, `${url} runtime error: ${lhr.runtimeError?.message}`);
      perf.push(Math.round(lhr.categories.performance.score * 100));
      a11y.push(Math.round(lhr.categories.accessibility.score * 100));
    }
    const p = median(perf);
    const a = median(a11y);
    console.log(`${p >= THRESHOLD && a >= THRESHOLD ? "PASS" : "FAIL"} ${url} mobile performance=${p} (runs ${perf.join(",")}) accessibility=${a} (runs ${a11y.join(",")})`);
    if (p < THRESHOLD) failures.push(`${url} performance ${p}`);
    if (a < THRESHOLD) failures.push(`${url} accessibility ${a}`);
  }
  assert.deepEqual(failures, [], `Lighthouse mobile below ${THRESHOLD}: ${failures.join("; ")}`);
  console.log("ALL PASS");
} catch (error) {
  console.error(appOutput.slice(-3000));
  throw error;
} finally {
  rmSync(outDir, { recursive: true, force: true });
  app.kill("SIGTERM");
  await new Promise((resolve) => (app.exitCode !== null ? resolve() : app.once("exit", resolve)));
}
