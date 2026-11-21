"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CalendarDays, Menu, MessageCircle, X } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { buttonStyles } from "./ui";

type Link = { href: string; label: string };

type Props = {
  dict: Dict["nav"];
  lang: string;
  name: string;
  logoUrl: string;
  links: Link[];
  languageHref?: string;
  bookingHref?: string;
  /** SD-1134: the five main sections shown in the bar (Inicio, Villas…); `links` stay in the mobile menu. Defaults to `links`. */
  primaryLinks?: Link[];
  /** SD-1134: WhatsApp icon next to the booking button. */
  waUrl?: string;
};

export function SiteHeader({ dict, lang, name, logoUrl, links, languageHref, bookingHref = "#availability", primaryLinks, waUrl }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // SD-1134: the bar is a solid strip above the page (the new design).
  const barLinks = primaryLinks ?? links;
  // The "current section" mark only makes sense on the home page, the only caller that passes the five main links.
  const onHome = Boolean(primaryLinks);
  const otherLang = lang === "es" ? "en" : "es";

  return (
    <>
    <a
      href="#main"
      className="fixed left-4 top-4 z-50 -translate-y-24 rounded-site bg-site-primary px-4 py-2 text-sm font-semibold text-site-primary-fg focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent"
    >
      {dict.skipToContent}
    </a>
    <header
      className={`fixed inset-x-0 top-0 z-40 border-b border-site-line bg-site-bg/95 text-site-fg backdrop-blur transition-shadow duration-300 ${scrolled ? "shadow-sm" : ""}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:h-20 lg:px-10">
        <a href="#top" className="flex min-w-0 items-center gap-3">
          {logoUrl && (
            <Image src={logoUrl} alt="" width={36} height={36} className="size-9 rounded-full object-cover" />
          )}
          <span className="truncate font-site-heading text-lg font-semibold uppercase tracking-[0.12em] lg:text-xl">{name}</span>
        </a>

        <nav aria-label={name} className="hidden items-center gap-7 lg:flex">
          {barLinks.map((link, index) => (
            <a key={link.href} href={link.href} aria-current={onHome && index === 0 && !scrolled ? "location" : undefined}
              className={`border-b-2 py-1.5 text-[15px] font-medium transition hover:border-site-accent hover:opacity-100 ${onHome && index === 0 && !scrolled ? "border-site-accent opacity-100" : "border-transparent opacity-85"}`}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={languageHref ?? `/${otherLang}`}
            hrefLang={otherLang}
            aria-label={dict.switchLanguage}
            className="rounded-site px-2.5 py-2 text-xs font-semibold uppercase tracking-widest opacity-85 hover:opacity-100"
          >
            {otherLang}
          </a>
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" aria-label={dict.whatsappLabel}
              className="rounded-full p-2 opacity-85 transition hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent">
              <MessageCircle className="size-6" strokeWidth={1.5} aria-hidden="true" />
            </a>
          )}
          <a href={bookingHref} aria-label={dict.bookNow}
            className="rounded-full bg-site-accent p-2.5 text-site-accent-fg sm:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent">
            <CalendarDays className="size-5" aria-hidden="true" />
          </a>
          <a
            href={bookingHref}
            className={`${buttonStyles.accent} px-5! py-2.5! max-sm:hidden`}
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            {dict.bookNow}
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-mobile-menu"
            aria-label={open ? dict.closeMenu : dict.menu}
            className="-mr-2 rounded-site p-2 lg:hidden"
          >
            {open ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="site-mobile-menu" className="h-[calc(100dvh-4rem)] overflow-y-auto bg-site-bg px-4 pb-10 pt-4 lg:hidden">
          <nav aria-label={name} className="flex flex-col">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-site-line py-4 font-site-heading text-2xl"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <a href={bookingHref} onClick={() => setOpen(false)} className={`${buttonStyles.accent} mt-8 w-full`}>
            <CalendarDays className="size-4" aria-hidden="true" />
            {dict.bookNow}
          </a>
        </div>
      )}
    </header>
    </>
  );
}
