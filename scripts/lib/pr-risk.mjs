// Classifies a PR as "low" or "high" risk (SD-901). "high" needs Claude's
// review (+ security-reviewer) before merge; only "low" may be auto-merged.
//
// Design: deny by default. A file is low risk only if its path is on a short
// allowlist (presentational UI, copy, docs, tests, images) AND none of its
// added lines touch a sensitive capability (server code, service-role,
// env vars, network, raw HTML). Everything else, every rename out of a
// sensitive path, every deleted test and every file whose patch the API did
// not return is high risk. A false "high" costs one review; a false "low"
// can ship a security bug straight to production.

const LOW_RISK_PATHS = [
  /^docs\/.+\.md$/,
  /^README(\.[a-z]{2})?\.md$/,
  /^dictionaries\/[^/]+\.ts$/,
  /^components\/(site|dashboard|ui|marketing)\/[^/]+\.tsx?$/,
  // Route files (page/layout) are NOT here: they already hold sinks such as
  // dangerouslySetInnerHTML or DAL calls that a diff-only scan cannot see, so
  // changing one unchanged-context line could be dangerous. They get a review.
  /^e2e\/.+\.(ts|tsx)$/,
  /\.test\.(ts|tsx|mjs)$/,
  /^public\/.+\.(png|jpe?g|webp|avif|ico|woff2?)$/,
];

// Paths that stay high even when they match the allowlist above.
const ALWAYS_HIGH = [
  /^supabase\//,
  /^lib\/dal\//,
  /^\.github\//,
  /^\.claude\//,
  /^(AGENTS|CLAUDE)\.md$/,
  // Components that already carry a sink (they call server actions or take
  // uploads), which a diff-only scan cannot see.
  /^components\/site\/voucher-form\.tsx$/,
];

// Added lines that signal server-side or security-relevant code.
const SENSITIVE_CONTENT = [
  /["']use server["']/,
  /["']server-only["']/,
  /lib\/supabase/,
  /createAdminClient|service_?role|SERVICE_ROLE/i,
  /dangerouslySetInnerHTML/,
  /\.rpc\(/,
  /process\.env/,
  /\bfetch\(/,
  /\beval\(|new Function\(/,
  /\binnerHTML\b|insertAdjacentHTML|document\.write/,
  /from ["'][^"']*\/actions["']/,
  /from ["']@\/lib\/(cron-auth|security|log|env|email\/send|whatsapp|ical)/,
];

const BINARY_OK = /^public\/.+\.(png|jpe?g|webp|avif|ico|woff2?)$/;

/**
 * @typedef {{ filename: string, previous_filename?: string, status?: string, patch?: string }} PrFile
 * @param {PrFile[]} files
 * @param {{ expectedCount?: number }} [options]
 * @returns {{ risk: "high" | "low", reasons: string[] }}
 */
export function classifyPr(files, options = {}) {
  if (files.length === 0) return { risk: "high", reasons: ["(no files)"] };
  // The files API stops at 3000 entries: a truncated list proves nothing.
  if (options.expectedCount !== undefined && options.expectedCount !== files.length) {
    return { risk: "high", reasons: [`(file list truncated: ${files.length}/${options.expectedCount})`] };
  }
  const reasons = [];
  for (const file of files) {
    const reason = fileReason(file);
    if (reason) reasons.push(reason);
  }
  return { risk: reasons.length > 0 ? "high" : "low", reasons };
}

/** @param {PrFile} file @returns {string | null} */
function fileReason(file) {
  const paths = [file.filename, file.previous_filename].filter((p) => typeof p === "string" && p.length > 0);
  for (const path of paths) {
    if (ALWAYS_HIGH.some((pattern) => pattern.test(path))) return `${path} (sensitive path)`;
    if (!LOW_RISK_PATHS.some((pattern) => pattern.test(path))) return `${path} (not on the low-risk allowlist)`;
  }
  if (file.status === "removed" && /\.test\.(ts|tsx|mjs)$/.test(file.filename)) return `${file.filename} (test deleted)`;
  if (file.status === "removed") return null;
  if (typeof file.patch !== "string") {
    return BINARY_OK.test(file.filename) ? null : `${file.filename} (no patch to inspect)`;
  }
  const added = file.patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  const hit = SENSITIVE_CONTENT.find((pattern) => added.some((line) => pattern.test(line)));
  return hit ? `${file.filename} (adds ${hit.source})` : null;
}
