import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getEmailTestSecret } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send";

// Manual smoke test for SD-306: lets the owner send one test email from a
// preview deployment. Closed by default: it answers 404 unless EMAIL_TEST_SECRET
// is set, and never in production. The recipient must also pass the preview
// allow-list (EMAIL_ALLOWED_RECIPIENTS) inside sendEmail.
const bodySchema = z.object({ to: z.email().max(254), lang: z.enum(["es", "en"]).default("es") });

const reply = (body: object, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function secretMatches(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

export async function POST(request: Request) {
  const secret = getEmailTestSecret();
  if (!secret) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || !secretMatches(authorization.slice(7), secret)) {
    return reply({ ok: false, error: "unauthorized" }, 401);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: "invalid_body" }, 400);

  const result = await sendEmail({ template: "test", lang: parsed.data.lang, to: parsed.data.to, props: {} });
  if (!result.ok) return reply({ ok: false, error: result.reason }, result.reason === "recipient_not_allowed" ? 403 : 502);
  return reply({ ok: true, simulated: result.simulated, id: result.id }, 200);
}
