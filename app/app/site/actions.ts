"use server";

import { createClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/dal/organizations";
import { updatePropertySettings } from "@/lib/dal/property";
import { propertySettingsSchema } from "@/lib/domain/property-settings";

// Field names as submitted by app/app/site/settings-form.tsx (strings only
// — petsAllowed is the odd one out, see rawValues below).
const TEXT_FIELDS = [
  "name",
  "whatsappNumber",
  "whatsappMessageEn",
  "whatsappMessageEs",
  "email",
  "mapsUrl",
  "airbnbUrl",
  "addressLocality",
  "addressRegion",
  "addressCountry",
  "latitude",
  "longitude",
  "metaTitleEn",
  "metaTitleEs",
  "metaDescriptionEn",
  "metaDescriptionEs",
  "metaKeywordsEn",
  "metaKeywordsEs",
  "priceRange",
  "starRating",
] as const;

export type UpdateSettingsState = {
  ok: boolean;
  errors?: Partial<Record<keyof typeof propertySettingsSchema.shape | "_form", string[]>>;
  // Echoes back exactly what the user submitted. app/app/site/page.tsx
  // re-fetches `initial` fresh from the DB on every render of this page,
  // including the one that follows this action — without this, Next
  // re-rendering the route segment after the action resets every
  // uncontrolled <input>'s value to that stale server copy, wiping
  // whatever the user had typed in *other*, still-unsaved fields too (not
  // just the one that failed validation). Found by testing the real
  // browser flow, not caught by types/build. See settings-form.tsx.
  values?: Record<string, string>;
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function rawValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of TEXT_FIELDS) values[key] = text(formData, key);
  values.petsAllowed = formData.get("petsAllowed") === "on" ? "on" : "";
  return values;
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN; // NaN deliberately fails z.number() below
}

// Comma-separated input → trimmed, non-empty keyword list.
function toKeywords(value: string): string[] {
  return value
    .split(",")
    .map((kw) => kw.trim())
    .filter(Boolean);
}

// Signature matches React's useActionState (app/app/site/settings-form.tsx):
// the form never sends an org or property id — requireActiveOrg() resolves
// the org for *this session* server-side, re-verified against real
// membership, so there is no field here a forged request could use to edit
// another org's property.
export async function updateSettings(
  _prevState: UpdateSettingsState,
  formData: FormData
): Promise<UpdateSettingsState> {
  const values = rawValues(formData);

  const { activeOrg } = await requireActiveOrg();
  if (!activeOrg) {
    return { ok: false, errors: { _form: ["No tienes una organización activa."] }, values };
  }

  const parsed = propertySettingsSchema.safeParse({
    name: values.name,
    whatsappNumber: values.whatsappNumber,
    whatsappMessageEn: values.whatsappMessageEn,
    whatsappMessageEs: values.whatsappMessageEs,
    email: values.email,
    mapsUrl: values.mapsUrl,
    airbnbUrl: values.airbnbUrl,
    addressLocality: values.addressLocality,
    addressRegion: values.addressRegion,
    addressCountry: values.addressCountry,
    latitude: toNullableNumber(values.latitude),
    longitude: toNullableNumber(values.longitude),
    metaTitleEn: values.metaTitleEn,
    metaTitleEs: values.metaTitleEs,
    metaDescriptionEn: values.metaDescriptionEn,
    metaDescriptionEs: values.metaDescriptionEs,
    metaKeywordsEn: toKeywords(values.metaKeywordsEn),
    metaKeywordsEs: toKeywords(values.metaKeywordsEs),
    priceRange: values.priceRange,
    starRating: toNullableNumber(values.starRating),
    petsAllowed: values.petsAllowed === "on",
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors, values };
  }

  const supabase = await createClient();
  const result = await updatePropertySettings(supabase, activeOrg.id, parsed.data);
  if (!result.ok) {
    return { ok: false, errors: { _form: ["No se pudo guardar. Intenta de nuevo."] }, values };
  }

  return { ok: true };
}
