"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { updateSiteAppearance } from "@/lib/dal/property";
import { parseAppearancePayload } from "@/lib/domain/site-appearance";
import { createClient } from "@/lib/supabase/server";

export type AppearanceState = {
  ok: boolean;
  formError?: string;
  // zod issue paths of the rejected draft (e.g. "theme.primary"), for a hint.
  paths?: string[];
  // Contrast warnings of what was just saved; saving is never blocked by them.
  savedAt?: number;
};

// Same access rule as "Sitio → Información" (SD-201): any member of the
// active org. The form sends one JSON `payload` and no org or property id —
// the org comes from requireActiveOrg() (session + real membership), the
// payload is validated with the domain's own zod schemas, and the write is
// scoped by org_id on top of RLS and the column grant.
export async function saveAppearance(_prev: AppearanceState, formData: FormData): Promise<AppearanceState> {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return { ok: false, formError: "No tienes una organización activa." };

  const parsed = parseAppearancePayload(formData.get("payload"));
  if (!parsed.ok) {
    return { ok: false, formError: "Revisa los campos marcados e intenta de nuevo.", paths: parsed.paths };
  }

  const supabase = await createClient();
  const result = await updateSiteAppearance(supabase, activeOrg.id, parsed.data);
  if (!result.ok) return { ok: false, formError: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath("/app/site/appearance");
  return { ok: true, savedAt: Date.now() };
}
