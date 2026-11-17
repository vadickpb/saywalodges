const es = {
  a11y: { skip: "Saltar al contenido", home: "HostStay, inicio", primaryNav: "Navegación principal" },
  nav: { features: "Funciones", how: "Cómo funciona", faq: "Preguntas", quote: "Solicitar proforma", quoteShort: "Proforma" },
  hero: {
    eyebrow: "Software para anfitriones",
    title: "HostStay: todo tu negocio de alquileres vacacionales, en un solo lugar",
    description: "Simplifica la administración de tus alojamientos con una plataforma diseñada para anfitriones.",
    demo: "Probar demo", quote: "Solicitar proforma", previewLabel: "Vista previa del panel de HostStay",
    calendar: "Calendario", bookings: "Reservas", income: "Ingresos", overview: "Vista general",
    upToDate: "Todo al día", direct: "Directa", airbnb: "Airbnb", weekdays: ["L", "M", "M", "J", "V", "S", "D"],
  },
  trust: {
    title: "Hecho por anfitriones, para anfitriones",
    items: ["Sin comisión extra por reserva directa", "Tu web, con tu propio dominio", "Tus datos siempre son tuyos"],
  },
  features: {
    eyebrow: "Funciones conectadas",
    title: "Un software para anfitriones que ordena toda tu operación",
    description: "Deja de saltar entre hojas de cálculo, mensajes y calendarios. HostStay reúne lo esencial para trabajar con claridad.",
    items: [
      { key: "properties", title: "Gestiona tus propiedades y huéspedes", description: "Mantén la información de tus alojamientos y cada estadía organizada en un mismo espacio." },
      { key: "calendar", title: "Organiza reservas y disponibilidad", description: "Consulta fechas, bloqueos y reservas desde un calendario claro para todo tu equipo." },
      { key: "finance", title: "Controla ingresos y gastos", description: "Registra los movimientos de tu operación y entiende mejor cómo avanza tu negocio." },
      { key: "website", title: "Tu propia web con dominio personalizado", description: "Presenta tus alojamientos bajo tu marca y abre un canal directo para recibir consultas." },
      { key: "channels", title: "Centraliza tus canales de reserva", description: "Conecta Airbnb y otros canales mediante calendario para mantener la disponibilidad alineada." },
    ],
  },
  control: {
    eyebrow: "Más autonomía", title: "De depender de plataformas a tener el control",
    description: "Las plataformas pueden ser un canal útil. HostStay te ayuda a construir también un canal propio y una operación que te pertenece.",
    beforeTitle: "Cuando todo depende de terceros",
    before: ["Tu marca queda en segundo plano", "La información vive en herramientas separadas", "Cada canal exige revisar su propio calendario"],
    afterTitle: "Cuando gestionas con HostStay",
    after: ["Tu marca y tu dominio están al frente", "Reservas, huéspedes y finanzas se organizan juntos", "Tu calendario sincronizado con Airbnb reduce tareas repetidas"],
  },
  how: {
    eyebrow: "Cómo funciona", title: "Un sistema de reservas para Airbnb que se adapta a tu forma de trabajar",
    description: "Te acompañamos en la puesta en marcha para que puedas empezar con orden y sin conocimientos técnicos.",
    steps: [
      { title: "Configuramos tu espacio", description: "Preparamos HostStay con tus alojamientos, tu identidad y la información que necesitas gestionar." },
      { title: "Conectamos tu calendario", description: "Integramos tu calendario sincronizado con Airbnb para centralizar la disponibilidad." },
      { title: "Tomas el control", description: "Administras reservas, huéspedes, operación y canal directo desde un solo lugar." },
    ],
  },
  demo: { eyebrow: "Conócelo por dentro", title: "Explora HostStay a tu ritmo", description: "Recorre una demostración del panel y descubre cómo se siente gestionar tu operación desde un espacio claro.", action: "Probar demo" },
  faq: {
    eyebrow: "Preguntas frecuentes", title: "Lo esencial antes de empezar con HostStay",
    items: [
      { question: "¿Necesito conocimientos técnicos?", answer: "No. Configuramos tu espacio y te acompañamos para que puedas administrar tus alojamientos con una interfaz clara." },
      { question: "¿Funciona con Airbnb?", answer: "Sí. HostStay puede sincronizar disponibilidad con Airbnb mediante calendario para que centralices tus canales de reserva." },
      { question: "¿Mi web tendrá mi dominio?", answer: "Sí. Puedes usar un dominio propio para que tus huéspedes encuentren una web alineada con tu marca." },
      { question: "¿Mis datos son míos?", answer: "Sí. La información de tu operación te pertenece y puedes solicitar una exportación de tus datos." },
      { question: "¿Cómo se paga?", answer: "Se cotiza según tu caso: solicita tu proforma para recibir una propuesta adaptada a tu operación." },
      { question: "¿Hay soporte?", answer: "Sí. Te acompañamos durante la configuración y contamos con soporte para ayudarte en el uso de la plataforma." },
    ],
  },
  contact: {
    eyebrow: "Da el siguiente paso", title: "Tu negocio, tu marca, tus reservas.",
    description: "Cuéntanos cómo administras tus alojamientos y prepararemos una proforma para tu caso.",
    quote: "Solicitar proforma", whatsapp: "Escribir por WhatsApp", email: "Enviar un correo",
    whatsappAria: "Escribir por WhatsApp para solicitar una proforma de HostStay", mailSubject: "Solicitud de proforma de HostStay",
    whatsappMessage: "Hola, quiero solicitar una proforma de HostStay para mis alojamientos.",
  },
  footer: {
    tagline: "Todo tu negocio de alquileres vacacionales, en un solo lugar.",
    closing: "HostStay — Tecnología para anfitriones que quieren crecer.", navigation: "Navegación del pie",
    rights: "Todos los derechos reservados.",
  },
} as const;

const en = {
  a11y: { skip: "Skip to content", home: "HostStay, home", primaryNav: "Main navigation" },
  nav: { features: "Features", how: "How it works", faq: "Questions", quote: "Request a proposal", quoteShort: "Proposal" },
  hero: {
    eyebrow: "Software for hosts", title: "HostStay: your entire vacation rental business, all in one place",
    description: "Simplify property management with a platform designed for hosts.", demo: "Try the demo",
    quote: "Request a proposal", previewLabel: "HostStay dashboard preview", calendar: "Calendar", bookings: "Bookings",
    income: "Income", overview: "Overview", upToDate: "Everything up to date", direct: "Direct", airbnb: "Airbnb", weekdays: ["M", "T", "W", "T", "F", "S", "S"],
  },
  trust: { title: "Built by hosts, for hosts", items: ["No extra commission on direct bookings", "Your website, on your own domain", "Your data always belongs to you"] },
  features: {
    eyebrow: "Connected features", title: "Host software that brings your whole operation together",
    description: "Stop jumping between spreadsheets, messages, and calendars. HostStay brings the essentials into one clear workspace.",
    items: [
      { key: "properties", title: "Manage properties and guests", description: "Keep your properties and every stay organized in a single workspace." },
      { key: "calendar", title: "Organize bookings and availability", description: "Review dates, blocks, and bookings in a clear calendar for your whole team." },
      { key: "finance", title: "Track income and expenses", description: "Record operational movements and understand how your business is progressing." },
      { key: "website", title: "Your own website and custom domain", description: "Showcase your properties under your brand and open a direct inquiry channel." },
      { key: "channels", title: "Centralize booking channels", description: "Connect Airbnb and other channels by calendar to keep availability aligned." },
    ],
  },
  control: {
    eyebrow: "More independence", title: "From relying on platforms to taking control",
    description: "Platforms can be a useful channel. HostStay also helps you build a channel and an operation of your own.",
    beforeTitle: "When everything depends on third parties", before: ["Your brand stays in the background", "Information lives across separate tools", "Every channel requires its own calendar checks"],
    afterTitle: "When you manage with HostStay", after: ["Your brand and domain come first", "Bookings, guests, and finances stay organized together", "Your Airbnb-synced calendar reduces repetitive work"],
  },
  how: {
    eyebrow: "How it works", title: "An Airbnb booking system that fits the way you work",
    description: "We guide your setup so you can get organized without technical knowledge.",
    steps: [
      { title: "We configure your space", description: "We prepare HostStay with your properties, identity, and the information you need to manage." },
      { title: "We connect your calendar", description: "We integrate your Airbnb-synced calendar to centralize availability." },
      { title: "You take control", description: "Manage bookings, guests, operations, and your direct channel in one place." },
    ],
  },
  demo: { eyebrow: "See it from the inside", title: "Explore HostStay at your own pace", description: "Walk through a dashboard demo and see what it feels like to manage your operation from a clear workspace.", action: "Try the demo" },
  faq: {
    eyebrow: "Frequently asked questions", title: "What to know before getting started with HostStay",
    items: [
      { question: "Do I need technical knowledge?", answer: "No. We configure your workspace and guide you so you can manage your properties through a clear interface." },
      { question: "Does it work with Airbnb?", answer: "Yes. HostStay can sync availability with Airbnb by calendar so you can centralize booking channels." },
      { question: "Will my website use my domain?", answer: "Yes. You can use your own domain so guests find a website that matches your brand." },
      { question: "Do I own my data?", answer: "Yes. Your operational information belongs to you, and you can request an export of your data." },
      { question: "How is it priced?", answer: "It is quoted for your needs. Request a proposal tailored to your operation." },
      { question: "Is support included?", answer: "Yes. We guide you through setup and provide support to help you use the platform." },
    ],
  },
  contact: {
    eyebrow: "Take the next step", title: "Your business, your brand, your bookings.",
    description: "Tell us how you manage your properties and we will prepare a proposal for your needs.",
    quote: "Request a proposal", whatsapp: "Message us on WhatsApp", email: "Send an email",
    whatsappAria: "Message us on WhatsApp to request a HostStay proposal", mailSubject: "HostStay proposal request",
    whatsappMessage: "Hello, I would like a HostStay proposal for my properties.",
  },
  footer: {
    tagline: "Your entire vacation rental business, all in one place.", closing: "HostStay — Technology for hosts who want to grow.",
    navigation: "Footer navigation", rights: "All rights reserved.",
  },
} as const;

export const vendorDictionaries = { es, en } as const;
