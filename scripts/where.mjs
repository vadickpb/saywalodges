#!/usr/bin/env node
// `npm run where` — answers "where am I and what is next?" for the current
// worktree. Read-only: it only runs `git fetch`, `git` queries and `gh` queries.
//
//   npm run where              fetch first, then report
//   npm run where -- --no-fetch   skip the network fetch

import { execFileSync } from "node:child_process";

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

if (!process.argv.includes("--no-fetch")) git("fetch", "--prune", "--quiet");

const root = git("rev-parse", "--show-toplevel");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (!root || !branch) {
  console.error("Not inside a git repository.");
  process.exit(1);
}

const [behind, ahead] = (git("rev-list", "--left-right", "--count", "origin/main...HEAD") ?? "0\t0")
  .split(/\s+/)
  .map(Number);
const changed = lines(git("status", "--porcelain"));
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
// macOS/iCloud conflict copies look like "name 2.ext".
const duplicates = untracked.filter((file) => / \d+(\.[^/ ]+)?$/.test(file));

const prs = JSON.parse(
  gh(
    "pr", "list", "--head", branch, "--state", "all", "--limit", "1",
    "--json", "number,state,url,title,statusCheckRollup",
  ) ?? "[]",
);
const pr = prs[0] ?? null;

let checks = null;
if (pr?.statusCheckRollup?.length) {
  const states = pr.statusCheckRollup.map((c) => c.conclusion || c.status);
  checks = states.some((s) => ["FAILURE", "CANCELLED", "TIMED_OUT"].includes(s))
    ? "failing"
    : states.every((s) => s === "SUCCESS" || s === "SKIPPED" || s === "NEUTRAL")
      ? "passing"
      : "running";
}

const newMigrations = lines(
  git("diff", "--name-only", "--diff-filter=A", "origin/main...HEAD", "--", "supabase/migrations"),
);

const mergedHeads = new Set(
  JSON.parse(gh("pr", "list", "--state", "merged", "--limit", "300", "--json", "headRefName") ?? "[]")
    .map((p) => p.headRefName),
);
const worktrees = lines(git("worktree", "list", "--porcelain"))
  .reduce((acc, line) => {
    if (line.startsWith("worktree ")) acc.push({ path: line.slice(9) });
    else if (line.startsWith("branch ")) acc.at(-1).branch = line.slice(7).replace("refs/heads/", "");
    return acc;
  }, []);
const finished = worktrees.filter((w) => w.branch && w.branch !== "main" && mergedHeads.has(w.branch));

// What should happen next, in priority order.
let next;
if (duplicates.length) next = "Delete the iCloud duplicate files listed above (they can break `supabase db reset`).";
else if (branch === "main") next = "You are on main: pick a ticket from docs/roadmap.md and start it in a new worktree.";
else if (pr?.state === "MERGED") next = "This ticket is merged. Remove this worktree and branch (see docs/workflow.md → Limpieza).";
else if (behind > 0 && ahead > 0) next = `Branch is ${behind} commit(s) behind main: rebase on origin/main before merging.`;
else if (changed.length) next = "There are uncommitted changes: finish the step, then commit.";
else if (!pr && ahead > 0) next = "Run the checks, push the branch and open the PR.";
else if (pr?.state === "OPEN" && checks === "passing") next = "PR is green: merge it (squash).";
else if (pr?.state === "OPEN" && checks === "failing") next = "PR checks are failing: read the failing job and fix it.";
else if (pr?.state === "OPEN") next = "PR is open and CI is running: wait for it.";
else next = "Nothing to do on this branch.";

const out = [];
out.push(`Worktree : ${root}`);
out.push(`Branch   : ${branch}`);
out.push(`vs main  : ${ahead} ahead, ${behind} behind`);
out.push(`Local    : ${changed.length ? `${changed.length} changed file(s)` : "clean"}`);
out.push(
  `PR       : ${pr ? `#${pr.number} ${pr.state} — ${pr.url}${checks ? ` (checks ${checks})` : ""}` : "none"}`,
);
out.push(
  `Migrations in this branch: ${
    newMigrations.length ? newMigrations.map((m) => m.split("/").pop()).join(", ") : "none"
  }`,
);
if (newMigrations.length && pr?.state === "MERGED") {
  out.push("  → After the merge, approve the 'Deploy database' run in GitHub Actions.");
}
if (duplicates.length) {
  out.push("", "iCloud duplicates:", ...duplicates.map((f) => `  - ${f}`));
}
out.push("", `Worktrees: ${worktrees.length} total, ${finished.length} already merged (safe to remove):`);
for (const w of finished) out.push(`  - ${w.branch}  ${w.path}`);
out.push("", `NEXT: ${next}`);

console.log(out.join("\n"));
