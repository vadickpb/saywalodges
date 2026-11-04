// Classifies a PR by the files it touches (SD-901). "high" means a human-grade
// review (Claude reviewer + security-reviewer) is required before merge; "low"
// means CI plus the implementer's own review are enough and the PR may be
// auto-merged. The list mirrors the security-reviewer trigger in CLAUDE.md.
// When in doubt a path is high risk: a false "high" costs a review, a false
// "low" can ship a security bug.

const HIGH_RISK = [
  /^supabase\//, // migrations, RLS, RPCs, seed, pgTAP
  /^lib\/dal\//,
  /^lib\/supabase\//,
  /^lib\/ical\//,
  /^lib\/email\/send/,
  /^lib\/whatsapp\//,
  /^proxy\.ts$/,
  /^app\/auth\//,
  /^app\/api\//, // webhooks, cron, health
  /^app\/\(platform\)\/login\//,
  /actions\.(ts|tsx)$/, // every server action (public and dashboard)
  /(^|\/)route\.(ts|tsx)$/,
  /^lib\/domain\/(pricing|payment|booking|public-quote|quote)/, // money and booking rules
  /^lib\/env/,
  /(^|\/)\.env/,
  /^next\.config\./,
  /^vercel\.(json|ts)$/,
  /^package(-lock)?\.json$/, // dependencies are supply chain
  /^\.github\//, // CI and deploy pipelines, including this classifier
  /^scripts\/(install-client|demo-reset|lib\/install-core|lib\/pr-risk|pr-risk)/,
  /^deploy\//,
  /^\.claude\//,
  /^(AGENTS|CLAUDE)\.md$/,
];

/** @param {string[]} files @returns {{ risk: "high" | "low", reasons: string[] }} */
export function classifyPr(files) {
  const reasons = files.filter((file) => HIGH_RISK.some((pattern) => pattern.test(file)));
  // An empty or unreadable diff never qualifies for auto-merge.
  if (files.length === 0) return { risk: "high", reasons: ["(no files)"] };
  return { risk: reasons.length > 0 ? "high" : "low", reasons };
}
