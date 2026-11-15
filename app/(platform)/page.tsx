// The bare ROOT_DOMAIN (ADR-0001: "<root> → landing") — proxy.ts doesn't
// rewrite this host at all, so whatever's here serves directly. The real
import { PRODUCT_NAME } from "@/config/site";

// The marketing site is SD-704; this is just a placeholder so the
// route exists (every multiple-root-layouts setup needs "/" defined
// somewhere when there's no single app/layout.tsx above everything).
export default function LandingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-light text-charcoal">{PRODUCT_NAME}</h1>
        <p className="mt-2 text-sm text-stone">Coming soon.</p>
      </div>
    </div>
  );
}
