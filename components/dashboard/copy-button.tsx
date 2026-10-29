"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Copies a text to the clipboard. The text is also shown selectable next to it,
// so a browser that blocks the clipboard still lets the person copy by hand.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={copy} aria-label={label}>
        {state === "copied" ? "Copiado" : state === "failed" ? "Copia a mano" : "Copiar"}
      </Button>
      <span role="status" className="sr-only">
        {state === "copied" ? "Enlace copiado" : state === "failed" ? "No se pudo copiar: selecciona el enlace y cópialo a mano" : ""}
      </span>
    </>
  );
}
