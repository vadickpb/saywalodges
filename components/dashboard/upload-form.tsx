"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_UPLOAD_BYTES } from "@/lib/domain/content-manager";

type Props = {
  // Accessible name of the file input (include what it uploads to, e.g. the space).
  inputLabel?: string;
  action: (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  fields?: Record<string, string>;
  label: string;
};

// Image picker + upload. The size check here is only a convenience (it saves
// a round trip); the server action re-validates type by magic bytes and size.
export function UploadForm({ action, fields = {}, label, inputLabel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return setError("Selecciona una imagen.");
    if (file.size > MAX_UPLOAD_BYTES) return setError("La imagen supera los 4 MB.");
    setError(null);
    const formData = new FormData();
    for (const [k, v] of Object.entries(fields)) formData.set(k, v);
    formData.set("file", file);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error); // announced once, by the role="alert" below
        return;
      }
      toast.success("Imagen subida");
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label={inputLabel ?? label} className="sm:max-w-xs" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Subiendo…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
