import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

import { PLANS, TRIAL_DAYS, PAYMENTS_LIVE, type PlanCode } from "@/lib/billing";
import { startCheckout } from "@/lib/paystack.functions";


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
  const [sub, setSub] = useState<{ plan_code: string; status: string; days_remaining: number; is_active: boolean; current_period_end: string | null; trial_ends_at: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.rpc("my_subscription").then(({ data }) => {
      if (alive && data && data.length) setSub(data[0] as never);
    });
    return () => { alive = false; };
  }, [user?.id]);

  const trial = useMemo(() => {
    const endsRaw = sub?.trial_ends_at ?? sub?.current_period_end;
    const created = user?.created_at ? new Date(user.created_at) : new Date();
    const ends = endsRaw ? new Date(endsRaw) : new Date(created.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const daysLeft = sub?.days_remaining ?? Math.max(0, Math.ceil((ends.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    return { ends, daysLeft };
  }, [user?.created_at, sub]);

  const planLabel = sub?.status === "active" ? (sub.plan_code ?? "Premium") : "Free trial";

  const [busy, setBusy] = useState<PlanCode | null>(null);
  const [chosen, setChosen] = useState<PlanCode | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("qroll:plan") : null;
    if (saved) setChosen(saved as PlanCode);
  }, []);

  const checkout = async (code: PlanCode, planName: string) => {
    if (!PAYMENTS_LIVE) {
      setChosen(code);
      window.localStorage.setItem("qroll:plan", code);
      toast.success(`${planName} plan saved as your preferred plan.`, {
        description: "Payments are not switched on yet — you keep full access for free. When billing goes live this plan will be pre-selected at checkout.",
      });
      return;
    }
    setBusy(code);
    try {
      const r = await startCheckout({ data: { plan: code, callbackUrl: `${window.location.origin}/billing` } });
      if (r.url) window.location.href = r.url;
      else toast.info(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    } finally {
      setBusy(null);
    }
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
            <Badge variant="secondary" className="text-sm capitalize">{planLabel}</Badge>
            <span className="text-sm text-muted-foreground">
              {trial.daysLeft} of {TRIAL_DAYS} days remaining · ends {trial.ends.toLocaleDateString()}
            </span>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <Card key={p.code} className={`relative transition-all hover:-translate-y-0.5 hover:shadow-lg ${chosen === p.code ? "border-primary ring-2 ring-primary/30 shadow-lg" : p.highlight ? "border-primary shadow-md" : ""}`}>
              {p.highlight && (
                <Badge className="absolute -top-2 right-4">Most popular</Badge>
              )}
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {p.name}
                  {chosen === p.code && <Badge variant="secondary" className="text-[10px]">Your pick</Badge>}
                </CardTitle>
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
                <Button className="w-full" variant={chosen === p.code ? "default" : p.highlight ? "default" : "outline"} disabled={busy === p.code} onClick={() => void checkout(p.code, p.name)}>
                  <CreditCard className="size-4 mr-1" /> {busy === p.code ? "Starting…" : chosen === p.code ? "Selected plan" : `Choose ${p.name}`}
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
