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
    // webhooks, cron and RPCs — never pages or components.
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
]);

export default eslintConfig;
