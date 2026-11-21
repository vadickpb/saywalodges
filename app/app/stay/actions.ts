"use server";

import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { saveStayDetails } from "@/lib/dal/stay-details";
import { stayDetailsSchema, stayKeySchema } from "@/lib/domain/stay-details";

export type StayActionResult = { ok: true } | { ok: false; error: string; fields?: Record<string, string[]> };

/** Autosave of the stay card. The organization comes from the session; the database re-checks the stay belongs to it. */
export async function saveStayDetailsAction(rawKey: unknown, rawDetails: unknown): Promise<StayActionResult> {
  const key = stayKeySchema.safeParse(rawKey);
  const details = stayDetailsSchema.safeParse(rawDetails);
  if (!key.success) return { ok: false, error: "Estadía no válida. Actualiza la página." };
  if (!details.success) return { ok: false, error: "Revisa los campos marcados.", fields: z.flattenError(details.error).fieldErrors };
  try {
    await saveStayDetails(key.data.kind === "booking" ? { bookingId: key.data.bookingId } : { feedId: key.data.feedId, externalUid: key.data.externalUid }, details.data);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "No se pudo guardar. Inténtalo de nuevo." };
  }
  revalidatePath("/app/calendar");
  return { ok: true };
}
