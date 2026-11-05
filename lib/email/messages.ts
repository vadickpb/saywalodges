// Copy for transactional emails (SD-306). Emails are not site UI, so they keep
// their own es/en strings here instead of the public-site dictionaries/.
// `{name}`-style placeholders are filled by format() (lib/domain/format.ts).
export type EmailLang = "es" | "en";
export const emailLangs = ["es", "en"] as const satisfies readonly EmailLang[];

export const emailMessages = {
  es: {
    booking: {
      received: "Recibimos tu reserva", confirmed: "Tu reserva está confirmada", rejected: "Tu pago fue rechazado",
      arrival: "Instrucciones para tu llegada", owner_booking: "Nueva reserva recibida", owner_voucher: "Comprobante recibido",
      stay: "Alojamiento: {unit}. Llegada: {checkIn}. Salida: {checkOut}.",
      receivedBody: "Recibimos tu solicitud. Si todavía está pendiente de pago, completa el pago dentro del plazo indicado al reservar para conservar las fechas.",
      confirmedBody: "Tu pago fue aprobado y las fechas están confirmadas.",
      rejectedBody: "No se pudo aprobar el comprobante. Revisa tu reserva y envía un nuevo comprobante o comunícate con el alojamiento.",
      owner_bookingBody: "Revisa la nueva reserva en el panel de reservas.",
      owner_voucherBody: "Se recibió un comprobante para esta reserva. Revisa el archivo y verifica el pago en tu cuenta antes de aprobarlo en el panel.",
    },

    channels: { airbnb: "Airbnb", booking: "Booking.com", vrbo: "Vrbo", other: "otro canal" },
    footer: "Enviado por {brand}. Si no esperabas este correo, puedes ignorarlo.",
    poweredBy: "Con tecnología de Saywa Direct.",
    test: {
      subject: "Correo de prueba · {brand}",
      preheader: "La configuración de correo funciona.",
      heading: "Correo de prueba",
      greeting: "Hola {name},",
      greetingAnonymous: "Hola,",
      body: "Si lees esto, el envío transaccional de {brand} está configurado correctamente (dominio verificado y clave de Resend).",
      note: "Este mensaje no contiene datos de ninguna reserva.",
    },
    icalConflict: {
      subject: "Conflicto nuevo en tu calendario iCal · {brand}",
      preheader: "Un calendario importado choca con fechas ya ocupadas.",
      heading: "Conflicto nuevo en el calendario",
      greeting: "Hola,",
      bodyOne: "La sincronización con {channel} detectó 1 evento nuevo que choca con fechas ya ocupadas de {unit}.",
      bodyMany: "La sincronización con {channel} detectó {count} eventos nuevos que chocan con fechas ya ocupadas de {unit}.",
      note: "No se creó ningún bloqueo para evitar una doble reserva. Revisa las fechas y resuélvelo en tu panel.",
      cta: "Ver conflictos",
    },
    icalFeedDown: {
      subject: "Un calendario iCal lleva más de 24 horas sin sincronizar · {brand}",
      preheader: "No pudimos leer el calendario importado.",
      heading: "Calendario sin sincronizar",
      greeting: "Hola,",
      body: "No pudimos sincronizar el calendario de {channel} de {unit} desde hace más de 24 horas.",
      note: "Mientras tanto la disponibilidad puede estar desactualizada y se podrían producir dobles reservas. Revisa el enlace de importación en tu panel.",
      cta: "Revisar calendarios",
    },
  },
  en: {
    booking: {
      received: "We received your booking", confirmed: "Your booking is confirmed", rejected: "Your payment was rejected",
      arrival: "Arrival instructions", owner_booking: "New booking received", owner_voucher: "Payment voucher received",
      stay: "Accommodation: {unit}. Check-in: {checkIn}. Check-out: {checkOut}.",
      receivedBody: "We received your request. If payment is still pending, complete payment before the deadline shown at checkout to keep your dates.",
      confirmedBody: "Your payment was approved and your dates are confirmed.",
      rejectedBody: "We could not approve your voucher. Review your booking and submit a new voucher or contact the accommodation.",
      owner_bookingBody: "Review the new booking in your bookings dashboard.",
      owner_voucherBody: "A payment voucher was submitted for this booking. Review the file and verify the payment in your account before approving it in the dashboard.",
    },

    channels: { airbnb: "Airbnb", booking: "Booking.com", vrbo: "Vrbo", other: "another channel" },
    footer: "Sent by {brand}. If you weren't expecting this email, you can ignore it.",
    poweredBy: "Powered by Saywa Direct.",
    test: {
      subject: "Test email · {brand}",
      preheader: "Your email setup works.",
      heading: "Test email",
      greeting: "Hi {name},",
      greetingAnonymous: "Hi,",
      body: "If you are reading this, {brand} transactional email is set up correctly (verified domain and Resend key).",
      note: "This message does not contain any booking data.",
    },
    icalConflict: {
      subject: "New iCal calendar conflict · {brand}",
      preheader: "An imported calendar clashes with dates that are already taken.",
      heading: "New calendar conflict",
      greeting: "Hi,",
      bodyOne: "The {channel} sync found 1 new event that clashes with dates already taken for {unit}.",
      bodyMany: "The {channel} sync found {count} new events that clash with dates already taken for {unit}.",
      note: "No block was created, to avoid a double booking. Review the dates and resolve it in your dashboard.",
      cta: "View conflicts",
    },
    icalFeedDown: {
      subject: "An iCal calendar has not synced for over 24 hours · {brand}",
      preheader: "We could not read the imported calendar.",
      heading: "Calendar not syncing",
      greeting: "Hi,",
      body: "We have not been able to sync the {channel} calendar for {unit} for more than 24 hours.",
      note: "Availability may be out of date meanwhile and double bookings could happen. Check the import link in your dashboard.",
      cta: "Review calendars",
    },
  },
} as const satisfies Record<EmailLang, unknown>;
