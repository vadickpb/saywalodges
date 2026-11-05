import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { z } from "zod";

// Never inherit a developer's hosted credentials, including Next's automatic dotenv loading.
export function localBookingStack() {
  for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    if (existsSync(file)) throw new Error(`E2E refuses ${file}; use a clean worktree with local Supabase.`);
  }
  const status = z.object({
    API_URL: z.literal("http://127.0.0.1:54321"),
    ANON_KEY: z.string().min(1),
    SERVICE_ROLE_KEY: z.string().min(1),
  }).parse(JSON.parse(execFileSync("npx", ["supabase@2.122.0", "status", "-o", "json"], { encoding: "utf8" })));
  return status;
}

export function bookingAppEnv(stack = localBookingStack()) {
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: stack.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.ANON_KEY,
    SUPABASE_URL: stack.API_URL,
    // User journeys must work without privileged app access. Only the fixture gets the real local key.
    SUPABASE_SERVICE_ROLE_KEY: "e2e-unused-service-role-key",
    ROOT_DOMAIN: "localhost:3410",
    DEPLOYMENT_MODE: "platform",
    NEXT_PUBLIC_SITE_URL: "http://app.localhost:3410",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
