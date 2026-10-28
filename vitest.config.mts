import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests for pure/server logic (lib/**). No React component testing
// here — see CLAUDE.md: UI is verified manually with `npm run dev`.
export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib/domain/pricing.ts", "lib/domain/rates-management.ts", "lib/domain/finance.ts", "lib/domain/finance-reports.ts", "lib/domain/finance-export.ts", "lib/domain/finance-recurring.ts", "lib/domain/dates.ts", "lib/domain/availability.ts", "lib/ical/export.ts"],
      reporter: ["text", "json-summary", "html"],
      thresholds: { perFile: true, lines: 90, statements: 90, functions: 90, branches: 90 },
    },
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    // Dummy defaults so modules that import lib/env.ts (which validates
    // eagerly at import time) don't crash in test files that never touch
    // env themselves. env.test.ts overrides process.env directly per case.
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      ROOT_DOMAIN: "localhost:3000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      // Outside Next's bundler there's no "react-server" condition to pick
      // server-only's no-op export, so plain Node/Vitest hits its throwing
      // default — alias it to that same no-op for tests.
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
});
