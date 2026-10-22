import { MessageCircle } from "lucide-react";
import { buttonStyles } from "./ui";

type Props = { label: string; detail: string; waUrl: string };

// Fixed booking bar on small screens — the primary action is always one tap
// away. Hidden from md up, where the header carries the CTA.
export function MobileCta({ label, detail, waUrl }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-site-line bg-site-bg/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-4">
        {detail && <p className="min-w-0 truncate text-sm font-semibold">{detail}</p>}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonStyles.primary} shrink-0 px-5! py-3!`}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {label}
        </a>
      </div>
    </div>
  );
}
