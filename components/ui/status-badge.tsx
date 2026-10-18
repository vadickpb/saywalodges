import { Badge } from "@/components/ui/badge";

export type BookingStatus = "confirmed" | "pending" | "blocked";

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  blocked: "Blocked",
};

// Soft tinted bg + solid-color text, not solid bg + white text: a single
// green/amber/red at full saturation can't pass WCAG AA as a white-text
// background in both light and dark (verified — it fails: as low as
// 2.15:1 in dark mode, vs the 4.5:1 this badge's text size requires). Each
// pair below is independently contrast-checked against its own background.
const STATUS_CLASS: Record<BookingStatus, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  blocked: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

// Maps the domain's booking statuses to the badge primitive's visual
// language — kept separate from Badge itself so badge.tsx stays untouched
// generated shadcn source, composable instead of modified.
export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</Badge>;
}
