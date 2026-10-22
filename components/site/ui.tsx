import Image from "next/image";
import { Images } from "lucide-react";

// Shared building blocks for the public site template (SD-209). Colors,
// radius and fonts all come from the tenant's --site-* tokens.

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-site px-6 py-3.5 text-sm font-semibold tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent";

export const buttonStyles = {
  primary: `${BUTTON_BASE} bg-site-primary text-site-primary-fg hover:opacity-90`,
  accent: `${BUTTON_BASE} bg-site-accent text-site-accent-fg hover:opacity-90`,
  outline: `${BUTTON_BASE} border border-site-line text-site-fg hover:bg-site-surface`,
  // For use on top of photos, where tenant colors can't guarantee contrast.
  light: `${BUTTON_BASE} bg-white text-black hover:bg-white/90 focus-visible:outline-white`,
  glass: `${BUTTON_BASE} border border-white/50 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 focus-visible:outline-white`,
};

export function SectionHeading({
  label,
  title,
  align = "left",
}: {
  label: string;
  title: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-site-accent">{label}</p>
      <h2 className="mt-3 font-site-heading text-3xl leading-tight tracking-tight sm:text-4xl lg:text-5xl">
        {title}
      </h2>
    </div>
  );
}

// next/image when there is a photo, otherwise a themed placeholder of the
// same size — a tenant without photos yet never shows a broken image.
export function Photo({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
  placeholderLabel,
}: {
  src: string | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  placeholderLabel?: string;
}) {
  if (!src) {
    return (
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-site-surface text-site-muted ${className}`}
      >
        <Images className="size-8" strokeWidth={1.25} aria-hidden="true" />
        {placeholderLabel && <span className="text-xs">{placeholderLabel}</span>}
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
    />
  );
}

export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10 ${className}`}>{children}</div>;
}
