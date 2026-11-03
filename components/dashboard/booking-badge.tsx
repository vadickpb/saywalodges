import { Badge } from "@/components/ui/badge";

const TONE = {
  action: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  ok: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  muted: "bg-muted text-muted-foreground",
} as const;

// Soft tinted background + solid text, as status-badge.tsx (contrast checked for AA in light and dark).
export function BookingBadge({ label, tone }: { label: string; tone: keyof typeof TONE }) {
  return <Badge className={TONE[tone]}>{label}</Badge>;
}
