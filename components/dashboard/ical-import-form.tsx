"use client";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/app/site/_lib/form-state";

export function IcalImportForm({
  id,
  url,
  action,
}: {
  id: string;
  url: string | null;
  action: (prev: FormState, data: FormData) => Promise<FormState>;
}) {
  const [state, submit, pending] = useActionState(action, { ok: false });
  const inputId = useId();
  return (
    <form action={submit} className="flex flex-wrap gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={inputId} className="w-full text-sm">
        Enlace de importación del canal (secreto)
      </label>
      <input
        id={inputId}
        name="url"
        type="url"
        maxLength={2000}
        defaultValue={url ?? ""}
        placeholder="https://…"
        className="h-9 min-w-0 flex-1 rounded-md border px-3 text-sm"
      />
      <Button disabled={pending} type="submit">
        {pending ? "Guardando…" : "Guardar enlace"}
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        Pega el enlace de exportación del canal. Vacío desactiva la importación;
        conserva los bloqueos hasta eliminar el feed o sincronizar otro enlace.
      </p>
      {state.formError && (
        <p role="alert" className="w-full text-sm text-destructive">
          {state.formError}
        </p>
      )}
      {state.ok && (
        <p role="status" className="w-full text-sm">
          Enlace guardado
        </p>
      )}
    </form>
  );
}
