"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { Dict } from "@/dictionaries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitCheckout } from "@/app/sites/[host]/[lang]/reservar/[token]/actions";

export function CheckoutForm({ token, lang, t }: { token: string; lang: string; t: Dict["checkout"] }) {
  const [state, action, pending] = useActionState(submitCheckout.bind(null, lang), {});
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);
  const [values, setValues] = useState({ name: "", email: "", phone: "" });
  const [accepted, setAccepted] = useState(false);
  const fields = state.fields;
  return (
    <form action={action} noValidate className="flex flex-col gap-5" aria-busy={pending}>
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
          {fields?.[field] && <p id={`${field}-error`} className="text-sm text-destructive">{t.fieldError}</p>}
        </div>
      ))}
      <div>
        <label className="flex items-start gap-3" htmlFor="terms">
          <input className="mt-1 size-5 shrink-0" id="terms" name="terms" type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)}
            aria-invalid={!!fields?.terms} aria-describedby={fields?.terms ? "terms-error" : undefined} />
          <span>{t.terms}</span>
        </label>
        {fields?.terms && <p id="terms-error" className="text-sm text-destructive">{t.fieldError}</p>}
      </div>
      <Button type="submit" size="lg" disabled={pending}>{pending ? t.pending : t.submit}</Button>
    </form>
  );
}
