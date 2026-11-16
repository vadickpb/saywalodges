export const demoCopy = {
  es: {
    login: {
      divider: "o prueba la instalación compartida",
      submit: "Entrar a la demo",
      pending: "Entrando…",
      error: "No pudimos entrar a la demo. Intenta de nuevo.",
    },
    banner: "Demo: los datos se reinician cada noche. Puedes probar con libertad; no uses datos reales.",
    restart: "Ver recorrido",
    tour: {
      label: "Recorrido de la demo",
      step: (current: number, total: number) => `Paso ${current} de ${total}`,
      open: "Abrir esta sección",
      next: "Siguiente",
      finish: "Terminar",
      skip: "Saltar",
      guidePassword: "Contraseña pública de la guía",
      steps: [
        { title: "Calendario", description: "Revisa reservas directas y bloqueos importados de Airbnb a lo largo de doce meses." },
        { title: "Reservas", description: "Abre las reservas confirmadas y conoce a los huéspedes ficticios de cada estadía." },
        { title: "Finanzas", description: "Revisa por mes ingresos, comisiones, limpieza y servicios completamente ficticios." },
        { title: "Sitio público", description: "Mira la experiencia publicada que vería una persona antes de reservar." },
        { title: "Guía de huésped", description: "Abre la guía privada publicada y entra con la contraseña pública que aparece aquí." },
      ],
    },
  },
  en: {
    login: {
      divider: "or try the shared installation",
      submit: "Enter the demo",
      pending: "Entering…",
      error: "We could not enter the demo. Please try again.",
    },
    banner: "Demo: data resets every night. Feel free to explore; do not use real data.",
    restart: "View tour",
    tour: {
      label: "Demo tour",
      step: (current: number, total: number) => `Step ${current} of ${total}`,
      open: "Open this section",
      next: "Next",
      finish: "Finish",
      skip: "Skip",
      guidePassword: "Public guide password",
      steps: [
        { title: "Calendar", description: "Review direct bookings and Airbnb blocks across twelve months." },
        { title: "Bookings", description: "Open confirmed bookings and meet the fictional guests for each stay." },
        { title: "Finances", description: "Review fully fictional income, commissions, cleaning, and utilities month by month." },
        { title: "Public site", description: "See the published experience a guest would browse before booking." },
        { title: "Guest guide", description: "Open the published private guide and enter with the public password shown here." },
      ],
    },
  },
} as const;

export type DemoLocale = keyof typeof demoCopy;

export function demoLocaleFromAcceptLanguage(value: string | null): DemoLocale {
  return value?.trim().toLowerCase().startsWith("en") ? "en" : "es";
}
