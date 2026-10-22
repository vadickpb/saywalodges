// Generic UI labels for the public site template (SD-209). Nothing here may
// be specific to one lodge — per-tenant copy lives in properties.content
// (lib/domain/site-content.ts). `{name}`-style placeholders are filled by
// format() from lib/domain/format.ts.
const en = {
  nav: {
    gallery: "Gallery",
    spaces: "Spaces",
    rates: "Rates",
    location: "Location",
    faq: "FAQ",
    contact: "Contact",
    book: "Check availability",
    menu: "Open menu",
    closeMenu: "Close menu",
    switchLanguage: "Ver en español",
  },
  hero: {
    whatsapp: "Book on WhatsApp",
    viewPhotos: "See photos",
    guests: "Up to {count} guests",
    bedrooms: "{count} bedrooms",
    bedroom: "1 bedroom",
  },
  intro: {
    label: "The place",
    amenities: "What's included",
  },
  gallery: {
    label: "Gallery",
    title: "Take a look around",
    viewAll: "View all {count} photos",
    close: "Close",
    previous: "Previous photo",
    next: "Next photo",
    position: "Photo {index} of {count}",
    open: "Open photo {index}",
  },
  spaces: {
    label: "Rooms & spaces",
    title: "Where you'll stay",
    sleeps: "Sleeps {count}",
    photos: "{count} photos",
    noPhotos: "Photos coming soon",
    open: "View photos of {name}",
  },
  rates: {
    label: "Rates",
    title: "Seasonal rates",
    note: "Rates vary with your dates, group size and length of stay. Message us for an exact quote.",
    availabilityTitle: "Check your dates",
    availabilityText: "Tell us your dates and group size — we'll reply with availability and your exact rate.",
    availabilityCta: "Ask about availability",
  },
  location: {
    label: "Location",
    title: "Getting here",
    nearby: "Nearby",
    maps: "Open in Google Maps",
  },
  faq: {
    label: "FAQ",
    title: "Good to know",
  },
  contact: {
    label: "Contact",
    title: "Plan your stay",
    text: "Message us on WhatsApp for the fastest reply, or send us an email.",
    whatsapp: "Chat on WhatsApp",
    email: "Send an email",
  },
  footer: {
    explore: "Explore",
    contact: "Contact",
    rights: "All rights reserved.",
    poweredBy: "Direct booking powered by Saywa Direct",
  },
};

export type Dict = typeof en;
export default en;
