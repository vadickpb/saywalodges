"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { demoCopy, type DemoLocale } from "@/dictionaries/demo";
import { DEMO_GUIDE_PASSWORD, DEMO_GUIDE_TOKEN } from "@/lib/demo-credentials";

const STORAGE_KEY = "saywa-demo-tour-step";
const STORAGE_EVENT = "saywa-demo-tour-change";
const INTERNAL_HREFS = ["/app/calendar", "/app/bookings", "/app/finance"] as const;
let memoryStep = "0";

function subscribeToStoredStep(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

function getStoredStep() {
  try {
    memoryStep = localStorage.getItem(STORAGE_KEY) ?? memoryStep;
  } catch {
    // Privacy modes can disable storage. The in-memory fallback keeps the tour usable.
  }
  return memoryStep;
}

export function DemoTour({ siteUrl, locale }: { siteUrl: string | null; locale: DemoLocale }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = demoCopy[locale];
  const total = copy.tour.steps.length;
  const storedStep = useSyncExternalStore(subscribeToStoredStep, getStoredStep, () => "pending");
  const parsedStep = Number(storedStep);
  const step = storedStep === "pending"
    ? null
    : storedStep === "done" || !Number.isInteger(parsedStep) || parsedStep < 0 || parsedStep >= total
      ? total
      : parsedStep;

  const persist = useCallback((value: number | "done") => {
    memoryStep = String(value);
    try {
      localStorage.setItem(STORAGE_KEY, memoryStep);
    } catch {
      // Keep the in-memory value when storage is unavailable.
    }
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }, []);

  useEffect(() => {
    if (step !== null && step < total) headingRef.current?.focus();
  }, [step, total]);

  useEffect(() => {
    if (step === null || step >= total) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") persist("done");
      if (event.key === "ArrowRight") persist(step === total - 1 ? "done" : step + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [persist, step, total]);

  const open = step !== null && step < total;
  const activeStep = open ? copy.tour.steps[step] : null;
  const href = !open
    ? "/app"
    : step < INTERNAL_HREFS.length
      ? INTERNAL_HREFS[step]
      : step === 3
        ? siteUrl ?? "/app/site"
        : siteUrl ? `${siteUrl}/${locale}/guia/${DEMO_GUIDE_TOKEN}` : "/app/site/guide";
  const external = open && step >= 3 && Boolean(siteUrl);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 print:hidden">
        <p>{copy.banner}</p>
        {!open && (
          <button type="button" className="underline underline-offset-2 focus-visible:outline-2" onClick={() => persist(0)}>
            {copy.restart}
          </button>
        )}
      </div>
      {open && activeStep && (
        <aside
          role="dialog"
          aria-modal="false"
          aria-labelledby="demo-tour-title"
          aria-describedby="demo-tour-description"
          className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl md:inset-x-auto md:bottom-6 md:right-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.tour.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{copy.tour.step(step + 1, total)}</p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={copy.tour.skip} onClick={() => persist("done")}>
              <X className="size-4" />
            </Button>
          </div>
          <h2 id="demo-tour-title" ref={headingRef} tabIndex={-1} className="mt-4 text-lg font-semibold outline-none">
            {activeStep.title}
          </h2>
          <p id="demo-tour-description" className="mt-2 text-sm text-muted-foreground">{activeStep.description}</p>
          {step === 4 && (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
              {copy.tour.guidePassword}: <code className="font-mono">{DEMO_GUIDE_PASSWORD}</code>
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
                {copy.tour.open}
                {external && <ExternalLink className="size-4" />}
              </Link>
            </Button>
            <Button type="button" onClick={() => persist(step === total - 1 ? "done" : step + 1)}>
              {step === total - 1 ? copy.tour.finish : copy.tour.next}
            </Button>
            <Button type="button" variant="ghost" onClick={() => persist("done")}>{copy.tour.skip}</Button>
          </div>
        </aside>
      )}
    </>
  );
}
