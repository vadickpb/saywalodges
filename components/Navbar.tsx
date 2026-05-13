"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dict } from "@/dictionaries";

type Props = { dict: Dict["nav"]; lang: string };

export default function Navbar({ dict, lang }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const otherLang = lang === "en" ? "es" : "en";
  const switchPath = pathname.replace(`/${lang}`, `/${otherLang}`);

  const links = [
    { label: dict.about, href: "#amenities" },
    { label: dict.gallery, href: "#gallery" },
    { label: dict.rates, href: "#rates" },
    { label: dict.location, href: "#location" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-cream shadow-sm border-b border-stone/10" : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 lg:px-10 h-18 flex items-center justify-between">
        <Link
          href={`/${lang}`}
          className={`text-lg font-semibold tracking-wide transition-colors duration-300 ${
            scrolled ? "text-forest" : "text-white"
          }`}
        >
          Saywa Lodges
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm tracking-wide transition-colors duration-300 hover:opacity-70 ${
                scrolled ? "text-charcoal" : "text-white/90"
              }`}
            >
              {l.label}
            </Link>
          ))}

          {/* Language switcher */}
          <Link
            href={switchPath}
            className={`text-xs font-medium tracking-widest uppercase transition-colors duration-300 px-2 py-1 rounded border ${
              scrolled
                ? "border-stone/30 text-stone hover:border-forest hover:text-forest"
                : "border-white/30 text-white/70 hover:border-white hover:text-white"
            }`}
          >
            {otherLang}
          </Link>

          <Link
            href="#rates"
            className="text-sm tracking-wide px-5 py-2 rounded-full bg-earth text-white hover:bg-earth/90 transition-all duration-200"
          >
            {dict.bookNow}
          </Link>
        </div>

        {/* Mobile: lang switcher + hamburger */}
        <div className="md:hidden flex items-center gap-3">
          <Link
            href={switchPath}
            className={`text-xs font-medium tracking-widest uppercase px-2 py-1 rounded border transition-colors ${
              scrolled
                ? "border-stone/30 text-stone"
                : "border-white/30 text-white/70"
            }`}
          >
            {otherLang}
          </Link>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex flex-col gap-1.5 p-1 transition-colors duration-300 ${
              scrolled ? "text-forest" : "text-white"
            }`}
            aria-label="Toggle menu"
          >
            <span className={`block w-6 h-0.5 bg-current transition-all duration-300 ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block w-6 h-0.5 bg-current transition-all duration-300 ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-6 h-0.5 bg-current transition-all duration-300 ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 bg-cream border-b border-stone/10 ${
          menuOpen ? "max-h-72" : "max-h-0"
        }`}
      >
        <div className="px-6 py-4 flex flex-col gap-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="text-sm text-charcoal tracking-wide hover:text-forest transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="#rates"
            onClick={() => setMenuOpen(false)}
            className="text-sm text-center px-5 py-2.5 rounded-full bg-earth text-white hover:bg-earth/90 transition-colors"
          >
            {dict.bookNow}
          </Link>
        </div>
      </div>
    </header>
  );
}
