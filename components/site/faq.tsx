import { Plus } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { Container, SectionHeading } from "./ui";

type Props = { dict: Dict["faq"]; items: { question: string; answer: string }[] };

// <details> accordion: keyboard- and screen-reader-accessible with no JS.
export function Faq({ dict, items }: Props) {
  if (items.length === 0) return null;

  return (
    <section id="faq" className="scroll-mt-20 bg-site-surface py-20 sm:py-28">
      <Container className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionHeading label={dict.label} title={dict.title} />
        </div>
        <div className="divide-y divide-site-line border-y border-site-line lg:col-span-8">
          {items.map((item) => (
            <details key={item.question} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left font-semibold [&::-webkit-details-marker]:hidden">
                {item.question}
                <Plus
                  className="size-5 shrink-0 text-site-accent transition-transform group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <p className="pb-6 pr-10 leading-relaxed text-site-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
