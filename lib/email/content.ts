import { z } from "zod";
import { format } from "@/lib/domain/format";
import { emailMessages, type EmailLang } from "./messages";

// Every template is a pure function (lang, props) → EmailContent. One shared
// layout renders it to HTML and one function to plain text, so a new template
// (SD-407) is copy + props schema, not markup.
export type EmailContent = {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
};

// Anything that reaches a template prop is user-controlled (guest names...).
// Strip control characters (CR/LF would otherwise reach the subject) and cap
// length. HTML escaping is done by React when the layout renders.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
export const cleanText = (value: string, max: number) => value.replace(CONTROL_CHARS, " ").trim().slice(0, max);

export const httpsUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "must be an https URL");

const displayName = z
  .string()
  .max(100)
  .transform((value) => cleanText(value, 100))
  .optional();

// `build` validates its props with the schema first, so callers can pass raw,
// untrusted values; invalid ones throw a ZodError.
function defineTemplate<S extends z.ZodType>(schema: S, build: (lang: EmailLang, props: z.output<S>) => EmailContent) {
  return { build: (lang: EmailLang, raw: z.input<S>): EmailContent => build(lang, schema.parse(raw)) };
}

export const templates = {
  test: defineTemplate(z.object({ name: displayName }), (lang, props) => {
    const m = emailMessages[lang].test;
    return {
      subject: m.subject,
      preheader: m.preheader,
      heading: m.heading,
      paragraphs: [props.name ? format(m.greeting, { name: props.name }) : m.greetingAnonymous, m.body, m.note],
    };
  }),
};

export type TemplateName = keyof typeof templates;
export type TemplateInput<N extends TemplateName> = Parameters<(typeof templates)[N]["build"]>[1];
export type EmailMessage = { [N in TemplateName]: { template: N; lang: EmailLang; props: TemplateInput<N> } }[TemplateName];

export function buildContent(message: EmailMessage): EmailContent {
  // Safe: `template` and `props` are tied together by the EmailMessage union.
  return (templates[message.template].build as (lang: EmailLang, props: unknown) => EmailContent)(message.lang, message.props);
}
