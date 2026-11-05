"use client";

import { useEffect, useRef } from "react";

export function PrintButton({ label, autoPrint = false }: { label: string; autoPrint?: boolean }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!autoPrint) return;
    let cancelled = false;
    async function printWhenReady() {
      const guide = button.current?.closest("article, main");
      await Promise.all([
        document.fonts.ready,
        ...Array.from(guide?.querySelectorAll("img") ?? []).map(image => image.decode().catch(() => undefined)),
      ]);
      if (!cancelled) window.print();
    }
    void printWhenReady();
    return () => { cancelled = true; };
  }, [autoPrint]);
  return <button ref={button} type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-current/30 px-4 py-2 print:hidden">{label}</button>;
}
