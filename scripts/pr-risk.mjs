#!/usr/bin/env node
// Reads the JSON array returned by `GET /repos/{o}/{r}/pulls/{n}/files`
// (all pages merged) from stdin and prints "high" or "low"; reasons go to
// stderr. Optional argv[2]: the PR's changed_files count, to detect a list
// truncated by the API. Used by .github/workflows/pr-risk.yml.
import { classifyPr } from "./lib/pr-risk.mjs";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let files = [];
try {
  const parsed = JSON.parse(input);
  files = Array.isArray(parsed) ? parsed.filter((f) => f && typeof f.filename === "string") : [];
} catch {
  files = [];
}
const expected = process.argv[2] === undefined ? undefined : Number(process.argv[2]);
const { risk, reasons } = classifyPr(files, Number.isInteger(expected) ? { expectedCount: expected } : {});
console.log(risk);
for (const reason of reasons) console.error(`high-risk: ${reason}`);
