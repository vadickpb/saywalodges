import { describe, expect, it } from "vitest";
import { classifyPr } from "./pr-risk.mjs";

describe("classifyPr", () => {
  it("treats UI, dictionaries, docs and pure tests as low risk", () => {
    expect(classifyPr([
      "components/site/quote-form.tsx",
      "app/sites/[host]/[lang]/cotizar/page.tsx",
      "dictionaries/es.ts",
      "docs/roadmap.md",
      "lib/domain/dates.test.ts",
      "e2e/booking.spec.ts",
    ])).toEqual({ risk: "low", reasons: [] });
  });

  it.each([
    "supabase/migrations/20261104000000_x.sql",
    "supabase/tests/0030_x.test.sql",
    "lib/dal/bookings.ts",
    "lib/supabase/admin.ts",
    "proxy.ts",
    "app/api/cron/expire-holds/route.ts",
    "app/sites/[host]/[lang]/cotizar/actions.ts",
    "app/app/bookings/[id]/voucher/[paymentId]/route.ts",
    "lib/domain/pricing.ts",
    "lib/env.ts",
    "package.json",
    "package-lock.json",
    ".github/workflows/ci.yml",
    "vercel.json",
    "AGENTS.md",
    "scripts/lib/pr-risk.mjs",
    "deploy/installations.json",
  ])("flags %s as high risk", (file) => {
    expect(classifyPr(["components/site/ui.tsx", file])).toEqual({ risk: "high", reasons: [file] });
  });

  it("never auto-merges an empty diff", () => {
    expect(classifyPr([]).risk).toBe("high");
  });
});
