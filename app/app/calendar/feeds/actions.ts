"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFeed, deleteFeed, regenerateToken } from "@/lib/dal/ical-feeds";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { feedFormSchema } from "@/lib/domain/ical-feeds";
import { createClient } from "@/lib/supabase/server";
import { readText, type FormState } from "../../site/_lib/form-state";

// Calendar links are owner-only: each action re-checks the role on the server
// (hiding a button is not authorization) and RLS is the second barrier. The org
// always comes from the session.

const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";
const NO_CONTEXT_ERROR = "No tienes una organización activa.";
const NOT_OWNER_ERROR = "Solo el dueño puede gestionar los calendarios.";

async function ownerContext() {
  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) return { ok: false, error: NO_CONTEXT_ERROR } as const;
  if (activeOrg.role !== "owner") return { ok: false, error: NOT_OWNER_ERROR } as const;
  return { ok: true, orgId: activeOrg.id, supabase: await createClient() } as const;
}

export async function createFeedAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = readText(formData, ["unitId", "channel"]);
  const owner = await ownerContext();
  if (!owner.ok) return { ok: false, formError: owner.error, values };
  const parsed = feedFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  const result = await createFeed(owner.supabase, owner.orgId, parsed.data);
  // 23505 (that unit already has that channel) is also reported generically: the form says what to check.
  if (!result.ok) return { ok: false, formError: "No se pudo crear el enlace. Revisa que esa casa no tenga ya uno para ese canal.", values };
  revalidatePath("/app/calendar/feeds");
  return { ok: true, savedAt: Date.now() };
}

type RowResult = { ok: true } | { ok: false; error: string };

export async function regenerateFeedAction(formData: FormData): Promise<RowResult> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const owner = await ownerContext();
  if (!owner.ok) return { ok: false, error: owner.error };
  if (!id.success) return { ok: false, error: GENERIC_ERROR };
  const result = await regenerateToken(owner.supabase, owner.orgId, id.data);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath("/app/calendar/feeds");
  return { ok: true };
}

export async function deleteFeedAction(formData: FormData): Promise<RowResult> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const owner = await ownerContext();
  if (!owner.ok) return { ok: false, error: owner.error };
  if (!id.success) return { ok: false, error: GENERIC_ERROR };
  const result = await deleteFeed(owner.supabase, owner.orgId, id.data);
  if (!result.ok) return { ok: false, error: GENERIC_ERROR };
  revalidatePath("/app/calendar/feeds");
  return { ok: true };
}
