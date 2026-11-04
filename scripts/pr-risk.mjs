#!/usr/bin/env node
// Reads changed file paths (one per line) from stdin and prints "high" or
// "low" plus the high-risk paths. Used by .github/workflows/pr-risk.yml and
// usable locally: `git diff --name-only origin/main | node scripts/pr-risk.mjs`.
import { classifyPr } from "./lib/pr-risk.mjs";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const files = input.split("\n").map((line) => line.trim()).filter(Boolean);
const { risk, reasons } = classifyPr(files);
console.log(risk);
for (const reason of reasons) console.error(`high-risk: ${reason}`);
