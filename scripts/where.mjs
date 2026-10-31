#!/usr/bin/env node
// `npm run where` — answers "where am I and what is next?" for the current
// worktree. It never changes your files or branches: it only runs `git fetch`
// (which refreshes remote refs), plus read-only `git` and `gh` queries.
//
//   npm run where                 fetch first, then report
//   npm run where -- --no-fetch   skip the network fetch

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};
const git = (...args) => run("git", ["-c", "core.quotepath=off", ...args]);
const gh = (...args) => run("gh", args);
const lines = (text) => (text ? text.split("\n").filter(Boolean) : []);
const json = (text, fallback) => {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
};

const warnings = [];

if (!process.argv.includes("--no-fetch") && git("fetch", "--prune", "--quiet") === null) {
  warnings.push("git fetch failed (offline?): remote information may be out of date.");
}

const root = git("rev-parse", "--show-toplevel");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (!root || !branch) {
  console.error("Not inside a git repository.");
  process.exit(1);
}
const detached = branch === "HEAD";

const hasOriginMain = git("rev-parse", "--verify", "--quiet", "origin/main") !== null;
if (!hasOriginMain) warnings.push("origin/main not found: run `git fetch origin`. Ahead/behind is unknown.");
const [behind, ahead] = hasOriginMain
  ? git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number)
  : [0, 0];

const ghReady = gh("auth", "status") !== null;
if (!ghReady) warnings.push("`gh` is missing or not logged in: PR and CI state is unknown (run `gh auth login`).");

const changed = lines(git("status", "--porcelain"));
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
// macOS/iCloud conflict copies look like "name 2.ext" and sit next to "name.ext".
const duplicates = untracked.filter((file) => {
  const original = file.replace(/ \d+(\.[^/ ]+)?$/, "$1");
  return original !== file && existsSync(join(root, original));
});

const pr =
  ghReady && !detached
    ? (json(
        gh(
          "pr", "list", "--head", branch, "--state", "all", "--limit", "1",
          "--json", "number,state,url,title,statusCheckRollup",
        ),
        [],
      )[0] ?? null)
    : null;

// statusCheckRollup mixes CheckRun (conclusion/status) and StatusContext (state).
let checks = null;
if (pr?.statusCheckRollup?.length) {
  const states = pr.statusCheckRollup.map((c) => c.conclusion || c.state || c.status);
  const failing = ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED"];
  const passing = ["SUCCESS", "SKIPPED", "NEUTRAL"];
  checks = states.some((s) => failing.includes(s))
    ? "failing"
    : states.every((s) => passing.includes(s))
      ? "passing"
      : "running";
}

const newMigrations = hasOriginMain
  ? lines(git("diff", "--name-only", "--diff-filter=A", "origin/main...HEAD", "--", "supabase/migrations"))
  : [];

const mergedHeads = new Set(
  ghReady
    ? json(gh("pr", "list", "--state", "merged", "--limit", "300", "--json", "headRefName"), []).map(
        (p) => p.headRefName,
      )
    : [],
);
const worktrees = lines(git("worktree", "list", "--porcelain")).reduce((acc, line) => {
  if (line.startsWith("worktree ")) acc.push({ path: line.slice(9) });
  else if (line.startsWith("branch ")) acc.at(-1).branch = line.slice(7).replace("refs/heads/", "");
  return acc;
}, []);
// The first entry is the main checkout: it cannot be removed with `git worktree remove`.
const removable = worktrees
  .slice(1)
  .filter((w) => w.branch && w.branch !== "main" && mergedHeads.has(w.branch))
  .map((w) => ({ ...w, dirty: lines(git("-C", w.path, "status", "--porcelain")).length > 0 }));
const mainCheckoutMerged = worktrees[0]?.branch && mergedHeads.has(worktrees[0].branch);

// What should happen next, in priority order.
let next;
if (duplicates.length) next = "Delete the iCloud duplicate files listed above (they can break `supabase db reset`).";
else if (detached) next = "Detached HEAD: create a branch (`git switch -c <type>/SD-XXX-slug`) before committing.";
else if (branch === "main" && behind > 0) next = "main is behind origin/main: run `git pull --ff-only`, then start a ticket.";
else if (branch === "main") next = "You are on main: pick a ticket from docs/roadmap.md and start it in a new worktree.";
else if (pr?.state === "MERGED") next = "This ticket is merged. Remove this worktree and branch (see docs/workflow.md → Limpieza).";
else if (behind > 0 && ahead > 0) next = `Branch is ${behind} commit(s) behind main: rebase on origin/main before merging.`;
else if (changed.length) next = "There are uncommitted changes: finish the step, then commit.";
else if (!ghReady) next = "Install/login `gh` to see the PR state.";
else if (!pr && ahead > 0) next = "Run the checks, push the branch and open the PR.";
else if (pr?.state === "OPEN" && checks === "passing") next = "PR is green: merge it (squash).";
else if (pr?.state === "OPEN" && checks === "failing") next = "PR checks are failing: read the failing job and fix it.";
else if (pr?.state === "OPEN") next = "PR is open and CI is running: wait for it.";
else next = "Nothing to do on this branch.";

const out = [];
out.push(`Worktree : ${root}`);
out.push(`Branch   : ${detached ? "(detached HEAD)" : branch}`);
out.push(`vs main  : ${hasOriginMain ? `${ahead} ahead, ${behind} behind` : "unknown"}`);
out.push(`Local    : ${changed.length ? `${changed.length} changed file(s)` : "clean"}`);
out.push(
  `PR       : ${
    !ghReady ? "unknown" : pr ? `#${pr.number} ${pr.state} — ${pr.url}${checks ? ` (checks ${checks})` : ""}` : "none"
  }`,
);
out.push(
  `Migrations in this branch: ${
    newMigrations.length ? newMigrations.map((m) => m.split("/").pop()).join(", ") : "none"
  }`,
);
if (newMigrations.length && pr?.state === "MERGED") {
  out.push("  → After the merge, approve the 'Deploy database' run in GitHub Actions.");
}
if (warnings.length) out.push("", ...warnings.map((w) => `WARNING: ${w}`));
if (duplicates.length) out.push("", "iCloud duplicates:", ...duplicates.map((f) => `  - ${f}`));
out.push("", `Worktrees: ${worktrees.length} total, ${removable.length} already merged and removable:`);
for (const w of removable) {
  out.push(`  - ${w.branch}  ${w.path}${w.dirty ? "  (HAS UNCOMMITTED FILES: check before removing)" : ""}`);
}
if (mainCheckoutMerged) {
  out.push(`  (main checkout ${worktrees[0].path} is on merged branch ${worktrees[0].branch}: switch it to main)`);
}
out.push("", `NEXT: ${next}`);

console.log(out.join("\n"));
