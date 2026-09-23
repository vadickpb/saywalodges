import { NextResponse } from "next/server";

// CLAUDE.md: never return a raw DB error message to the client. Log the real
// error server-side (visible in Vercel logs) and respond with a generic one.
export function serverError(context: string, error: unknown, status = 500) {
  console.error(`[api] ${context}:`, error);
  return NextResponse.json({ error: "internal_error" }, { status });
}

export function validationError(context: string, error: unknown) {
  console.error(`[api] ${context} validation failed:`, error);
  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}
