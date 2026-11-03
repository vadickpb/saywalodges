"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { paymentAccountSchema, paymentAccountIdSchema } from "@/lib/domain/payment-accounts";
import { savePaymentAccount, setPaymentAccountActive, deletePaymentAccount } from "@/lib/dal/payment-accounts";
import type { FormState } from "../site/_lib/form-state";

export async function paymentAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const operation = z.enum(["save", "toggle", "delete"]).safeParse(form.get("operation"));
  const id = z.union([paymentAccountIdSchema, z.literal("")]).safeParse(form.get("id"));
  if (!operation.success || !id.success) return { ok: false, formError: "Datos inválidos." };
  const active = z.enum(["true", "false"]).safeParse(form.get("active"));
  const parsed = paymentAccountSchema.safeParse({
    ...Object.fromEntries(form), active: active.success ? active.data === "true" : undefined,
  });
  if (operation.data === "save" && !parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, formError: "Revisa los campos indicados." };
  if (operation.data !== "save" && (!id.data || (operation.data === "toggle" && !active.success))) return { ok: false, formError: "Datos inválidos." };
  try {
    if (operation.data === "save" && parsed.success) await savePaymentAccount(id.data || null, parsed.data);
    else if (operation.data === "toggle" && active.success) await setPaymentAccountActive(id.data, active.data === "true");
    else if (operation.data === "delete") await deletePaymentAccount(id.data);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, formError: "No se pudo guardar el cambio. Actualiza la página y vuelve a intentarlo." };
  }
  revalidatePath("/app/settings");
  return { ok: true, savedAt: Date.now() };
}
