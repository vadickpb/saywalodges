const es = {
  nav: { how: "Cómo funciona", modules: "Módulos", contact: "Contacto" },
  hero: {
    eyebrow: "Solución integral para anfitriones",
    title: "Tu alojamiento, tu marca, tus reservas.",
    description:
      "Reúne tu web propia, reservas directas y un calendario sincronizado con Airbnb en un sistema preparado para crecer contigo.",
    demo: "Probar demo",
    quote: "Solicitar proforma",
    whatsapp: "Hablar por WhatsApp",
    previewLabel: "Todo en un solo lugar",
    directBooking: "Reserva directa",
    airbnb: "Airbnb",
    available: "Calendario disponible",
  },
  how: {
    eyebrow: "De la dependencia al control",
    title: "Empieza a recibir reservas directas sin complicarte",
    description: "Te acompañamos desde la configuración hasta la puesta en marcha.",
    steps: [
      { title: "Configuramos tu espacio", description: "Adaptamos la web y el sistema a tu alojamiento, contenido y forma de trabajar." },
      { title: "Conectamos tu calendario", description: "Sincroniza la disponibilidad con Airbnb para ordenar tus canales desde un solo lugar." },
      { title: "Tomas el control", description: "Gestiona consultas, reservas, huéspedes y operación diaria desde un panel claro." },
    ],
  },
  modules: {
    eyebrow: "Una base completa",
    title: "Las herramientas que tu alojamiento necesita",
    description: "Activa los módulos que encajan con tu operación y mantén todo conectado.",
    items: [
      { key: "web", title: "Web propia", description: "Presenta tu alojamiento con identidad propia y un canal directo de consulta." },
      { key: "calendar", title: "Calendario", description: "Visualiza disponibilidad y mantén tus fechas sincronizadas con Airbnb." },
      { key: "bookings", title: "Reservas", description: "Organiza cotizaciones, adelantos, huéspedes y estados de cada estadía." },
      { key: "finance", title: "Finanzas", description: "Centraliza ingresos, gastos y reportes para entender mejor tu operación." },
      { key: "guide", title: "Guía del huésped", description: "Comparte información útil y privada antes y durante la estadía." },
      { key: "whatsapp", title: "WhatsApp", description: "Prepara una comunicación más ordenada con huéspedes y prospectos." },
    ],
  },
  contact: {
    eyebrow: "Hablemos de tu alojamiento",
    title: "Una solución adaptada a tu forma de recibir huéspedes",
    description: "Cuéntanos qué administras y qué quieres mejorar. Prepararemos una proforma para tu caso.",
    quote: "Solicitar proforma",
    whatsapp: "Escribir por WhatsApp",
    mailSubject: "Solicitud de proforma",
    whatsappMessage: "Hola, quiero solicitar una proforma de {product} para mi alojamiento.",
  },
  footer: "Solución integral para anfitriones",
} as const;

const en = {
  nav: { how: "How it works", modules: "Modules", contact: "Contact" },
  hero: {
    eyebrow: "All-in-one solution for hosts",
    title: "Your property, your brand, your bookings.",
    description:
      "Bring your own website, direct bookings, and an Airbnb-synced calendar together in a system built to grow with you.",
    demo: "Try the demo",
    quote: "Request a proposal",
    whatsapp: "Chat on WhatsApp",
    previewLabel: "Everything in one place",
    directBooking: "Direct booking",
    airbnb: "Airbnb",
    available: "Calendar available",
  },
  how: {
    eyebrow: "From dependency to control",
    title: "Start receiving direct bookings without the complexity",
    description: "We support you from configuration through launch.",
    steps: [
      { title: "We configure your space", description: "We adapt the website and system to your property, content, and workflow." },
      { title: "We connect your calendar", description: "Sync availability with Airbnb and keep your channels organized in one place." },
      { title: "You take control", description: "Manage inquiries, bookings, guests, and daily operations from a clear dashboard." },
    ],
  },
  modules: {
    eyebrow: "A complete foundation",
    title: "The tools your property needs",
    description: "Enable the modules that fit your operation while keeping everything connected.",
    items: [
      { key: "web", title: "Your own website", description: "Present your property under your own brand with a direct inquiry channel." },
      { key: "calendar", title: "Calendar", description: "See availability and keep dates synchronized with Airbnb." },
      { key: "bookings", title: "Bookings", description: "Organize quotes, deposits, guests, and every stay's status." },
      { key: "finance", title: "Finance", description: "Centralize income, expenses, and reports to understand your operation." },
      { key: "guide", title: "Guest guide", description: "Share useful, private information before and during each stay." },
      { key: "whatsapp", title: "WhatsApp", description: "Prepare more organized communication with guests and prospects." },
    ],
  },
  contact: {
    eyebrow: "Let's talk about your property",
    title: "A solution adapted to the way you host",
    description: "Tell us what you manage and what you want to improve. We'll prepare a proposal for your needs.",
    quote: "Request a proposal",
    whatsapp: "Message us on WhatsApp",
    mailSubject: "Proposal request",
    whatsappMessage: "Hello, I would like a {product} proposal for my property.",
  },
  footer: "All-in-one solution for hosts",
} as const;

export const vendorDictionaries = { es, en } as const;
