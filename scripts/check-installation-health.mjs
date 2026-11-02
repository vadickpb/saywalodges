#!/usr/bin/env node
// One installation's health check, run by .github/workflows/installation-health.yml (SD-1004).
// Inputs come from the job's Environment (`health-<id>`): HEALTH_URL (secret, e.g.
// https://app.example.com/api/health), HEALTH_SECRET (secret) and DECLARED_ID (variable INSTALLATION_ID). Prints only a verdict and reason
// codes, never the URL or the secret. Exit 1 = problem (the failed run is e-mailed by GitHub).
import { readdirSync } from "node:fs";
import { judge } from "./lib/health-check.mjs";

const url = process.env.HEALTH_URL?.trim();
const secret = process.env.HEALTH_SECRET;
const id = process.env.INSTALLATION_ID ?? "?";

if (!url || !secret) {
  // Not configured yet: a visible warning, not a failure (the runbook makes this a handover step).
  console.log(`::warning::Installation ${id} has no HEALTH_URL / HEALTH_SECRET in its health environment: NOT MONITORED.`);
  process.exit(0);
}
if (process.env.DECLARED_ID !== id) {
  console.log(`::error::Installation ${id}: its health environment does not declare INSTALLATION_ID=${id} (see docs/health.md). Not sending the secret.`);
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9.-]+\/api\/health$/i.test(url)) {
  console.log(`::error::Installation ${id}: HEALTH_URL must look like https://app.<domain>/api/health`);
  process.exit(1);
}

const migrations = readdirSync(new URL("../supabase/migrations", import.meta.url)).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
const latestMigration = migrations.at(-1) ?? null;

let answer = { httpStatus: null, body: null };
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20_000), redirect: "manual" });
    let body = null;
    try { body = await res.json(); } catch { /* bare 401 or non-JSON */ }
    answer = { httpStatus: res.status, body };
  } catch {
    answer = { httpStatus: null, body: null };
  }
  if (answer.httpStatus === 200) break;
  if (attempt < 3) await new Promise((r) => setTimeout(r, 10_000)); // a cold start or a blip is not an incident
}

const verdict = judge(answer, { latestMigration, now: new Date() });
if (verdict.ok) {
  console.log(`Installation ${id}: healthy.`);
} else {
  for (const reason of verdict.reasons) console.log(`::error::Installation ${id}: ${reason}`);
  process.exit(1);
}
