import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, CalendarClock, CreditCard } from "lucide-react";
import { formatMoney, usePlans, useSubscription } from "@/lib/subscription";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing & Subscription — KNUST Attendance" }] }),
  component: BillingPage,
});

function BillingPage() {
  const { sub, loading } = useSubscription();
  const plans = usePlans();
  const paid = plans.filter((p) => p.interval !== "trial");

  const upgrade = (planCode: string, provider: "stripe" | "paystack") => {
    toast.info(
      `${provider === "stripe" ? "Stripe" : "Paystack"} checkout coming in Phase 3 — plan: ${planCode}`,
    );
  };

  const statusBadge = () => {
    if (!sub) return <Badge variant="outline">No subscription</Badge>;
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      trialing: { label: "Free Trial", variant: "secondary" },
      active: { label: "Active", variant: "default" },
      past_due: { label: "Past Due", variant: "destructive" },
      canceled: { label: "Canceled", variant: "outline" },
      expired: { label: "Expired", variant: "destructive" },
    };
    const m = map[sub.status] ?? { label: sub.status, variant: "outline" as const };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your plan and payment method.</p>
      </div>

      {/* Current status */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-5 text-primary" /> Current plan
              </CardTitle>
              <CardDescription className="mt-1">
                {loading ? "Loading..." : sub?.planCode === "trial" ? "You are on the free trial." : `Plan: ${sub?.planCode ?? "—"}`}
              </CardDescription>
            </div>
            {statusBadge()}
          </div>
        </CardHeader>
        <CardContent>
          {sub && (
            <div className="grid gap-4 sm:grid-cols-3 text-sm">
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Status</div>
                <div className="font-medium capitalize">{sub.status.replace("_", " ")}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                  {sub.status === "trialing" ? "Trial ends" : "Renews / expires"}
                </div>
                <div className="font-medium flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {(sub.trialEndsAt || sub.currentPeriodEnd)
                    ? new Date((sub.currentPeriodEnd ?? sub.trialEndsAt)!).toLocaleDateString(undefined, { dateStyle: "medium" })
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Days remaining</div>
                <div className="font-medium">{sub.daysRemaining}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade options */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Choose a plan</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {paid.map((plan) => {
            const isYear = plan.interval === "year";
            return (
              <Card key={plan.code} className={isYear ? "border-primary shadow-md relative" : ""}>
                {isYear && (
                  <Badge className="absolute -top-2 right-4">Best value</Badge>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold">{formatMoney(plan.price_ghs, "GHS")}</span>
                    <span className="text-muted-foreground text-sm">/ {plan.interval}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">or {formatMoney(plan.price_usd, "USD")}</div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    {(plan.features as string[]).map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="size-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-2 pt-2">
                    <Button className="w-full" onClick={() => upgrade(plan.code, "paystack")}>
                      Pay with Mobile Money (Paystack)
                    </Button>
                    <Button className="w-full" variant="outline" onClick={() => upgrade(plan.code, "stripe")}>
                      Pay with Card (Stripe)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Prices in Ghana Cedis (GHS). By subscribing you agree to our{" "}
        <Link to={"/terms" as string} className="underline">Terms</Link> and{" "}
        <Link to={"/privacy" as string} className="underline">Privacy Policy</Link>.
        Checkout is being finalized — Phase 3 wires it to Stripe and Paystack.
      </p>
    </div>
  );
}
