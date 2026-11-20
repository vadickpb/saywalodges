// Templates for the alerts sent to the OWNER's number (SD-1011). Pure. Spanish only (the owner alerts by email are Spanish too).
// The exact bodies are copied into Meta by the owner (docs/whatsapp.md); a test compares them with that document.

export const ownerAlertKinds = ["owner_new_booking", "owner_voucher_uploaded", "owner_calendar_conflict"] as const;
export type OwnerAlertKind = (typeof ownerAlertKinds)[number];

export const OWNER_ALERT_TEMPLATES: Record<OwnerAlertKind, { name: string; body: string; variables: string[]; samples: string[] }> = {
  owner_new_booking: {
    name: "owner_new_booking",
    body: "Nueva reserva pendiente de pago en {{1}}. Llegada: {{2}}. Salida: {{3}}. Revísala en el panel.",
    variables: ["alojamiento", "fecha de llegada", "fecha de salida"],
    samples: ["Casa 1", "21 dic 2026", "24 dic 2026"],
  },
  owner_voucher_uploaded: {
    name: "owner_voucher_uploaded",
    body: "Un huésped subió un comprobante de pago para {{1}} con llegada el {{2}}. Apruébalo o recházalo en el panel.",
    variables: ["alojamiento", "fecha de llegada"],
    samples: ["Casa 1", "21 dic 2026"],
  },
  owner_calendar_conflict: {
    name: "owner_calendar_conflict",
    body: "Se detectó un conflicto de calendario en {{1}}: {{2}} reserva(s) importada(s) chocan con fechas ocupadas. Revísalo en el panel.",
    variables: ["alojamiento", "cantidad de conflictos"],
    samples: ["Casa 1", "1"],
  },
};

const clean = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const day = (iso: string) => new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export const ownerBookingParams = (unit: string, checkIn: string, checkOut: string) => [clean(unit, 80) || "—", day(checkIn), day(checkOut)];
export const ownerVoucherParams = (unit: string, checkIn: string) => [clean(unit, 80) || "—", day(checkIn)];
export const ownerConflictParams = (unit: string | null, count: number) => [clean(unit ?? "", 80) || "tu calendario", String(count)];
