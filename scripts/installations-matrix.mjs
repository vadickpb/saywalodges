#!/usr/bin/env node
// Prints the deploy matrix as one JSON line for GitHub Actions (`matrix=` output).
// The optional installation id comes from the INSTALLATION env var, never from argv/shell.
import { readFileSync } from "node:fs";
import { buildMatrix, parseRegistry } from "./lib/installations.mjs";

try {
  const registry = parseRegistry(JSON.parse(readFileSync(new URL("../deploy/installations.json", import.meta.url), "utf8")));
  console.log(JSON.stringify(buildMatrix(registry, process.env.INSTALLATION ?? "")));
} catch (e) {
  console.error(`::error::${e instanceof Error ? e.message.split("\n")[0] : "invalid installation registry"}`);
  process.exit(1);
}
