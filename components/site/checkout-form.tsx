"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { Dict } from "@/dictionaries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitCheckout } from "@/app/sites/[host]/[lang]/reservar/[token]/actions";

export function CheckoutForm({ token, lang, t, contactUrl }: { token: string; lang: string; t: Dict["checkout"]; contactUrl: string }) {
  const [state, action, pending] = useActionState(submitCheckout.bind(null, lang), {});
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error === "validation") {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    } else if (state.error) errorRef.current?.focus();
  }, [state]);
  const [values, setValues] = useState({ name: "", email: "", phone: "" });
  const [accepted, setAccepted] = useState(false);
  const fields = state.fields;
  if (state.error === "linkUnavailable") return (
    <section role="alert" className="space-y-4" ref={errorRef} tabIndex={-1}>
      <h2 className="text-xl font-semibold">{t.unusable}</h2><p>{t.unusableBody}</p>
      <Button asChild variant="outline" size="lg"><a href={contactUrl} referrerPolicy="no-referrer" rel="noreferrer">{t.contact}</a></Button>
    </section>
  );
  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-5" aria-busy={pending}>
      <input type="hidden" name="token" value={token} />
      {state.error && <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg border border-destructive p-4">{t[state.error]}</div>}
      {(["name", "email", "phone"] as const).map(field => (
        <div key={field} className="space-y-2">
          <label htmlFor={field}>{t[field]}</label>
          <Input id={field} name={field} value={values[field]}
            onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
            autoComplete={field === "phone" ? "tel" : field} required={field !== "phone"}
            maxLength={field === "name" ? 200 : field === "email" ? 254 : 30}
            aria-invalid={!!fields?.[field]} aria-describedby={fields?.[field] ? `${field}-error` : undefined} />
          {fields?.[field] && <p id={`${field}-error`} className="text-sm text-destructive">{t.fieldErrors[field]}</p>}
        </div>
      ))}
      <div>
        <label className="flex items-start gap-3" htmlFor="terms">
          <input className="mt-1 size-5 shrink-0" id="terms" name="terms" type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)}
            aria-invalid={!!fields?.terms} aria-describedby={fields?.terms ? "terms-error" : undefined} />
          <span>{t.terms}</span>
        </label>
        {fields?.terms && <p id="terms-error" className="text-sm text-destructive">{t.fieldErrors.terms}</p>}
      </div>
      <Button type="submit" size="lg" disabled={pending}>{pending ? t.pending : t.submit}</Button>
    </form>
  );
}
