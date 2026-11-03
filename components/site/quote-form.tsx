"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { Dict } from "@/dictionaries/en";
import { submitPublicQuote } from "@/app/sites/[host]/[lang]/cotizar/actions";
import { clampQuoteGuests, quoteErrorText, quoteGuestLimit, type QuoteUnit } from "@/lib/domain/public-quote-form";
import { buttonStyles } from "./ui";

const controlStyles = "min-h-12 w-full min-w-0 rounded-site border border-site-muted bg-site-bg px-3 py-2 text-site-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent aria-invalid:border-site-fg disabled:opacity-60";

export function QuoteForm({ lang, t, units, contactUrl, today }: {
  lang: string; t: Dict["publicQuote"]; units: QuoteUnit[]; contactUrl: string; today: string;
}) {
  const [state, action, pending] = useActionState(submitPublicQuote.bind(null, lang), {});
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : "");
  const [guests, setGuests] = useState(1);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const maxGuests = quoteGuestLimit(units, unitId);
  const errorText = quoteErrorText(state, t);
  useEffect(() => {
    if (!state.error) return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid ?? errorRef.current)?.focus();
  }, [state]);

  function fieldProps(field: "unitId" | "checkIn" | "checkOut" | "guests") {
    return {
      id: field, name: field, required: true,
      "aria-invalid": !!state.fields?.[field],
      "aria-describedby": state.fields?.[field] ? `${field}-error` : undefined,
      className: controlStyles,
    };
  }
  function fieldError(field: "unitId" | "checkIn" | "checkOut" | "guests") {
    return state.fields?.[field] && <p id={`${field}-error`} className="text-sm font-medium">{t.fieldErrors[field]}</p>;
  }

  return (
    <form ref={formRef} action={action} noValidate aria-busy={pending} className="space-y-6">
      <div className="min-h-16" aria-live="polite">
        {errorText && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-site border border-site-line bg-site-surface p-4 focus-visible:outline-2 focus-visible:outline-site-accent">
          <p>{errorText}</p>
          {state.error === "contact" && <a href={contactUrl} className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{t.contactLink}</a>}
        </div>}
      </div>
      <fieldset disabled={pending} className="grid min-w-0 gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="unitId" className="block font-semibold">{t.unitId}</label>
          <select {...fieldProps("unitId")} value={unitId} onChange={event => {
            const nextUnit = event.target.value;
            setUnitId(nextUnit);
            setGuests(current => clampQuoteGuests(current, quoteGuestLimit(units, nextUnit)));
          }}>
            <option value="" disabled>{t.chooseUnit}</option>
            {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
          {fieldError("unitId")}
        </div>
        <div className="min-w-0 space-y-2">
          <label htmlFor="checkIn" className="block font-semibold">{t.checkIn}</label>
          <input {...fieldProps("checkIn")} type="date" min={today} value={checkIn} onChange={event => setCheckIn(event.target.value)} />
          {fieldError("checkIn")}
        </div>
        <div className="min-w-0 space-y-2">
          <label htmlFor="checkOut" className="block font-semibold">{t.checkOut}</label>
          <input {...fieldProps("checkOut")} type="date" min={checkIn || today} value={checkOut} onChange={event => setCheckOut(event.target.value)} />
          {fieldError("checkOut")}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="guests" className="block font-semibold">{t.guests}</label>
          <select {...fieldProps("guests")} disabled={!maxGuests} value={maxGuests ? guests : ""} onChange={event => setGuests(Number(event.target.value))}>
            {!maxGuests && <option value="">{t.chooseUnit}</option>}
            {Array.from({ length: maxGuests }, (_, i) => i + 1).map(count => <option key={count} value={count}>{count}</option>)}
          </select>
          {fieldError("guests")}
        </div>
      </fieldset>
      <p id="quote-price-note" className="text-sm leading-relaxed text-site-muted">{t.priceNote}</p>
      <button type="submit" disabled={pending} aria-describedby="quote-price-note" className={`${buttonStyles.primary} w-full disabled:cursor-wait disabled:opacity-60`}>
        {pending ? t.pending : t.submit}
      </button>
    </form>
  );
}
