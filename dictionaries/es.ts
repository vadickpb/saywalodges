import type { Dict } from "./en";

const es: Dict = {
  nav: {
    about: "Sobre Nosotros",
    gallery: "Galería",
    rates: "Tarifas",
    location: "Ubicación",
    bookNow: "Reservar",
  },
  hero: {
    label: "Valle Sagrado · Cusco · Perú",
    title: "Tu santuario privado",
    titleItalic: "en el Valle Sagrado",
    subtitle: "Urubamba · Cusco · Perú",
    whatsapp: "Reservar por WhatsApp",
    viewGallery: "Ver Galería",
  },
  amenities: {
    label: "Lo que incluye",
    title: "Una experiencia",
    titleItalic: "completamente privada",
    items: [
      {
        title: "Piscina Privada",
        description: "Piscina exclusiva con vistas panorámicas al Valle Sagrado.",
      },
      {
        title: "Cocina Completa",
        description: "Cocina equipada con todo lo necesario para preparar tus comidas.",
      },
      {
        title: "Vistas a Montañas",
        description: "Paisajes andinos imponentes desde cada rincón del lodge.",
      },
      {
        title: "Lodge Privado",
        description: "Propiedad exclusiva. Solo para ti y tus acompañantes.",
      },
      {
        title: "Valle Sagrado",
        description: "En el corazón del Valle Sagrado de los Incas, Urubamba.",
      },
      {
        title: "Cerca Machu Picchu",
        description: "A 1.5 horas de la ciudadela más famosa del mundo.",
      },
    ],
  },
  gallery: {
    label: "Galería",
    title: "El espacio que",
    titleItalic: "te espera",
    cta: "¿Te interesa? Escríbenos",
  },
  rates: {
    label: "Tarifas",
    title: "Elige tu",
    titleItalic: "experiencia",
    note: "Mínimo 2 noches. Precios en USD por noche, impuestos incluidos.",
    bottomNote: "¿Grupo grande o estancia prolongada? Contáctanos para tarifas especiales.",
    plans: [
      {
        name: "Standard",
        description: "Temporada baja",
        price: 180,
        period: "noche",
        features: [
          "Lodge privado completo",
          "Piscina exclusiva",
          "Cocina equipada",
          "Hasta 6 personas",
          "WiFi de alta velocidad",
        ],
        cta: "Consultar disponibilidad",
      },
      {
        name: "High Season",
        description: "Temporada alta (Jun–Sep)",
        price: 250,
        period: "noche",
        features: [
          "Lodge privado completo",
          "Piscina exclusiva",
          "Cocina equipada",
          "Hasta 6 personas",
          "WiFi de alta velocidad",
          "Check-in flexible",
        ],
        cta: "Reservar ahora",
      },
      {
        name: "Full Lodge",
        description: "Experiencia premium",
        price: 380,
        period: "noche",
        features: [
          "Lodge privado completo",
          "Piscina exclusiva",
          "Cocina equipada",
          "Hasta 10 personas",
          "WiFi de alta velocidad",
          "Check-in flexible",
          "Tour Valle Sagrado incluido",
        ],
        cta: "Consultar disponibilidad",
      },
    ],
  },
  location: {
    label: "Ubicación",
    title: "En el corazón del",
    titleItalic: "Valle Sagrado",
    description:
      "Saywa Lodges se encuentra en Urubamba, a 2,800 msnm, rodeado de montañas andinas y a orillas del río sagrado. Una ubicación privilegiada que te conecta con los principales destinos arqueológicos e históricos del Valle Sagrado de los Incas.",
    mapsLink: "Ver en Google Maps",
    altitude: "2,800 msnm",
    distances: [
      { place: "Ollantaytambo", time: "45 min", icon: "🚗" },
      { place: "Cusco", time: "2 horas", icon: "🚗" },
      { place: "Machu Picchu", time: "1.5 horas", icon: "🚂" },
      { place: "Pisac & Mercado", time: "25 min", icon: "🚗" },
      { place: "Río Urubamba", time: "5 min", icon: "🚶" },
      { place: "Moray & Salineras", time: "30 min", icon: "🚗" },
    ],
  },
  footer: {
    tagline: "Lodge vacacional privado en Urubamba,\nValle Sagrado de los Incas, Cusco, Perú.",
    ctaTitle: "¿Listo para tu escapada andina?",
    ctaDesc:
      "Escríbenos por WhatsApp y te respondemos en menos de 2 horas con disponibilidad y detalles de tu estadía.",
    ctaBtn: "Escribir por WhatsApp",
    exploreLabel: "Explorar",
    contactLabel: "Contacto",
    explore: [
      { label: "Sobre el Lodge", href: "#amenities" },
      { label: "Galería", href: "#gallery" },
      { label: "Tarifas", href: "#rates" },
      { label: "Ubicación", href: "#location" },
    ],
    copyright: "Saywa Lodges. Urubamba, Cusco, Perú.",
    altitude: "Valle Sagrado · 2,800 msnm",
  },
};

export default es;
