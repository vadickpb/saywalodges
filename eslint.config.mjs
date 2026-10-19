import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/worktrees/**",
  ]),
  {
    // CLAUDE.md: the service-role client bypasses RLS and is restricted to
    // webhooks, cron and RPCs — never pages or components. Blocks both the
    // real module and lib/supabase.ts's backward-compat shim (same client,
    // re-exported under the old name) — otherwise the shim path would be
    // an unflagged escape hatch to the same service-role access.
    files: ["app/**", "components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message: "lib/supabase/admin.ts is service-role only (webhooks/cron/RPCs). Use lib/supabase/server.ts or lib/dal/* instead.",
            },
            {
              name: "@/lib/supabase",
              message: "lib/supabase.ts is a service-role shim. Use lib/supabase/server.ts or lib/dal/* instead.",
            },
            {
              name: "@/lib/supabase/anon",
              message: "lib/supabase/anon.ts is the public-site DAL's client (ADR-0002). Use lib/dal/public/* instead.",
            },
          ],
          // `paths` only matches the exact specifier text, so a relative
          // import (../lib/supabase/admin) would slip through it. These
          // patterns catch any import ending in one of those module paths
          // regardless of how many `../` segments precede it.
          patterns: [
            {
              group: ["**/lib/supabase/admin", "**/supabase/admin"],
              message: "lib/supabase/admin.ts is service-role only (webhooks/cron/RPCs). Use lib/supabase/server.ts or lib/dal/* instead.",
            },
            {
              group: ["**/lib/supabase/anon", "**/supabase/anon"],
              message: "lib/supabase/anon.ts is the public-site DAL's client (ADR-0002). Use lib/dal/public/* instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // Pre-existing debt: these routes use the service-role shim directly
    // for admin mutations. SD-104 only moved the *public* site's reads
    // into lib/dal/public/*; an admin-scoped DAL doesn't exist yet (Fase 2,
    // SD-201/202). A later config object wins over the one above for the
    // files it matches.
    files: ["app/api/admin/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
