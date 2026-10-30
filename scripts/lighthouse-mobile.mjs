// SD-209 Lighthouse MOBILE gate (performance and accessibility >= 90) for the public tenant sites.
// Runs against the LOCAL seeded stack only (no production, no paid APIs): run it after `supabase db reset`
// and a `next build` made with the local env (see .github/workflows/ci.yml, job `db`). Owns its app process
// on port 3208 (never in parallel with the other smokes). Lighthouse is fetched pinned with npx so it adds no
// project dependency; it needs a Chrome binary (CHROME_PATH, or the one preinstalled on GitHub runners).
// Robustness: every Lighthouse run is its own process group with a hard timeout; on timeout the whole group
// (npx, node, Chrome) is killed. Only INFRASTRUCTURE failures (timeout, crash, runtimeError) are retried, a
// bounded number of times; a run that produced a score is never discarded, so low scores are always counted.
// Only the scores are printed; the raw JSON goes to a temp dir and is deleted.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
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
const RUN_TIMEOUT_MS = Number(process.env.LH_RUN_TIMEOUT_MS ?? 120000);
const MAX_INFRA_RETRIES = 2; // extra attempts per target across all runs, never for low scores
const PORT = 3208;
const CHROME_FLAGS = "--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-extensions --no-first-run --no-default-browser-check";
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
// Default Lighthouse config = mobile emulation (Moto G Power, simulated slow 4G, 4x CPU slowdown).
const lighthouseArgs = (url, out) => ["--yes", "--prefer-offline", LIGHTHOUSE, url, "--form-factor=mobile", "--only-categories=performance,accessibility", "--output=json", `--output-path=${out}`, "--quiet", `--chrome-flags=${CHROME_FLAGS}`];

async function runLighthouse(url, out) {
  const child = spawn("npx", lighthouseArgs(url, out), { env: { ...process.env, CHROME_PATH: chromePath }, stdio: ["ignore", "inherit", "inherit"], detached: true });
  const killGroup = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
  const timer = setTimeout(killGroup, RUN_TIMEOUT_MS);
  try {
    const [code, signal] = await once(child, "exit");
    if (signal) throw new Error(`killed by ${signal} (timeout ${RUN_TIMEOUT_MS}ms)`);
    if (code !== 0) throw new Error(`exited with code ${code}`);
  } finally {
    clearTimeout(timer);
    killGroup(); // leave no Chrome behind, even after a clean exit
  }
  const lhr = JSON.parse(readFileSync(out, "utf8"));
  if (lhr.runtimeError) throw new Error(`runtime error: ${lhr.runtimeError.code}`);
  assert.equal(lhr.configSettings.formFactor, "mobile");
  return lhr;
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const outDir = mkdtempSync(join(tmpdir(), "lh-"));
const failures = [];

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await probe("saywa-lodges.localhost")) < 500) break; } catch {}
    await sleep(500);
    assert.ok(i < 59, `App did not start:\n${appOutput}`);
  }

  // Fetch the pinned Lighthouse once (bounded retries) so the measured runs never download anything.
  for (let attempt = 1; ; attempt++) {
    try { execFileSync("npx", ["--yes", LIGHTHOUSE, "--version"], { stdio: "ignore", timeout: 120000 }); break; } catch (error) {
      assert.ok(attempt < 3, `Could not fetch ${LIGHTHOUSE}: ${error.message}`);
    }
  }

  for (const { host, lang } of targets) {
    const url = `http://${host}:${PORT}/${lang}`;
    let infraRetries = 0;
    const perf = [];
    const a11y = [];
    for (let run = 0; run < RUNS; run++) {
      const out = join(outDir, `${host}-${lang}-${run}.json`);
      let lhr;
      while (!lhr) {
        try {
          lhr = await runLighthouse(url, out);
        } catch (error) {
          rmSync(out, { force: true });
          console.error(`Lighthouse infrastructure failure for ${url} (run ${run + 1}): ${error.message}`);
          if (++infraRetries > MAX_INFRA_RETRIES) throw new Error(`${url}: too many infrastructure failures`, { cause: error });
        }
      }
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
