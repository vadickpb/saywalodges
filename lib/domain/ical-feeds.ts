import { z } from "zod";

// Per-channel calendar feeds (SD-304), pure.

export const ICAL_CHANNELS = ["airbnb", "booking", "vrbo", "other"] as const;
export type IcalChannel = (typeof ICAL_CHANNELS)[number];
export const ICAL_CHANNEL_LABELS: Record<IcalChannel, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  vrbo: "Vrbo",
  other: "Otro canal",
};

export const feedFormSchema = z.object({
  unitId: z.string().uuid("Selecciona una casa"),
  channel: z.enum(ICAL_CHANNELS, { message: "Selecciona un canal" }),
});
export type FeedForm = z.infer<typeof feedFormSchema>;

const TOKEN = /^[a-f0-9]{64}$/;
export const isExportToken = (value: string) => TOKEN.test(value);

// Absolute URL on a platform host (local hosts use http).
export function platformUrl(host: string, path: string): string {
  const local = host === "localhost" || host.startsWith("localhost:") || host.endsWith(".localhost") || host.includes(".localhost:");
  return `${local ? "http" : "https"}://${host}${path}`;
}

// The URL a channel is given to read the calendar. `host` is the dashboard's own
// host (a platform host, where /api/* is served as is).
export function exportUrl(host: string, token: string): string {
  return platformUrl(host, `/api/ical/${token}`);
}
