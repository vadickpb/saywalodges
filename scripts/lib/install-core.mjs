// Pure core of scripts/install-client.mjs (SD-1002, ADR 0010): configuration
// validation and the derivation of everything an installation needs. No I/O,
// so it is unit-tested (install-core.test.mjs). Secrets never live in the
// config file; they come from the environment or the local state file.

import { z } from "zod";

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/,
    "rootDomain must be a bare domain such as hotelandino.pe (no scheme, no port, no subdomain prefix like app.)",
  )
  .refine((v) => !v.startsWith("app.") && !v.startsWith("www."), "rootDomain must be the apex domain, not app. or www.");

// Mirrors properties_subdomain_format (migration 20261016230028): the slug is also the subdomain.
export const RESERVED_SUBDOMAINS = ["app","www","api","admin","dashboard","mail","ftp","assets","static","cdn","support","help","blog","status","docs"];

export const installConfigSchema = z
  .object({
    slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug: lowercase letters, digits and dashes").max(40).refine((v) => !RESERVED_SUBDOMAINS.includes(v), "slug is a reserved subdomain; pick another"),
    name: z.string().trim().min(1).max(120),
    rootDomain: hostname,
    ownerEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    whatsappNumber: z.string().trim().regex(/^[0-9]{8,15}$/, "digits only, with country code (51999999999)"),
    currency: z.enum(["PEN", "USD"]).default("PEN"),
    supabase: z.object({
      // Created by hand in the dashboard (see the runbook): the script never creates paid projects.
      projectRef: z.string().trim().regex(/^[a-z]{20}$/, "the 20-letter project ref of the Supabase project"),
    }),
    vercel: z.object({
      projectName: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
      teamId: z.string().trim().regex(/^team_[A-Za-z0-9]+$/).optional(),
      repo: z.string().trim().regex(/^[\w.-]+\/[\w.-]+$/).default("vadickpb/saywalodges"),
    }),
    email: z
      .object({
        // "Name <user@domain>" or a bare address; no control characters (header injection).
        from: z
          .string()
          .trim()
          .max(254)
          .regex(/^[^\u0000-\u001f\u007f<>]*(<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/, "email.from: \"Name <user@domain>\" or user@domain")
          .optional(),
        replyTo: z.string().trim().toLowerCase().max(254).pipe(z.email()).optional(),
        poweredBy: z.boolean().default(false),
      })
      .default({ poweredBy: false }),
  })
  .strict();

export function parseInstallConfig(input) {
  return installConfigSchema.parse(input);
}

export const appHost = (cfg) => `app.${cfg.rootDomain}`;
export const appOrigin = (cfg) => `https://${appHost(cfg)}`;
export const siteOrigin = (cfg) => `https://${cfg.rootDomain}`;

/** URLs Supabase Auth must allow (the password-recovery link lands here). */
export function authUrls(cfg) {
  return { siteUrl: appOrigin(cfg), // The recovery link carries ?next=…, so allow the path with any query string.
    allowList: [`${appOrigin(cfg)}/auth/callback`, `${appOrigin(cfg)}/auth/callback**`] };
}

/**
 * Vercel environment variables for the installation. `secret` ones are sent as
 * type "sensitive" (write-only afterwards). `secrets` carries values generated
 * or fetched at run time.
 */
export function buildVercelEnv(cfg, secrets) {
  const required = ["supabaseUrl", "anonKey", "serviceRoleKey", "cronSecret", "healthSecret"];
  for (const k of required) {
    if (!secrets[k]) throw new Error(`missing secret value: ${k}`);
  }
  if (secrets.cronSecret.length < 32) throw new Error("cronSecret must have at least 32 characters");
  if (secrets.healthSecret.length < 32) throw new Error("healthSecret must have at least 32 characters");
  if (secrets.healthSecret === secrets.cronSecret) throw new Error("healthSecret must differ from cronSecret");
  const vars = [
    ["DEPLOYMENT_MODE", "installation", false],
    ["ROOT_DOMAIN", cfg.rootDomain, false],
    ["NEXT_PUBLIC_SITE_URL", appOrigin(cfg), false],
    ["NEXT_PUBLIC_SUPABASE_URL", secrets.supabaseUrl, false],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", secrets.anonKey, false],
    ["SUPABASE_URL", secrets.supabaseUrl, false],
    ["SUPABASE_SERVICE_ROLE_KEY", secrets.serviceRoleKey, true],
    ["CRON_SECRET", secrets.cronSecret, true],
    ["HEALTH_SECRET", secrets.healthSecret, true],
    ["EMAIL_BRAND_NAME", cfg.name, false],
  ];
  if (cfg.email.from) vars.push(["EMAIL_FROM", cfg.email.from, false]);
  if (cfg.email.replyTo) vars.push(["EMAIL_REPLY_TO", cfg.email.replyTo, false]);
  if (cfg.email.poweredBy) vars.push(["EMAIL_POWERED_BY", "true", false]);
  if (secrets.resendApiKey) vars.push(["RESEND_API_KEY", secrets.resendApiKey, true]);
  return vars.map(([key, value, secret]) => ({
    key,
    value,
    type: secret ? "sensitive" : "plain",
    // Production only: previews are skipped for client projects (see VERCEL_IGNORE_COMMAND).
    target: ["production"],
  }));
}

/** Rows inserted with the service role. `published` stays false until the owner loads content. */
export function buildSeed(cfg, ownerUserId) {
  const org = { name: cfg.name };
  const property = {
    slug: cfg.slug,
    subdomain: cfg.slug,
    name: cfg.name,
    custom_domain: cfg.rootDomain,
    whatsapp_number: cfg.whatsappNumber,
    currency: cfg.currency,
    email: cfg.email.replyTo ?? "",
    site_url: siteOrigin(cfg),
    published: false,
  };
  const membership = (orgId) => ({ org_id: orgId, user_id: ownerUserId, role: "owner" });
  return { org, property: (orgId) => ({ ...property, org_id: orgId }), membership };
}

/** Records the owner must create at the DNS provider (Vercel shows the exact values per domain). */
export function dnsChecklist(cfg) {
  return [
    { host: cfg.rootDomain, type: "A", value: "76.76.21.21", note: "apex → Vercel (confirm the value Vercel shows)" },
    { host: appHost(cfg), type: "CNAME", value: "cname.vercel-dns.com", note: "panel (confirm the value Vercel shows)" },
    { host: `www.${cfg.rootDomain}`, type: "CNAME", value: "cname.vercel-dns.com", note: "optional; redirect to the apex in Vercel" },
  ];
}

/** Vercel "Ignored Build Step": exit 0 = skip. Client projects build only production, never PR previews. */
export const VERCEL_IGNORE_COMMAND = '[ "$VERCEL_ENV" != "production" ]';

export function generateSecret(randomBytes, bytes = 32) {
  return randomBytes(bytes).toString("hex");
}
