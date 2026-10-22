import type { Dict } from "@/dictionaries/en";
import { Container } from "./ui";

type Props = {
  dict: Dict["footer"];
  name: string;
  region: string;
  links: { href: string; label: string }[];
  email: string;
  whatsappNumber: string;
  waUrl: string;
};

export function SiteFooter({ dict, name, region, links, email, whatsappNumber, waUrl }: Props) {
  const year = new Date().getFullYear();

  return (
    // Extra bottom padding on mobile clears the fixed booking bar.
    <footer className="border-t border-site-line pb-28 pt-16 md:pb-12">
      <Container>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-site-heading text-2xl tracking-tight">{name}</p>
            {region && <p className="mt-3 max-w-sm text-sm leading-relaxed text-site-muted">{region}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-site-muted">{dict.explore}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="hover:underline">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-site-muted">{dict.contact}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  WhatsApp +{whatsappNumber}
                </a>
              </li>
              {email && (
                <li>
                  <a href={`mailto:${email}`} className="break-all hover:underline">
                    {email}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-site-line pt-6 text-xs text-site-muted sm:flex-row sm:justify-between">
          <p>
            © {year} {name}. {dict.rights}
          </p>
          <p>{dict.poweredBy}</p>
        </div>
      </Container>
    </footer>
  );
}
