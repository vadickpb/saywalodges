import { renderToStaticMarkup } from "react-dom/server.edge";
import { buildContent, cleanText, type EmailMessage } from "./content";
import { EmailLayout } from "./layout";
import { emailMessages } from "./messages";

export type RenderedEmail = { subject: string; html: string; text: string };

// Throws a ZodError when the props don't satisfy the template's schema; the
// sender turns that into a generic `invalid_input` without echoing the data.
export function renderEmail(message: EmailMessage): RenderedEmail {
  const content = buildContent(message);
  const html = "<!DOCTYPE html>" + renderToStaticMarkup(<EmailLayout lang={message.lang} content={content} />);
  const text = [
    content.heading,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`, ""] : []),
    "--",
    emailMessages[message.lang].footer,
  ].join("\n");
  // Subjects are headers: no control characters, bounded length.
  return { subject: cleanText(content.subject, 200), html, text };
}
