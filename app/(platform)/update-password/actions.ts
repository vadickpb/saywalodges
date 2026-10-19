"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePasswordSchema } from "@/lib/validation/auth";

export type UpdatePasswordState = { error: string } | undefined;

export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const parsed = updatePasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  // Relies on the session the /auth/callback route established from the
  // recovery link's code — there's no separate "recovery token" to pass in.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: "Could not update your password. Request a new reset link and try again." };
  }

  // A password change should end every other session (e.g. a device where a
  // stolen cookie was being used) — otherwise changing the password doesn't
  // actually lock anyone out.
  await supabase.auth.signOut({ scope: "others" });

  redirect("/app");
}
