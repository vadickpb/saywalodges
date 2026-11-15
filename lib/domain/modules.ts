import { z } from "zod";

// Per-installation product modules (SD-1103, ADR 0019). Everything is ON unless the installation lists it in
// MODULES_DISABLED, so an existing installation keeps working with no configuration.
export const MODULES = ["finance", "guide", "whatsapp", "online_payments", "crm"] as const;
export type ModuleId = (typeof MODULES)[number];

const moduleSchema = z.enum(MODULES);

/** "finance, whatsapp" -> Set{finance, whatsapp}. Unknown names are an error (a typo must not silently keep a module on). */
export function parseDisabledModules(raw: string | undefined | null): { ok: true; disabled: ReadonlySet<ModuleId> } | { ok: false; unknown: string[] } {
  const names = (raw ?? "").split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  const unknown = names.filter((name) => !moduleSchema.safeParse(name).success);
  if (unknown.length > 0) return { ok: false, unknown };
  return { ok: true, disabled: new Set(names.map((name) => moduleSchema.parse(name))) };
}

export function isModuleEnabled(disabled: ReadonlySet<ModuleId>, module: ModuleId): boolean {
  return !disabled.has(module);
}

/** Dashboard sections hidden when a module is off. Paths are prefixes of the panel routes. */
export const MODULE_NAV_HREFS: Readonly<Record<ModuleId, readonly string[]>> = {
  finance: ["/app/finance"],
  guide: ["/app/site/guide"],
  whatsapp: [],
  online_payments: [],
  crm: ["/app/guests"],
};
