"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { NotOwnerError, saveWhatsappRule } from "@/lib/dal/whatsapp-rules";
import { whatsappRuleSchema } from "@/lib/domain/whatsapp-rules";
import type { FormState } from "../../site/_lib/form-state";

export async function whatsappRuleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = whatsappRuleSchema.safeParse({
    kind: form.get("kind"), enabled: form.get("enabled") === "on", offsetDays: form.get("offsetDays") ?? 0,
    windowStart: form.get("windowStart"), windowEnd: form.get("windowEnd"),
  });
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, formError: "Revisa los campos indicados." };
  try {
    await saveWhatsappRule(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof NotOwnerError) return { ok: false, formError: error.message };
    return { ok: false, formError: "No se pudo guardar el cambio. Actualiza la página y vuelve a intentarlo." };
  }
  revalidatePath("/app/settings/whatsapp");
  return { ok: true, savedAt: Date.now() };
}
