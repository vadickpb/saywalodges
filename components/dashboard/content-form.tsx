"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";

type FormState = {
  ok: boolean;
  errors?: Record<string, string[]>;
  formError?: string;
  values?: Record<string, string>;
  savedAt?: number;
};

export type ContentField = {
  name: string;
  label: string;
  kind?: "text" | "textarea" | "select" | "number";
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  // Grid span on sm+ screens: "half" (default) or "full".
  width?: "half" | "full";
  maxLength?: number;
};

type Props = {
  fields: ContentField[];
  initial: Record<string, string>;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  // Hidden id for an edit; omitted for "new".
  id?: string;
  submitLabel: string;
  // New-item forms reset after a successful save.
  resetOnSuccess?: boolean;
  successMessage?: string;
};

// One generic form for spaces, amenities and distances (field list is the
// only difference). Inputs are uncontrolled; after a failed save the server
// echoes the submitted values back so nothing typed is lost, like
// app/app/site/settings-form.tsx.
export function ContentForm({ fields, initial, action, id, submitLabel, resetOnSuccess, successMessage }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, { ok: false });
  const formRef = useRef<HTMLFormElement>(null);
  const baseId = useId();

  useEffect(() => {
    if (!state.savedAt) return;
    toast.success(successMessage ?? "Guardado");
    if (resetOnSuccess) formRef.current?.reset();
  }, [state.savedAt, resetOnSuccess, successMessage]);

  const value = (name: string) => state.values?.[name] ?? initial[name] ?? "";
  const errors = state.errors ?? {};

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {id && <input type="hidden" name="id" value={id} />}
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const fieldId = `${baseId}-${field.name}`;
          const fieldErrors = errors[field.name];
          // New key forces the uncontrolled input to adopt a server echo / reset.
          const inputKey = `${field.name}-${state.savedAt ?? 0}`;
          const common = {
            id: fieldId,
            name: field.name,
            defaultValue: value(field.name),
            "aria-invalid": fieldErrors ? true : undefined,
            "aria-describedby": fieldErrors ? `${fieldId}-error` : undefined,
            maxLength: field.maxLength,
          } as const;
          return (
            <div
              key={field.name}
              className={cn("flex flex-col gap-1.5", (field.width === "full" || field.kind === "textarea") && "sm:col-span-2")}
            >
              <Label htmlFor={fieldId}>{field.label}</Label>
              {field.kind === "textarea" ? (
                <Textarea key={inputKey} {...common} rows={3} />
              ) : field.kind === "select" ? (
                <select
                  key={inputKey}
                  {...common}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input key={inputKey} {...common} type={field.kind === "number" ? "number" : "text"} min={field.min} max={field.max} step={field.step} />
              )}
              {fieldErrors && (
                <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
                  {fieldErrors.join(" ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
