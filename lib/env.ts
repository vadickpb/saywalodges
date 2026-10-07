import { z } from "zod";

// Validates required server env vars once, at first import, so a missing
// variable fails loudly and immediately instead of surfacing as a confusing
// downstream error (e.g. "fetch failed" deep inside the Supabase client).
// Import `env` instead of reading `process.env` directly for these vars.
const envSchema = z.object({
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL (e.g. https://xxxx.supabase.co)"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCheck .env.local against .env.example.`
    );
  }
  return parsed.data;
}

export const env = loadEnv();
