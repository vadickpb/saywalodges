import { Mail, MessageCircle } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { Container, SectionHeading, buttonStyles } from "./ui";

type Props = { dict: Dict["contact"]; waUrl: string; email: string };

export function Contact({ dict, waUrl, email }: Props) {
  return (
    <section id="contact" className="scroll-mt-20 py-20 sm:py-28">
      <Container>
        <SectionHeading label={dict.label} title={dict.title} align="center" />
        <p className="mx-auto mt-5 max-w-xl text-center leading-relaxed text-site-muted">{dict.text}</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className={buttonStyles.primary}>
            <MessageCircle className="size-4" aria-hidden="true" />
            {dict.whatsapp}
          </a>
          {email && (
            <a href={`mailto:${email}`} className={buttonStyles.outline}>
              <Mail className="size-4" aria-hidden="true" />
              {dict.email}
            </a>
          )}
        </div>
      </Container>
    </section>
  );
}
