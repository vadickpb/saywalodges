"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, requestPasswordResetSchema } from "@/lib/validation/auth";
import { SITE_URL } from "@/config/site";

export type SignInState = { error: string } | undefined;

export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Never surface error.message from the auth provider (CLAUDE.md):
    // it can reveal whether an account exists for a given email.
    return { error: "Invalid email or password." };
  }

  redirect("/app");
}

export type RequestPasswordResetState = { message: string } | undefined;

const GENERIC_RESET_MESSAGE = "If an account exists for that email, a reset link is on its way.";

export async function requestPasswordReset(
  _prevState: RequestPasswordResetState,
  formData: FormData
): Promise<RequestPasswordResetState> {
  const parsed = requestPasswordResetSchema.safeParse({ email: formData.get("email") });
  // Same message whether the email is valid/registered or not, so the form
  // never reveals which emails have accounts (no self-signup in the MVP —
  // every account was pre-provisioned, so enumeration here is pure downside).
  if (!parsed.success) {
    return { message: GENERIC_RESET_MESSAGE };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${SITE_URL}/auth/callback?next=/update-password`,
  });

  return { message: GENERIC_RESET_MESSAGE };
}
