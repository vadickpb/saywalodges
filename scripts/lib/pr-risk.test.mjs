import { describe, expect, it } from "vitest";
import { classifyPr } from "./pr-risk.mjs";

const ui = (filename, patch = "+<p>{t.title}</p>") => ({ filename, status: "modified", patch });

describe("classifyPr", () => {
  it("treats presentational UI, copy, docs, tests and images as low risk", () => {
    expect(classifyPr([
      ui("components/site/quote-form.tsx"),
      ui("dictionaries/es.ts"),
      ui("docs/roadmap.md"),
      ui("lib/domain/dates.test.ts"),
      ui("e2e/booking.spec.ts"),
      { filename: "public/hero.webp", status: "added" },
    ])).toEqual({ risk: "low", reasons: [] });
  });

  it.each([
    "supabase/migrations/20261104000000_x.sql",
    "supabase/tests/0030_x.test.sql",
    "lib/dal/bookings.ts",
    "lib/dal/bookings.test.ts",
    "lib/supabase/admin.ts",
    "lib/cron-auth.ts",
    "lib/security/csp.ts",
    "lib/json-ld.ts",
    "lib/email/render.tsx",
    "lib/domain/pricing.ts",
    "lib/domain/host-routing.ts",
    "proxy.ts",
    "instrumentation.ts",
    "app/api/cron/expire-holds/route.ts",
    "app/sites/[host]/[lang]/cotizar/actions.ts",
    "app/(platform)/login/page.tsx",
    "app/sites/[host]/[lang]/layout.tsx",
    "app/sites/[host]/[lang]/cotizar/page.tsx",
    "app/app/bookings/page.tsx",
    "components/site/voucher-form.tsx",
    "app/(platform)/auth/callback/route.ts",
    "scripts/lib/demo-data.mjs",
    "scripts/check-installation-health.mjs",
    "package.json",
    ".github/workflows/ci.yml",
    "vitest.config.mts",
    "eslint.config.mjs",
    "tsconfig.json",
    "public/x.html",
    "public/logo.svg",
    "vercel.json",
    "AGENTS.md",
    "deploy/installations.json",
  ])("flags %s as high risk", (file) => {
    const result = classifyPr([ui("components/site/ui.tsx"), ui(file)]);
    expect(result.risk).toBe("high");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain(file);
  });

  it.each([
    ['+"use server";'],
    ['+import { createAdminClient } from "@/lib/supabase/admin";'],
    ["+<div dangerouslySetInnerHTML={{ __html: html }} />"],
    ["+const key = process.env.SECRET;"],
    ['+await fetch("https://x", { method: "POST" });'],
    ['+await supabase.rpc("approve_payment");'],
    ['+import "server-only";'],
    ["+el.innerHTML = value;"],
    ['+import { submit } from "./actions";'],
  ])("flags low-risk paths that add sensitive code: %s", (patch) => {
    expect(classifyPr([ui("components/site/hero.tsx", patch)]).risk).toBe("high");
  });

  it("ignores sensitive text on removed lines", () => {
    expect(classifyPr([ui("components/site/hero.tsx", "-const k = process.env.X;\n+const k = 1;")]).risk).toBe("low");
  });

  it("flags a rename out of a sensitive path", () => {
    expect(classifyPr([{ filename: "components/site/units.ts", previous_filename: "lib/dal/public/units.ts", status: "renamed", patch: "" }]).risk).toBe("high");
  });

  it("flags a deleted test", () => {
    expect(classifyPr([{ filename: "lib/domain/dates.test.ts", status: "removed" }]).risk).toBe("high");
  });

  it("flags a text file whose patch the API did not return", () => {
    expect(classifyPr([{ filename: "components/site/huge.tsx", status: "modified" }]).risk).toBe("high");
  });

  it("flags a truncated file list and an empty diff", () => {
    expect(classifyPr([ui("docs/a.md")], { expectedCount: 3001 }).risk).toBe("high");
    expect(classifyPr([]).risk).toBe("high");
  });
});
