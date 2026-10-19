import { z } from "zod";

// Validates required server env vars once, at first import, so a missing
// variable fails loudly and immediately instead of surfacing as a confusing
// downstream error (e.g. "fetch failed" deep inside the Supabase client).
// Import `env` instead of reading `process.env` directly for these vars.
const envSchema = z.object({
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL (e.g. https://xxxx.supabase.co)"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  // Public by design (the anon key is meant to be exposed to the browser —
  // RLS, not secrecy, is what protects data behind it). Needed by both
  // lib/supabase/server.ts and lib/supabase/browser.ts (SD-103).
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  // Server-only — proxy.ts uses this to tell "app.<ROOT_DOMAIN>" (dashboard)
  // and "<ROOT_DOMAIN>" (landing) apart from tenant subdomains/custom
  // domains. "host:port" in dev, bare domain in prod. Defaults to the
  // "localhost:3000" dev setup CLAUDE.md documents, so local dev works
  // without a .env.local change — production still sets its real value.
  ROOT_DOMAIN: z.string().min(1).default("localhost:3000"),
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

  // ROOT_DOMAIN's default exists for local dev convenience — a production
  // deploy that forgets to set it doesn't error, it just quietly 404s every
  // real host (every request looks like an unrecognized custom domain, per
  // proxy.ts). Fail loudly here instead, same as every other required var.
  if (process.env.NODE_ENV === "production" && !process.env.ROOT_DOMAIN) {
    throw new Error(
      "Invalid environment configuration:\n  - ROOT_DOMAIN: required in production (no default) — set it in Vercel → Settings → Environment Variables.\n\nCheck .env.local against .env.example."
    );
  }

  return parsed.data;
}

export const env = loadEnv();
