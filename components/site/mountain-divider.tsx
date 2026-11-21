// The small mountain mark between two thin lines that separates a heading from its text (SD-1134). Decorative.
export function MountainDivider({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-center gap-3 ${className}`}>
      <span className="h-px w-16 bg-current opacity-60 sm:w-28" />
      <svg viewBox="0 0 40 20" className="h-4 w-9 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 18 14 4l6 8 4-5 14 11" />
        <path d="m11 8 3 3 3-3" />
      </svg>
      <span className="h-px w-16 bg-current opacity-60 sm:w-28" />
    </div>
  );
}
