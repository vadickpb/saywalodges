"use server";

import { headers } from "next/headers";
import { env } from "@/lib/env";
import { createLeadLimiter, leadSchema, leadVerdict } from "@/lib/domain/vendor-lead";
import { sendEmail } from "@/lib/email/send";

export type LeadState = { status: "idle" | "sent" | "invalid" | "error" | "unavailable" };

const allow = createLeadLimiter();

// Public action of the vendor site: never trusts the client, never echoes provider errors.
export async function submitLead(_prev: LeadState, formData: FormData): Promise<LeadState> {
  if (env.DEPLOYMENT_MODE !== "vendor" || !env.VENDOR_CONTACT_EMAIL) return { status: "unavailable" };

  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  const now = Date.now();
  // Bots get the same "sent" answer so they learn nothing; nothing is delivered.
  if (leadVerdict(parsed.data, now) === "bot") return { status: "sent" };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (!allow(ip, now)) return { status: "error" };

  const { name, email, phone, properties, package: pkg, message } = parsed.data;
  const result = await sendEmail({
    to: env.VENDOR_CONTACT_EMAIL,
    template: "vendorLead",
    lang: "es",
    props: { name, email, phone, properties, package: pkg, message },
  });
  return { status: result.ok ? "sent" : "error" };
}
