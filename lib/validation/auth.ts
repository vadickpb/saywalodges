import { z } from "zod";

// Runtime validation for the auth server actions (CLAUDE.md: no `any`/`as`
// for external input, use zod).

export const signInSchema = z.object({
  email: z.string().max(200).email(),
  password: z.string().min(1).max(200),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().max(200).email(),
});

// Supabase Auth's own minimum; kept here instead of hardcoded in the action
// so the rule is visible next to the rest of the auth validation.
export const updatePasswordSchema = z.object({
  password: z.string().min(8).max(200),
});
