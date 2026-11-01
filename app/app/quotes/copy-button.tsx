"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

export function CopyButton({ text, label, size = "default" }: { text: string; label: string; size?: "default" | "sm" }) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={copy}>
        {state === "copied" ? "Copiado" : state === "failed" ? "No se pudo copiar" : label}
      </Button>
      <span className="sr-only" aria-live="polite">{state === "copied" ? "Copiado al portapapeles" : ""}</span>
    </>
  );
}
