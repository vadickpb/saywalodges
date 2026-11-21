"use client";

import { useState } from "react";
import { CalendarDays, Search, Users } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { addDays } from "@/lib/domain/dates";
import { format } from "@/lib/domain/format";

// The availability bar that overlaps the bottom of the hero (SD-1134). A plain GET to the public quote page, which already
// understands checkIn / checkOut (and now guests) and validates them again on the server: the bar only saves the guest from
// typing the dates twice. Without JavaScript it still submits.
export function HeroSearch({ dict, lang, today, maxGuests }: { dict: Dict["search"]; lang: string; today: string; maxGuests: number }) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const guestOptions = Array.from({ length: Math.min(Math.max(maxGuests, 1), 40) }, (_, i) => i + 1);
  const field = "flex min-w-0 flex-1 items-center gap-3 px-4 py-3 sm:px-5";
  const input = "w-full min-w-0 bg-transparent text-[15px] text-site-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent";

  return (
    <form id="reservar" role="search" method="get" action={`/${lang}/cotizar`} aria-label={dict.label}
      className="scroll-mt-28 flex flex-col divide-y divide-site-line overflow-hidden rounded-2xl border border-site-line bg-site-bg shadow-xl lg:flex-row lg:items-center lg:divide-x lg:divide-y-0 lg:pr-3">
      <label className={field}>
        <CalendarDays className="size-5 shrink-0 text-site-primary" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{dict.arrival}</span>
          <input type="date" name="checkIn" required min={today} value={checkIn} className={input}
            onChange={(e) => { setCheckIn(e.target.value); if (checkOut && e.target.value && checkOut <= e.target.value) setCheckOut(""); }} />
        </span>
      </label>
      <label className={field}>
        <CalendarDays className="size-5 shrink-0 text-site-primary" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{dict.departure}</span>
          <input type="date" name="checkOut" required min={checkIn ? addDays(checkIn, 1) : addDays(today, 1)} value={checkOut} className={input} onChange={(e) => setCheckOut(e.target.value)} />
        </span>
      </label>
      <label className={field}>
        <Users className="size-5 shrink-0 text-site-primary" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{dict.guests}</span>
          <select name="guests" defaultValue="2" className={input}>
            {guestOptions.map((n) => <option key={n} value={n}>{n === 1 ? dict.oneGuest : format(dict.manyGuests, { count: n })}</option>)}
          </select>
        </span>
      </label>
      <div className="p-3 lg:p-0 lg:pl-3">
        <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-site bg-site-primary px-6 text-sm font-semibold tracking-wide text-site-primary-fg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent lg:w-auto">
          <Search className="size-4" aria-hidden="true" />
          {dict.submit}
        </button>
      </div>
    </form>
  );
}
