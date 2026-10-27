"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Opens the browser's print dialog (which also offers "Save as PDF"). The shell
// hides its navigation when printing, so only the statement comes out.
export function PrintButton({ label = "Imprimir / guardar PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
