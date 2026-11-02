"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { Dict } from "@/dictionaries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import { submitVoucherAction } from "@/app/sites/[host]/[lang]/reserva/[public_token]/actions";
import {
  VOUCHER_BUCKET, buildVoucherPath, checkVoucherFile, voucherMethodSchema, type VoucherMime, type VoucherState,
} from "@/lib/domain/payment-voucher";

type Problem = "fileMissing" | "fileType" | "fileSize" | "uploadFailed";
const FILE_PROBLEM = { missing: "fileMissing", type: "fileType", size: "fileSize" } as const;

// The file goes from the browser straight to the private bucket (it can be bigger than a server action may receive); the
// upload policy only accepts this booking's own folder while it is payable. Then the server registers it: the amount and the
// currency come from the booking, never from this form.
export function VoucherForm({ token, prefix, lang, t }: { token: string; prefix: string; lang: string; t: Dict["bookingStatus"]["payment"] }) {
  const [state, action, pending] = useActionState<VoucherState, FormData>(submitVoucherAction.bind(null, lang), {});
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const busy = pending || uploading;
  const message = problem ? t.errors[problem] : state.error ? t.errors[state.error] : null;
  useEffect(() => {
    if (message) alertRef.current?.focus();
  }, [message]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const picked = file instanceof File ? file : null;
    const invalid = checkVoucherFile(picked);
    if (invalid || !picked) return setProblem(FILE_PROBLEM[invalid ?? "missing"]);
    const method = voucherMethodSchema.safeParse(form.get("method"));
    if (!method.success) return setProblem("fileMissing");
    setProblem(null);
    setUploading(true);
    const path = buildVoucherPath(prefix, crypto.randomUUID(), picked.type as VoucherMime);
    const { error } = await createClient().storage.from(VOUCHER_BUCKET).upload(path, picked, { contentType: picked.type, upsert: false });
    setUploading(false);
    if (error) return setProblem("uploadFailed");
    const submission = new FormData();
    submission.set("token", token);
    submission.set("path", path);
    submission.set("method", method.data);
    submission.set("reference", String(form.get("reference") ?? ""));
    startTransition(() => action(submission));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-busy={busy}>
      <h3 className="text-lg font-semibold">{t.uploadTitle}</h3>
      {message && <div ref={alertRef} role="alert" tabIndex={-1} className="rounded-lg border border-destructive p-4">{message}</div>}
      <fieldset className="space-y-2">
        <legend>{t.method}</legend>
        <div className="flex flex-wrap gap-4">
          {voucherMethodSchema.options.map((m, i) => (
            <label key={m} className="flex items-center gap-2">
              <input type="radio" name="method" value={m} defaultChecked={i === 0} className="size-5" />
              {t.methods[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <label htmlFor="reference">{t.reference}</label>
        <Input id="reference" name="reference" maxLength={200} autoComplete="off" />
      </div>
      <div className="space-y-2">
        <label htmlFor="file">{t.file}</label>
        <Input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required
          aria-invalid={problem === "fileMissing" || problem === "fileType" || problem === "fileSize"} />
      </div>
      <Button type="submit" size="lg" disabled={busy}>{busy ? t.pending : t.submit}</Button>
    </form>
  );
}
