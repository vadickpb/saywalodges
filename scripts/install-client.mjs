#!/usr/bin/env node
// `npm run install-client -- <config.json> [--apply] [--step=<name>]`
//
// Brings up ONE client installation (ADR 0010, SD-1002): migrations, organization,
// property and owner in the client's Supabase project, plus the Vercel project with
// its variables and domains. Run by the owner on their machine.
//
//   * Default is a DRY RUN: it prints what it would do and touches nothing.
//   * It never creates paid projects: the Supabase project (and the Vercel
//     subscription) are created by hand first; see docs/runbook-instalacion.md.
//   * It is re-runnable: progress is kept in .install/<slug>.state.json (git-ignored,
//     mode 0600, holds the generated secrets) and each step checks before it writes.
//   * The service-role key is used HERE only (exception recorded in ADR 0010 to ADR 0002).
//
// Secrets come from the environment, never from the config file:
//   SUPABASE_ACCESS_TOKEN   https://supabase.com/dashboard/account/tokens
//   SUPABASE_DB_PASSWORD    that project's database password
//   VERCEL_TOKEN            https://vercel.com/account/tokens
//   RESEND_API_KEY          optional

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appHost, authUrls, VERCEL_IGNORE_COMMAND, buildSeed, buildVercelEnv, dnsChecklist, generateSecret, parseInstallConfig,
} from "./lib/install-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STEPS = ["keys", "migrations", "auth", "seed", "vercel"];
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.find((a) => a.startsWith("--step="))?.slice(7);
const configPath = args.find((a) => !a.startsWith("--"));

const out = (m) => console.log(m);
const fail = (m) => {
  console.error(`\nERROR: ${m}`);
  process.exit(1);
};
const need = (name) => process.env[name] || fail(`Missing environment variable ${name}. See docs/runbook-instalacion.md.`);

if (!configPath) fail("Usage: npm run install-client -- deploy/installs/<client>.json [--apply] [--step=keys|migrations|auth|seed|vercel]");
if (only && !STEPS.includes(only)) fail(`Unknown step "${only}". Valid: ${STEPS.join(", ")}`);

let cfg;
try {
  cfg = parseInstallConfig(JSON.parse(readFileSync(configPath, "utf8")));
} catch (e) {
  fail(`Invalid configuration: ${e instanceof Error ? e.message : "unreadable file"}`);
}

const stateDir = join(ROOT, ".install");
const statePath = join(stateDir, `${cfg.slug}.state.json`);
let state = {};
if (existsSync(statePath)) {
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    // Generic on purpose: a parse error message can quote part of the file (secrets).
    fail(`${statePath} is not valid JSON. Fix or delete it (deleting regenerates the secrets).`);
  }
}
const saveState = () => {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  chmodSync(stateDir, 0o700);
  writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  chmodSync(statePath, 0o600);
};

const ref = cfg.supabase.projectRef;
// The state holds this project's keys and ids: never reuse it for another project or Vercel project.
if (state.projectRef && state.projectRef !== ref) fail(`.install/${cfg.slug}.state.json belongs to Supabase project ${state.projectRef}, not ${ref}. Use a different slug, or delete that file to start over.`);
if (state.vercelProjectName && state.vercelProjectName !== cfg.vercel.projectName) fail("The state file belongs to a different Vercel project name. Use a different slug, or delete it to start over.");
state.projectRef = ref;
const supabaseUrl = `https://${ref}.supabase.co`;
const run = (label, fn) => (apply ? fn() : out(`  [dry-run] ${label}`));
const want = (step) => !only || only === step;

async function api(base, path, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  // Only the status and a short code are reported: bodies can echo submitted secrets.
  if (!res.ok) throw new Error(`${method} ${base.replace(/^https:\/\//, "")}${path.split("?")[0]} → HTTP ${res.status}${json?.code ? ` (${json.code})` : ""}`);
  return json;
}

out(`\nInstallation: ${cfg.name} (${cfg.slug})  ·  site https://${cfg.rootDomain}  ·  panel https://${appHost(cfg)}`);
out(apply ? "Mode: APPLY (changes will be made)\n" : "Mode: DRY RUN (nothing is changed; add --apply to execute)\n");

// 1 ── keys
if (want("keys")) {
  out("1/5 Supabase API keys");
  await run("fetch anon + service_role keys from the Management API", async () => {
    if (state.anonKey && state.serviceRoleKey) return out("  already stored");
    const keys = await api("https://api.supabase.com", `/v1/projects/${ref}/api-keys?reveal=true`, { token: need("SUPABASE_ACCESS_TOKEN") });
    const find = (n) => keys.find((k) => k.name === n)?.api_key;
    state.anonKey = find("anon");
    state.serviceRoleKey = find("service_role");
    if (!state.anonKey || !state.serviceRoleKey) fail("The project did not return anon and service_role keys. Copy them from Supabase → Project Settings → API Keys into .install/<slug>.state.json (anonKey, serviceRoleKey).");
    state.cronSecret ??= generateSecret(randomBytes);
    state.healthSecret ??= generateSecret(randomBytes);
    saveState();
    out("  stored in .install (not printed)");
  });
}

// 2 ── migrations
if (want("migrations")) {
  out("2/5 Database migrations (supabase/migrations/*.sql)");
  await run("supabase link + db push to the client's project", () => {
    const env = { ...process.env, SUPABASE_ACCESS_TOKEN: need("SUPABASE_ACCESS_TOKEN"), SUPABASE_DB_PASSWORD: need("SUPABASE_DB_PASSWORD") };
    const sb = (...a) => execFileSync("npx", ["--no-install", "supabase", ...a], { cwd: ROOT, env, stdio: "inherit" });
    sb("link", "--project-ref", ref, "--yes");
    try {
      sb("db", "push", "--yes");
    } finally {
      // Never leave this clone linked to a client's production database.
      try { sb("unlink", "--yes"); } catch { out("  warning: run `npx supabase unlink` by hand so this clone is not left linked to a client."); }
    }
  });
}

// 3 ── auth
if (want("auth")) {
  out("3/5 Supabase Auth redirect URLs");
  const { siteUrl, allowList } = authUrls(cfg);
  await run(`site_url=${siteUrl}  allow-list=${allowList.join(", ")}`, async () => {
    try {
      await api("https://api.supabase.com", `/v1/projects/${ref}/config/auth`, {
        method: "PATCH", token: need("SUPABASE_ACCESS_TOKEN"),
        body: { site_url: siteUrl, uri_allow_list: allowList.join(","), disable_signup: true },
      });
      state.signupDisabled = true;
      saveState();
      out("  updated (new-user sign-up disabled)");
    } catch (e) {
      out(`  could not be set automatically (${e instanceof Error ? e.message : "error"}). Do it by hand: Supabase → Authentication → URL Configuration → Site URL ${siteUrl}, Redirect URLs ${allowList.join(", ")}; and turn OFF "Allow new users to sign up" (Authentication → Sign In / Providers). Do not continue to the seed step until that is done.`);
    }
  });
}

// 4 ── seed (service role, only here)
if (want("seed")) {
  out("4/5 Organization, property and owner");
  await run(`create ${cfg.ownerEmail} (confirmed, no password), organization, property (unpublished), owner membership`, async () => {
    if (!state.serviceRoleKey) fail("Run the keys step first.");
    const svc = { apikey: state.serviceRoleKey };
    const auth = (path, opts = {}) => api(supabaseUrl, path, { ...opts, token: state.serviceRoleKey, headers: { ...svc, ...(opts.headers ?? {}) } });
    const rest = (path, opts = {}) => auth(`/rest/v1${path}`, { ...opts, headers: { prefer: "return=representation", ...(opts.headers ?? {}) } });

    // Owner: created already confirmed and WITHOUT a password. They set one with
    // "Forgot password" on the panel (the PKCE recovery flow the app supports).
    let userId = state.ownerUserId;
    if (!userId) {
      // Self sign-up must be closed BEFORE the seed, or anyone holding the (public) anon key
      // could have registered the owner's e-mail first.
      if (!state.signupDisabled) fail("Run the auth step first (it disables new-user sign-up), or confirm it is off and set \"signupDisabled\": true in the state file.");
      try {
        const u = await auth("/auth/v1/admin/users", { method: "POST", body: { email: cfg.ownerEmail, email_confirm: true } });
        userId = u.id;
      } catch {
        // Never adopt a user this script did not create: it could be someone else's account.
        fail(`Could not create the owner ${cfg.ownerEmail} (it may already exist in this project). If it is YOUR account, add its id as "ownerUserId" to .install/${cfg.slug}.state.json and re-run this step.`);
      }
      state.ownerUserId = userId;
      saveState();
    }

    const seed = buildSeed(cfg, userId);
    const existing = await rest(`/properties?slug=eq.${encodeURIComponent(cfg.slug)}&select=id,org_id`);
    let orgId = existing[0]?.org_id ?? state.orgId;
    if (!orgId) {
      orgId = (await rest("/organizations", { method: "POST", body: seed.org }))[0].id;
      state.orgId = orgId;
      saveState();
    }
    if (!existing.length) await rest("/properties", { method: "POST", body: seed.property(orgId) });
    await rest("/memberships?on_conflict=org_id,user_id", {
      method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: seed.membership(orgId),
    });
    out("  done (idempotent: running it again changes nothing)");
  });
}

// 5 ── vercel
if (want("vercel")) {
  out("5/5 Vercel project, variables and domains");
  const q = cfg.vercel.teamId ? `?teamId=${cfg.vercel.teamId}` : "";
  const qa = cfg.vercel.teamId ? `&teamId=${cfg.vercel.teamId}` : "";
  const dry = () => {
    const sample = { supabaseUrl, anonKey: "<anon>", serviceRoleKey: "<service-role>", cronSecret: "x".repeat(64), healthSecret: "y".repeat(64) };
    for (const v of buildVercelEnv(cfg, sample)) out(`  [dry-run] env ${v.key} (${v.type}) → ${v.target.join(",")}`);
    out(`  [dry-run] project ${cfg.vercel.projectName} from ${cfg.vercel.repo}; domains ${cfg.rootDomain}, ${appHost(cfg)}`);
  };
  if (!apply) dry();
  else {
    const token = need("VERCEL_TOKEN");
    if (!state.anonKey || !state.healthSecret) fail("Run the keys step first.");
    const secrets = { supabaseUrl, anonKey: state.anonKey, serviceRoleKey: state.serviceRoleKey, cronSecret: state.cronSecret, healthSecret: state.healthSecret, resendApiKey: process.env.RESEND_API_KEY };
    state.vercelProjectName = cfg.vercel.projectName;
    if (!state.vercelProjectId) {
      const p = await api("https://api.vercel.com", `/v10/projects${q}`, {
        method: "POST", token,
        body: { name: cfg.vercel.projectName, framework: "nextjs", commandForIgnoringBuildStep: VERCEL_IGNORE_COMMAND, gitRepository: { type: "github", repo: cfg.vercel.repo } },
      });
      state.vercelProjectId = p.id;
      saveState();
    }
    await api("https://api.vercel.com", `/v10/projects/${state.vercelProjectId}/env?upsert=true${qa}`, {
      method: "POST", token, body: buildVercelEnv(cfg, secrets),
    });
    for (const domain of [cfg.rootDomain, appHost(cfg)]) {
      try {
        await api("https://api.vercel.com", `/v10/projects/${state.vercelProjectId}/domains${q}`, { method: "POST", token, body: { name: domain } });
      } catch (e) {
        out(`  domain ${domain}: ${e instanceof Error ? e.message : "error"} (already added? check Vercel → Domains)`);
      }
    }
    out("  project, variables and domains configured");
  }
}

out("\nPending by hand (see docs/runbook-instalacion.md):");
for (const r of dnsChecklist(cfg)) out(`  DNS  ${r.type.padEnd(5)} ${r.host}  →  ${r.value}   (${r.note})`);
out(`  Cron: schedule POST https://${appHost(cfg)}/api/cron/expire-holds and /ical-sync with the CRON_SECRET stored in .install/${cfg.slug}.state.json`);
out(`  Owner: open https://${appHost(cfg)}/forgot-password with ${cfg.ownerEmail} to set a password`);
out(`  Monitoring: create the GitHub Environment health-<same opaque id> with variable HEALTH_URL=https://${appHost(cfg)}/api/health and secret HEALTH_SECRET (value in .install/${cfg.slug}.state.json); runbook step 11`);
out(`  Updates: create the GitHub Environment supabase-<opaque id, e.g. inst-0002> and add the registry entry (runbook step 10; never use the client slug there, the registry is public), or this client will not receive database updates`);
out(`  Email: verify the sending domain in Resend${cfg.email.from ? "" : " and set EMAIL_FROM"}`);
