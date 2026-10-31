// Copy for transactional emails (SD-306). Emails are not site UI, so they keep
// their own es/en strings here instead of the public-site dictionaries/.
// `{name}`-style placeholders are filled by format() (lib/domain/format.ts).
export type EmailLang = "es" | "en";
export const emailLangs = ["es", "en"] as const satisfies readonly EmailLang[];

export const emailMessages = {
  es: {
    channels: { airbnb: "Airbnb", booking: "Booking.com", vrbo: "Vrbo", other: "otro canal" },
    brand: "Saywa Direct",
    footer: "Enviado por Saywa Direct. Si no esperabas este correo, puedes ignorarlo.",
    test: {
      subject: "Correo de prueba · Saywa Direct",
      preheader: "La configuración de correo funciona.",
      heading: "Correo de prueba",
      greeting: "Hola {name},",
      greetingAnonymous: "Hola,",
      body: "Si lees esto, el envío transaccional de Saywa Direct está configurado correctamente (dominio verificado y clave de Resend).",
      note: "Este mensaje no contiene datos de ninguna reserva.",
    },
    icalConflict: {
      subject: "Conflicto nuevo en tu calendario iCal · Saywa Direct",
      preheader: "Un calendario importado choca con fechas ya ocupadas.",
      heading: "Conflicto nuevo en el calendario",
      greeting: "Hola,",
      bodyOne: "La sincronización con {channel} detectó 1 evento nuevo que choca con fechas ya ocupadas de {unit}.",
      bodyMany: "La sincronización con {channel} detectó {count} eventos nuevos que chocan con fechas ya ocupadas de {unit}.",
      note: "No se creó ningún bloqueo para evitar una doble reserva. Revisa las fechas y resuélvelo en tu panel.",
      cta: "Ver conflictos",
    },
    icalFeedDown: {
      subject: "Un calendario iCal lleva más de 24 horas sin sincronizar · Saywa Direct",
      preheader: "No pudimos leer el calendario importado.",
      heading: "Calendario sin sincronizar",
      greeting: "Hola,",
      body: "No pudimos sincronizar el calendario de {channel} de {unit} desde hace más de 24 horas.",
      note: "Mientras tanto la disponibilidad puede estar desactualizada y se podrían producir dobles reservas. Revisa el enlace de importación en tu panel.",
      cta: "Revisar calendarios",
    },
  },
  en: {
    channels: { airbnb: "Airbnb", booking: "Booking.com", vrbo: "Vrbo", other: "another channel" },
    brand: "Saywa Direct",
    footer: "Sent by Saywa Direct. If you weren't expecting this email, you can ignore it.",
    test: {
      subject: "Test email · Saywa Direct",
      preheader: "Your email setup works.",
      heading: "Test email",
      greeting: "Hi {name},",
      greetingAnonymous: "Hi,",
      body: "If you are reading this, Saywa Direct transactional email is set up correctly (verified domain and Resend key).",
      note: "This message does not contain any booking data.",
    },
    icalConflict: {
      subject: "New iCal calendar conflict · Saywa Direct",
      preheader: "An imported calendar clashes with dates that are already taken.",
      heading: "New calendar conflict",
      greeting: "Hi,",
      bodyOne: "The {channel} sync found 1 new event that clashes with dates already taken for {unit}.",
      bodyMany: "The {channel} sync found {count} new events that clash with dates already taken for {unit}.",
      note: "No block was created, to avoid a double booking. Review the dates and resolve it in your dashboard.",
      cta: "View conflicts",
    },
    icalFeedDown: {
      subject: "An iCal calendar has not synced for over 24 hours · Saywa Direct",
      preheader: "We could not read the imported calendar.",
      heading: "Calendar not syncing",
      greeting: "Hi,",
      body: "We have not been able to sync the {channel} calendar for {unit} for more than 24 hours.",
      note: "Availability may be out of date meanwhile and double bookings could happen. Check the import link in your dashboard.",
      cta: "Review calendars",
    },
  },
} as const satisfies Record<EmailLang, unknown>;
