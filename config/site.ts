export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://saywalodges.com";

export const WHATSAPP_NUMBER = "51963416766";
export const WHATSAPP_MESSAGE_EN =
  "Hi! I'm interested in booking Saywa Lodges in Valle Sagrado, Urubamba. Could you please share availability and rates?";
export const WHATSAPP_MESSAGE_ES =
  "Hola! Me interesa reservar en Saywa Lodges en el Valle Sagrado, Urubamba. ¿Podrían compartirme disponibilidad y tarifas?";
export const WHATSAPP_URL_EN = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE_EN)}`;
export const WHATSAPP_URL_ES = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE_ES)}`;

export const EMAIL = "reservas@saywalodges.com";
export const MAPS_URL = "https://maps.app.goo.gl/yQ9UMCuHZ6jZvxHJ9";

// Set your Airbnb listing URL here once you have it
export const AIRBNB_URL = process.env.NEXT_PUBLIC_AIRBNB_URL || "";
