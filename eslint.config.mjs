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
              message: "lib/supabase.ts is a service-role shim (SD-104 migrates its callers). Use lib/supabase/server.ts or lib/dal/* instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // Pre-existing SD-104 debt: these routes already use the shim and are
    // migrated to the DAL in that ticket, not this one. A later config
    // object wins over the one above for the files it matches.
    files: ["app/api/admin/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
