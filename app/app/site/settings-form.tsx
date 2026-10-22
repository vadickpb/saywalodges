"use client";

import { useActionState, useEffect, useId } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { PropertySettings } from "@/lib/domain/property-settings";
import { updateSettings, type UpdateSettingsState } from "./actions";

const INITIAL_STATE: UpdateSettingsState = { ok: false };

function Field({
  name,
  label,
  defaultValue,
  errors,
  type = "text",
  ...props
}: {
  name: string;
  label: string;
  defaultValue: string;
  errors: string[] | undefined;
} & Omit<React.ComponentProps<typeof Input>, "name" | "id" | "defaultValue">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? `${id}-error` : undefined}
        {...props}
      />
      {errors && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

// Client component: useActionState needs to run in the browser. The parent
// page (app/app/site/page.tsx, a server component) loads `initial` via
// requireActiveOrg() + getPropertySettings() and passes it down — this
// component only ever submits to the updateSettings server action, which
// re-resolves the org itself rather than trusting anything sent here.
export function SettingsForm({ initial }: { initial: PropertySettings }) {
  const [state, formAction, isPending] = useActionState(updateSettings, INITIAL_STATE);
  const errors = state.errors ?? {};

  // After updateSettings runs at least once, Next re-renders this route
  // segment (it's bound to a server action on this page), which hands
  // page.tsx's freshly-refetched `initial` back down — and that DOES reach
  // these uncontrolled inputs' live values, not just their initial mount.
  // Without preferring state.values here, a validation error on ONE field
  // would wipe whatever the user had typed into every OTHER field too,
  // snapping the whole form back to the last-saved DB copy. Verified this
  // was a real, reproducible bug (not a test artifact) with actual
  // dispatched input events in a real browser before fixing it this way.
  const v = (key: keyof PropertySettings, fallback: string) => state.values?.[key] ?? fallback;

  useEffect(() => {
    if (state.ok) toast.success("Cambios guardados");
    else if (state.errors?._form) toast.error(state.errors._form[0]);
  }, [state]);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      <Section title="Información">
        <Field name="name" label="Nombre" defaultValue={v("name", initial.name)} errors={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="priceRange"
            label="Rango de precio (ej. $$)"
            defaultValue={v("priceRange", initial.priceRange)}
            errors={errors.priceRange}
          />
          <Field
            name="starRating"
            label="Estrellas (0–5, opcional)"
            type="number"
            defaultValue={v("starRating", initial.starRating?.toString() ?? "")}
            errors={errors.starRating}
            min={0}
            max={5}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="petsAllowed"
            name="petsAllowed"
            defaultChecked={state.values ? state.values.petsAllowed === "on" : initial.petsAllowed}
            className="size-4 rounded border-input"
          />
          <Label htmlFor="petsAllowed">Se aceptan mascotas</Label>
        </div>
      </Section>

      <Section title="Contacto">
        <Field
          name="whatsappNumber"
          label="WhatsApp (solo números, con código de país)"
          defaultValue={v("whatsappNumber", initial.whatsappNumber)}
          errors={errors.whatsappNumber}
        />
        <Field name="email" label="Email" type="email" defaultValue={v("email", initial.email)} errors={errors.email} />
        <Field
          name="whatsappMessageEs"
          label="Mensaje de WhatsApp (es)"
          defaultValue={v("whatsappMessageEs", initial.whatsappMessageEs)}
          errors={errors.whatsappMessageEs}
        />
        <Field
          name="whatsappMessageEn"
          label="Mensaje de WhatsApp (en)"
          defaultValue={v("whatsappMessageEn", initial.whatsappMessageEn)}
          errors={errors.whatsappMessageEn}
        />
      </Section>

      <Section title="Dirección">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            name="addressLocality"
            label="Localidad"
            defaultValue={v("addressLocality", initial.addressLocality)}
            errors={errors.addressLocality}
          />
          <Field
            name="addressRegion"
            label="Región"
            defaultValue={v("addressRegion", initial.addressRegion)}
            errors={errors.addressRegion}
          />
          <Field
            name="addressCountry"
            label="País (código, ej. PE)"
            defaultValue={v("addressCountry", initial.addressCountry)}
            errors={errors.addressCountry}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="latitude"
            label="Latitud (opcional)"
            type="number"
            step="any"
            defaultValue={v("latitude", initial.latitude?.toString() ?? "")}
            errors={errors.latitude}
          />
          <Field
            name="longitude"
            label="Longitud (opcional)"
            type="number"
            step="any"
            defaultValue={v("longitude", initial.longitude?.toString() ?? "")}
            errors={errors.longitude}
          />
        </div>
        <Field
          name="mapsUrl"
          label="Enlace de Google Maps (https://…, opcional)"
          defaultValue={v("mapsUrl", initial.mapsUrl)}
          errors={errors.mapsUrl}
        />
        <Field
          name="airbnbUrl"
          label="Enlace de Airbnb (https://…, opcional)"
          defaultValue={v("airbnbUrl", initial.airbnbUrl)}
          errors={errors.airbnbUrl}
        />
      </Section>

      <Section title="SEO">
        <Field name="metaTitleEs" label="Título SEO (es)" defaultValue={v("metaTitleEs", initial.metaTitleEs)} errors={errors.metaTitleEs} />
        <Field name="metaTitleEn" label="Título SEO (en)" defaultValue={v("metaTitleEn", initial.metaTitleEn)} errors={errors.metaTitleEn} />
        <Field
          name="metaDescriptionEs"
          label="Descripción SEO (es)"
          defaultValue={v("metaDescriptionEs", initial.metaDescriptionEs)}
          errors={errors.metaDescriptionEs}
        />
        <Field
          name="metaDescriptionEn"
          label="Descripción SEO (en)"
          defaultValue={v("metaDescriptionEn", initial.metaDescriptionEn)}
          errors={errors.metaDescriptionEn}
        />
        <Field
          name="metaKeywordsEs"
          label="Palabras clave (es, separadas por coma)"
          defaultValue={v("metaKeywordsEs", initial.metaKeywordsEs.join(", "))}
          errors={errors.metaKeywordsEs}
        />
        <Field
          name="metaKeywordsEn"
          label="Palabras clave (en, separadas por coma)"
          defaultValue={v("metaKeywordsEn", initial.metaKeywordsEn.join(", "))}
          errors={errors.metaKeywordsEn}
        />
      </Section>

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
