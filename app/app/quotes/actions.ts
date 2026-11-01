"use server";

import { revalidatePath } from "next/cache";
import { createQuote, previewQuote, QUOTES_ERROR } from "@/lib/dal/quotes";
import {
  buildQuoteMessage,
  createQuoteRequestSchema,
  limaDate,
  quoteLinkUrl,
  quoteRequestSchema,
  whatsappShareUrl,
} from "@/lib/domain/quote-builder";
import { formatPrice, pricingErrorMessage } from "@/lib/domain/rates-management";
import { readText } from "../site/_lib/form-state";

export type QuoteFormState = {
  values?: Record<string, string>;
  error?: string;
  preview?: {
    unitName: string;
    available: boolean;
    nights: number;
    currency: "PEN" | "USD";
    totalCents: number;
    depositCents: number;
  };
  created?: { unitName: string; link: string; message: string; whatsappUrl: string; expiresOn: string };
};

const UNKNOWN_UNIT = "No se encontró la unidad en tu propiedad activa.";
const NO_ADDRESS = "La propiedad no tiene una dirección pública configurada para armar el enlace.";
const TAKEN = "Estas fechas ya no están disponibles para esta unidad. Elige otras fechas.";

// One entry point, two intents: "preview" only calculates; "create" also stores the quote and builds the
// message to share. Neither reads an amount, a currency or a deposit from the form: the server recomputes
// them from stored pricing and the property's deposit policy (ADR 0009).
export async function submitQuoteAction(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const values = readText(formData, ["unitId", "checkIn", "checkOut", "guests", "lang"]);
  return formData.get("intent") === "create" ? create(values) : preview(values);
}

async function preview(values: Record<string, string>): Promise<QuoteFormState> {
  const parsed = quoteRequestSchema.safeParse(values);
  if (!parsed.success) return { values, error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  try {
    const result = await previewQuote(parsed.data);
    if (!result) return { values, error: UNKNOWN_UNIT };
    if (!result.result.ok) return { values, error: pricingErrorMessage(result.result.error) };
    const { quote } = result.result;
    return {
      values,
      preview: {
        unitName: result.unitName, available: result.available, nights: quote.nightsCount,
        currency: quote.currency, totalCents: quote.totalCents, depositCents: quote.depositCents,
      },
    };
  } catch {
    return { values, error: QUOTES_ERROR };
  }
}

async function create(values: Record<string, string>): Promise<QuoteFormState> {
  const parsed = createQuoteRequestSchema.safeParse(values);
  if (!parsed.success) return { values, error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const { lang, ...scenario } = parsed.data;
  try {
    const result = await createQuote(scenario);
    if (!result.ok) {
      if (result.reason === "not_found") return { values, error: UNKNOWN_UNIT };
      if (result.reason === "unavailable") return { values, error: TAKEN };
      return { values, error: pricingErrorMessage(result.error) };
    }
    if (!result.origin) return { values, error: NO_ADDRESS };
    const { quote } = result;
    const link = quoteLinkUrl(result.origin, lang, result.token);
    const expiresOn = limaDate(result.expiresAt);
    const message = buildQuoteMessage({
      lang, unitName: result.unitName, checkIn: quote.checkIn, checkOut: quote.checkOut, nights: quote.nightsCount,
      guests: quote.guests, totalLabel: formatPrice(quote.totalCents, quote.currency),
      depositLabel: quote.depositCents > 0 ? formatPrice(quote.depositCents, quote.currency) : undefined,
      expiresOn, link,
    });
    revalidatePath("/app/quotes");
    return { values, created: { unitName: result.unitName, link, message, whatsappUrl: whatsappShareUrl(message), expiresOn } };
  } catch {
    return { values, error: QUOTES_ERROR };
  }
}
