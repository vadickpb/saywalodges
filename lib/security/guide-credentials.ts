import { randomBytes, createHash } from "node:crypto";

export function createGuideToken(): string {
  return randomBytes(32).toString("base64url");
}

// Only digests are persisted. Password derivation/verification is atomic in
// the rate-limited PostgreSQL RPC, not exposed to anonymous application reads.
export function digestGuideToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
