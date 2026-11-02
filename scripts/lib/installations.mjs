// Installation registry for the multi-project DB deploy (SD-1003, ADR 0010).
// deploy/installations.json is in a PUBLIC repo, so it holds only an opaque id and the
// name of the GitHub Environment. Everything client-specific (Supabase project ref,
// secrets) lives inside that Environment, behind its required-reviewer gate.

import { z } from "zod";

const installationSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
    // `supabase-production` is the original installation; new ones are `supabase-<id>`.
    environment: z.string().regex(/^supabase-[a-z0-9]+(-[a-z0-9]+)*$/).max(60),
  })
  .strict();

export const registrySchema = z
  .object({ installations: z.array(installationSchema).min(1).max(100) })
  .strict()
  .superRefine((reg, ctx) => {
    for (const key of ["id", "environment"]) {
      const seen = new Set();
      for (const [i, inst] of reg.installations.entries()) {
        if (seen.has(inst[key])) ctx.addIssue({ code: "custom", path: ["installations", i, key], message: `duplicate ${key}: ${inst[key]}` });
        seen.add(inst[key]);
      }
    }
  });

export function parseRegistry(input) {
  return registrySchema.parse(input);
}

/** GitHub Actions matrix. `only` (an id) restricts it to one installation; unknown id is an error. */
export function buildMatrix(registry, only = "") {
  const wanted = only.trim();
  const list = wanted ? registry.installations.filter((i) => i.id === wanted) : registry.installations;
  if (list.length === 0) throw new Error(`no installation matches "${wanted}"`);
  return { include: list.map(({ id, environment }) => ({ id, environment })) };
}
