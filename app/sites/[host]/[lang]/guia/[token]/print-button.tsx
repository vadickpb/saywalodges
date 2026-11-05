"use client";

export function PrintButton({ label }: { label: string }) {
  return <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-current/30 px-4 py-2 print:hidden">{label}</button>;
}
