import "server-only";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { MODULES, MODULE_NAV_HREFS, isModuleEnabled, parseDisabledModules, type ModuleId } from "@/lib/domain/modules";

// Read once, server-side only (SD-1103). A typo in MODULES_DISABLED fails at first use instead of silently leaving a
// module on. The browser never decides: it only receives the already-filtered navigation.
const parsed = parseDisabledModules(env.MODULES_DISABLED);
if (!parsed.ok) {
  throw new Error(`Invalid MODULES_DISABLED: unknown module(s) ${parsed.unknown.join(", ")}. Valid: ${MODULES.join(", ")}.`);
}
const disabled = parsed.disabled;

export function moduleEnabled(module: ModuleId): boolean {
  return isModuleEnabled(disabled, module);
}

/** Pages, layouts and server actions: a module that is off answers 404 and runs nothing. */
export function requireModule(module: ModuleId): void {
  if (!moduleEnabled(module)) notFound();
}

export function disabledNavHrefs(): string[] {
  return MODULES.filter((m) => !moduleEnabled(m)).flatMap((m) => MODULE_NAV_HREFS[m]);
}
