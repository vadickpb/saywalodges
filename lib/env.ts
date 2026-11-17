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
  // Server-only (SD-1001, ADR 0010). "platform" serves tenant sites under
  // <sub>.<ROOT_DOMAIN>. "installation" is one installation per client: ROOT_DOMAIN is the client's public
  // site and app.<ROOT_DOMAIN> serves the panel, auth and every /api/* route. "vendor" serves only the
  // product sales site on ROOT_DOMAIN; it has no panel, auth or API surface.
  DEPLOYMENT_MODE: z.enum(["platform", "installation", "vendor"]).default("platform"),
  // Public URL of the panel (password-reset redirects, dashboard metadata). Required in production and whenever
  // DEPLOYMENT_MODE=installation (checked below). Development platform mode uses http://localhost:3000.
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url("NEXT_PUBLIC_SITE_URL must be a valid URL").optional(),
  ),
  NEXT_PUBLIC_PRODUCT_NAME: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().min(1).max(80).optional(),
  ),
  // Server-only (SD-1110). Sales-site CTAs are absent when these are unset.
  VENDOR_WHATSAPP_NUMBER: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().regex(/^\d{8,15}$/, "VENDOR_WHATSAPP_NUMBER must contain 8 to 15 digits, including country code").optional(),
  ),
  VENDOR_CONTACT_EMAIL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().email("VENDOR_CONTACT_EMAIL must be a valid email address").optional(),
  ),
  VENDOR_DEMO_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string()
      .url("VENDOR_DEMO_URL must be a valid URL")
      .refine((value) => /^https?:\/\//i.test(value), "VENDOR_DEMO_URL must use http or https")
      .optional(),
  ),
  // Server-only (SD-408). Bearer secret for /api/cron/*. Optional so dev/build work
  // without it: when absent or shorter than 32 chars the cron route refuses every call.
  CRON_SECRET: z.string().optional(),
  // Server-only (SD-1004). Bearer secret for GET /api/health, separate from CRON_SECRET so the monitor can read
  // status without being able to trigger jobs. Absent or shorter than 32 chars: the route refuses every call.
  HEALTH_SECRET: z.string().optional(),
  // Server-only (SD-1007/SD-1104). "true" marks the shared demo installation: it enables the public demo login,
  // dashboard tour and reset banner. It grants no extra data permissions; the demo user remains a plain `staff` member.
  DEMO_MODE: z.string().optional(),
  // Server-only (SD-701). "1" sends the CSP as Content-Security-Policy-Report-Only (violations are logged
  // by the browser, nothing is blocked) — for validating a new policy on a preview before enforcing it.
  CSP_REPORT_ONLY: z.string().optional(),
  // Server-only (SD-1103, ADR 0019). Comma list of product modules switched OFF for this installation:
  // finance, guide, whatsapp, online_payments, crm. Empty (default) = everything on. Validated in lib/modules.ts.
  MODULES_DISABLED: z.string().optional(),
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

  const requiresSiteUrl = process.env.NODE_ENV === "production" || parsed.data.DEPLOYMENT_MODE === "installation";
  if (requiresSiteUrl && !parsed.data.NEXT_PUBLIC_SITE_URL) {
    throw new Error(
      "Invalid environment configuration:\n  - NEXT_PUBLIC_SITE_URL: required in production and installation mode.\n\nCheck .env.local against .env.example.",
    );
  }

  // Installation mode: the panel URL must be app.<ROOT_DOMAIN>, otherwise password-reset links reach the wrong host.
  if (parsed.data.DEPLOYMENT_MODE === "installation") {
    const siteUrl = parsed.data.NEXT_PUBLIC_SITE_URL;
    const expectedHost = `app.${parsed.data.ROOT_DOMAIN}`;
    const url = siteUrl ? new URL(siteUrl) : null;
    if (!url || url.origin !== `https://${expectedHost}` || url.username || url.password) {
      throw new Error(
        `Invalid environment configuration:\n  - NEXT_PUBLIC_SITE_URL: in installation mode it must be the panel URL (https://${expectedHost}).\n\nCheck .env.local against .env.example.`
      );
    }
  }

  // Vendor mode: public metadata and the sitemap use this origin. Pin it to the only accepted host so a typo cannot
  // publish canonical URLs for another domain. Local development remains free to use http://localhost.
  if (parsed.data.DEPLOYMENT_MODE === "vendor" && process.env.NODE_ENV === "production") {
    const siteUrl = parsed.data.NEXT_PUBLIC_SITE_URL;
    const url = siteUrl ? new URL(siteUrl) : null;
    const hasOnlyOrigin = url && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
    if (!url || url.origin !== `https://${parsed.data.ROOT_DOMAIN}` || !hasOnlyOrigin) {
      throw new Error(
        `Invalid environment configuration:\n  - NEXT_PUBLIC_SITE_URL: in vendor production it must be the public sales origin (https://${parsed.data.ROOT_DOMAIN}).\n\nCheck .env.local against .env.example.`,
      );
    }
  }

  return parsed.data;
}

export const env = loadEnv();
