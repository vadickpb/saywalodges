import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/dictionaries";
import { getBookingStatus } from "@/lib/dal/public/booking-status";
import { resolveBookingState } from "@/lib/domain/booking-status";
import { format } from "@/lib/domain/format";

// Guest-facing booking status (SD-408). The token in the URL is the capability. Nothing
// personal is rendered: no guest name/email/phone, no payment references. Unknown token,
// another tenant's token and unpublished properties are all the same 404.
export const metadata: Metadata = {
  title: "Booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function BookingStatusPage({
  params,
}: {
  params: Promise<{ host: string; lang: string; public_token: string }>;
}) {
  const { host, lang, public_token: token } = await params;
  if (!hasLocale(lang)) notFound();

  let booking;
  try {
    booking = await getBookingStatus(host, token);
  } catch {
    // Already logged by the DAL; an outage must not look like a valid page.
    notFound();
  }
  if (!booking) notFound();

  const t = (await getDictionary(lang)).bookingStatus;
  const state = resolveBookingState(booking);
  const copy = t.state[state];
  const dateFmt = new Intl.DateTimeFormat(lang === "es" ? "es-PE" : "en-US", { dateStyle: "medium", timeZone: "UTC" });
  const toDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));
  const showHold = state === "awaiting_payment" || state === "voucher_rejected";
  const holdUntil =
    showHold && booking.expires_at
      ? format(t.holdUntil, {
          time: new Intl.DateTimeFormat(lang === "es" ? "es-PE" : "en-US", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "America/Lima",
          }).format(new Date(booking.expires_at)),
        })
      : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-16">
      <p className="text-sm uppercase tracking-wide opacity-70">{booking.property_name}</p>
      <h1 className="text-3xl font-semibold">{t.title}</h1>
      <section aria-live="polite" className="rounded-2xl border p-6">
        <h2 data-state={state} className="text-xl font-semibold">{copy.label}</h2>
        <p className="mt-2">{copy.next}</p>
        {holdUntil && <p className="mt-3 text-sm opacity-80">{holdUntil}</p>}
      </section>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="opacity-70">{t.unit}</dt>
        <dd>{booking.unit_name}</dd>
        <dt className="opacity-70">{t.stay}</dt>
        <dd>{format(t.dates, { checkIn: toDate(booking.check_in), checkOut: toDate(booking.check_out) })}</dd>
        <dd className="col-span-2 opacity-80">{format(t.guests, { count: booking.guests })}</dd>
      </dl>
      <a href={`/${lang}`} className="text-sm underline">{t.backToSite}</a>
    </main>
  );
}
