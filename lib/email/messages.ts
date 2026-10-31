// Copy for transactional emails (SD-306). Emails are not site UI, so they keep
// their own es/en strings here instead of the public-site dictionaries/.
// `{name}`-style placeholders are filled by format() (lib/domain/format.ts).
export type EmailLang = "es" | "en";
export const emailLangs = ["es", "en"] as const satisfies readonly EmailLang[];

export const emailMessages = {
  es: {
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
  },
  en: {
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
  },
} as const satisfies Record<EmailLang, unknown>;
