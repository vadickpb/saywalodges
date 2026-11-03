// Display helpers for the bookings screens (SD-406). Pure.
const dateFmt = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" });
const stampFmt = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });

/** A civil date (YYYY-MM-DD, no time zone) as shown to the owner. */
export const showDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));
/** An instant, in Lima time. */
export const showStamp = (iso: string) => stampFmt.format(new Date(iso));

export const nightsBetween = (checkIn: string, checkOut: string) =>
  Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
