import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Check, CreditCard, Home as HomeIcon, Sparkles, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Plans — QRoll" },
      { name: "description", content: "Manage your QRoll subscription: 14-day free trial, then monthly, per-semester, or yearly premium plans." },
      { property: "og:title", content: "Billing & Plans — QRoll" },
      { property: "og:description", content: "14-day free trial, then monthly, per-semester, or yearly QRoll premium plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

const TRIAL_DAYS = 14;

const PLANS = [
  {
    code: "monthly",
    name: "Monthly",
    usd: 6,
    cadence: "per month",
    note: "Billed every month. Cancel anytime.",
    features: ["Unlimited sessions", "Unlimited students", "Excel, CSV & PDF reports", "Geofenced self check-in"],
  },
  {
    code: "semester",
    name: "Per Semester",
    usd: 20,
    cadence: "per 4 months",
    note: "Best for a full academic semester — save 17%.",
    highlight: true,
    features: ["Everything in Monthly", "4 months of access", "Priority email support"],
  },
  {
    code: "yearly",
    name: "Yearly",
    usd: 60,
    cadence: "per year",
    note: "Best value — save 17% versus monthly.",
    features: ["Everything in Per Semester", "12 months of access", "Early access to new features"],
  },
];

function localPrice(usd: number) {
  try {
    const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
    return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(usd);
  } catch {
    return `$${usd}`;
  }
}

function BillingPage() {
  const { user } = useAuth();

  const trial = useMemo(() => {
    const created = user?.created_at ? new Date(user.created_at) : new Date();
    const ends = new Date(created.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const daysLeft = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    return { ends, daysLeft };
  }, [user?.created_at]);

  const checkout = (planName: string) => {
    toast.info(`${planName} plan selected — payments are not switched on yet.`, {
      description: "Billing is fully set up but stays inactive until the payment provider is connected and approved. Everything remains free and unrestricted until then.",
    });
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Billing & Plans</h1>
            <p className="text-muted-foreground text-sm mt-1">Start free for {TRIAL_DAYS} days, then pick the plan that fits your term.</p>
          </div>
          <Link to={"/dashboard" as string} className="w-full sm:w-auto">
            <Button className="w-full"><HomeIcon className="size-4 mr-1" />Dashboard</Button>
          </Link>
        </div>

        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>Payments are not live yet</AlertTitle>
          <AlertDescription>
            The billing system is in place but switched off. Every feature stays fully open and free for all users
            until the payment provider is connected and approved.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /> Your current plan</CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="text-sm">Free trial</Badge>
            <span className="text-sm text-muted-foreground">
              {trial.daysLeft} of {TRIAL_DAYS} days remaining · ends {trial.ends.toLocaleDateString()}
            </span>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <Card key={p.code} className={p.highlight ? "border-primary shadow-md relative" : "relative"}>
              {p.highlight && (
                <Badge className="absolute -top-2 right-4">Most popular</Badge>
              )}
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>{p.note}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-3xl font-bold">{localPrice(p.usd)}</div>
                  <div className="text-xs text-muted-foreground">{p.cadence} · charged in your local currency where supported</div>
                </div>
                <ul className="space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="size-4 text-primary mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant={p.highlight ? "default" : "outline"} onClick={() => checkout(p.name)}>
                  <CreditCard className="size-4 mr-1" /> Choose {p.name}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Prices are shown in USD and will be converted to your country's currency at checkout once payments go live.
          Cards, mobile money, and bank transfers will be supported depending on your region.
        </p>
      </div>
    </AppShell>
  );
}
