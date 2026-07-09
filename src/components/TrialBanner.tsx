import { Link } from "@tanstack/react-router";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/lib/subscription";

export function TrialBanner() {
  const { sub, loading } = useSubscription();
  if (loading || !sub) return null;

  // Trial ending soon (≤ 5 days)
  if (sub.status === "trialing" && sub.isActive && sub.daysRemaining <= 5) {
    return (
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-amber-600" />
          <span>
            Your free trial ends in <b>{sub.daysRemaining} day{sub.daysRemaining === 1 ? "" : "s"}</b>. Upgrade to keep uninterrupted access.
          </span>
        </div>
        <Link to={"/billing" as string}>
          <Button size="sm" variant="default">Upgrade to Pro</Button>
        </Link>
      </div>
    );
  }

  // Expired / not active
  if (!sub.isActive) {
    return (
      <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4 text-destructive" />
          <span>
            Your {sub.status === "trialing" ? "trial has ended" : "subscription is not active"}. Reports remain read-only until you upgrade.
          </span>
        </div>
        <Link to={"/billing" as string}>
          <Button size="sm" variant="destructive">Upgrade now</Button>
        </Link>
      </div>
    );
  }

  return null;
}
