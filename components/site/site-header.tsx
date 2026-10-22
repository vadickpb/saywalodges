"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import type { Dict } from "@/dictionaries/en";
import { buttonStyles } from "./ui";

type Link = { href: string; label: string };

type Props = {
  dict: Dict["nav"];
  lang: string;
  name: string;
  logoUrl: string;
  links: Link[];
  // Whether the header starts transparent on top of a hero photo.
  overImage: boolean;
};

export function SiteHeader({ dict, lang, name, logoUrl, links, overImage }: Props) {
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

  const transparent = overImage && !scrolled && !open;
  const otherLang = lang === "es" ? "en" : "es";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        transparent ? "text-white" : "border-b border-site-line bg-site-bg/95 text-site-fg backdrop-blur"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:h-20 lg:px-10">
        <a href="#top" className="flex min-w-0 items-center gap-3">
          {logoUrl && (
            <Image src={logoUrl} alt="" width={36} height={36} className="size-9 rounded-full object-cover" />
          )}
          <span className="truncate font-site-heading text-lg font-semibold tracking-tight lg:text-xl">{name}</span>
        </a>

        <nav aria-label={name} className="hidden items-center gap-7 lg:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium opacity-85 transition hover:opacity-100">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={`/${otherLang}`}
            hrefLang={otherLang}
            aria-label={dict.switchLanguage}
            className="rounded-site px-2.5 py-2 text-xs font-semibold uppercase tracking-widest opacity-85 hover:opacity-100"
          >
            {otherLang}
          </a>
          <a
            href="#availability"
            className={`${transparent ? buttonStyles.light : buttonStyles.primary} px-5! py-2.5! max-sm:hidden`}
          >
            {dict.book}
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
          <a href="#availability" onClick={() => setOpen(false)} className={`${buttonStyles.primary} mt-8 w-full`}>
            {dict.book}
          </a>
        </div>
      )}
    </header>
  );
}
