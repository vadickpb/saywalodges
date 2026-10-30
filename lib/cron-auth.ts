import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Authenticates /api/cron/* (SD-408). Callers send `Authorization: Bearer <CRON_SECRET>`
// (Vercel Cron does this automatically; any external scheduler can set the header).
// Fails closed: no secret configured, or one shorter than 32 chars, rejects every request.
// Both sides are hashed to a fixed length so the comparison is constant-time regardless of
// the supplied header's length.
export const MIN_CRON_SECRET_LENGTH = 32;

const digest = (value: string) => createHash("sha256").update(value).digest();

export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return false;
  if (!authorization) return false;
  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match) return false;
  return timingSafeEqual(digest(match[1]), digest(secret));
}
