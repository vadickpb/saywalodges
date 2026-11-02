import { renderToStaticMarkup } from "react-dom/server.edge";
import { format } from "@/lib/domain/format";
import { DEFAULT_BRAND, type EmailBrand } from "./config";
import { buildContent, cleanText, type EmailMessage } from "./content";
import { EmailLayout } from "./layout";
import { emailMessages } from "./messages";

export type RenderedEmail = { subject: string; html: string; text: string };

// Throws a ZodError when the props don't satisfy the template's schema; the
// sender turns that into a generic `invalid_input` without echoing the data.
export function renderEmail(message: EmailMessage, brand: EmailBrand = DEFAULT_BRAND): RenderedEmail {
  const content = buildContent(message, brand.name);
  const html = "<!DOCTYPE html>" + renderToStaticMarkup(<EmailLayout lang={message.lang} content={content} brand={brand} />);
  const text = [
    content.heading,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`, ""] : []),
    "--",
    format(emailMessages[message.lang].footer, { brand: brand.name }),
    ...(brand.poweredBy ? [emailMessages[message.lang].poweredBy] : []),
  ].join("\n");
  // Subjects are headers: no control characters, bounded length.
  return { subject: cleanText(content.subject, 200), html, text };
}
