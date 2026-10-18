import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MetricCardProps = {
  label: string;
  value: string;
  trend?: { value: string; direction: "up" | "down" };
};

export function MetricCard({ label, value, trend }: MetricCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground">{value}</span>
          {trend && (
            // Literal, contrast-verified colors against the card background
            // in both themes (same reasoning as StatusBadge — a single
            // shared --success/--destructive token can't satisfy "button
            // bg with white text" and "plain text on card" at once).
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                trend.direction === "up"
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {trend.direction === "up" ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              {trend.value}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
