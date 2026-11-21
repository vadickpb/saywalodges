"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { NotOwnerError, resetTemplate, saveHouseInfo, saveTemplate } from "@/lib/dal/message-templates";
import { houseInfoSchema, templateInputSchema } from "@/lib/domain/message-templates";

export type MessageActionResult = { ok: true } | { ok: false; error: string; fields?: Record<string, string[]> };

async function run(work: () => Promise<void>): Promise<MessageActionResult> {
  try {
    await work();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof NotOwnerError) return { ok: false, error: error.message };
    return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
  }
  revalidatePath("/app/settings/messages");
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function saveTemplateAction(raw: unknown): Promise<MessageActionResult> {
  const parsed = templateInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Revisa los campos marcados.", fields: z.flattenError(parsed.error).fieldErrors };
  return run(() => saveTemplate(parsed.data));
}

export async function resetTemplateAction(key: unknown): Promise<MessageActionResult> {
  const parsed = z.string().safeParse(key);
  if (!parsed.success) return { ok: false, error: "Mensaje no válido." };
  return run(() => resetTemplate(parsed.data));
}

export async function saveHouseInfoAction(raw: unknown): Promise<MessageActionResult> {
  const parsed = houseInfoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Revisa los campos marcados.", fields: z.flattenError(parsed.error).fieldErrors };
  return run(() => saveHouseInfo(parsed.data));
}
