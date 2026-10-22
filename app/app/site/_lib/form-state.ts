// Shape returned by the create/update actions and consumed by
// components/dashboard/content-form.tsx via useActionState.
export type FormState = {
  ok: boolean;
  errors?: Record<string, string[]>;
  formError?: string;
  // Echo of the submitted values, so a failed save does not reset the other
  // uncontrolled inputs (same reason as UpdateSettingsState.values).
  values?: Record<string, string>;
  // Bumped on success so the form can clear itself when it is a "new" form.
  savedAt?: number;
};

export function readText(formData: FormData, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = formData.get(key);
    out[key] = typeof v === "string" ? v : "";
  }
  return out;
}
