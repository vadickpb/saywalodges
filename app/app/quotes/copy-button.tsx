"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

export function CopyButton({
  text,
  label,
  ariaLabel,
  size = "default",
}: {
  text: string;
  label: string;
  // Several copy buttons share one label on the page; this tells a screen reader which one is which.
  ariaLabel?: string;
  size?: "default" | "sm";
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={copy} aria-label={ariaLabel}>
        {state === "copied" ? "Copiado" : state === "failed" ? "No se pudo copiar" : label}
      </Button>
      <span className="sr-only" role="status">{state === "copied" ? "Copiado al portapapeles" : ""}</span>
    </>
  );
}
