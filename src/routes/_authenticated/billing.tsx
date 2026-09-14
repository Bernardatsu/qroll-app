import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { firestoreDb } from "@/integrations/firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";

import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Check,
  CreditCard,
  Home as HomeIcon,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Plans — QRoll" },
      {
        name: "description",
        content:
          "Manage your QRoll subscription: 7-day free trial, then monthly, per-semester, or yearly premium plans.",
      },
      { property: "og:title", content: "Billing & Plans — QRoll" },
      {
        property: "og:description",
        content: "7-day free trial, then monthly, per-semester, or yearly QRoll plans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

import { PLANS, TRIAL_DAYS, PAYMENTS_LIVE, type PlanCode } from "@/lib/billing";
import { startCheckout, verifyCheckout } from "@/lib/paystack.functions";

function formatGhs(amount: number) {
  return `GHS ${amount.toFixed(2)}`;
}

function BillingPage() {
  const { user } = useAuth();
  const [verifying, setVerifying] = useState(false);
  const [sub, setSub] = useState<{
    plan_code: string;
    status: string;
    days_remaining: number;
    is_active: boolean;
    current_period_end: string | null;
    trial_ends_at: string | null;
  } | null>(null);

  const fetchSubscription = async () => {
    if (!user?.id) return;
    const q = query(collection(firestoreDb, "subscriptions"), where("owner_id", "==", user.id));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const docData = snap.docs[0].data() as any;
    const periodEnd = docData.current_period_end ? new Date(docData.current_period_end) : null;
    const daysRemaining = periodEnd
      ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : 0;

    setSub({
      plan_code: docData.plan_code || "monthly",
      status: docData.status || "active",
      days_remaining: daysRemaining,
      is_active: docData.status === "active",
      current_period_end: docData.current_period_end || null,
      trial_ends_at: docData.trial_ends_at || null,
    });
  };

  useEffect(() => {
    void fetchSubscription();
  }, [user?.id]);

  // Handle Paystack callback reference in URL (?reference=... or ?trxref=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (!reference) return;

    // Clean URL so refresh doesn't re-trigger
    window.history.replaceState({}, document.title, window.location.pathname);

    setVerifying(true);
    verifyCheckout({ data: { reference, userId: user?.id } })
      .then((res) => {
        setVerifying(false);
        if (res.success) {
          toast.success("Payment confirmed! Your QRoll plan is now active.", {
            description: "Thank you for subscribing. You have full access to all features.",
          });
          void fetchSubscription();
        } else {
          toast.error("Payment was not completed or failed verification.");
        }
      })
      .catch((err) => {
        setVerifying(false);
        console.error("Verification error:", err);
      });
  }, [user?.id]);

  const trial = useMemo(() => {
    const endsRaw = sub?.trial_ends_at ?? sub?.current_period_end;
    const created = user?.created_at ? new Date(user.created_at) : new Date();
    const ends = endsRaw
      ? new Date(endsRaw)
      : new Date(created.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const daysLeft =
      sub?.days_remaining ??
      Math.max(0, Math.ceil((ends.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
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
      toast.success(`${planName} plan saved as your preferred plan.`);
      return;
    }
    setBusy(code);
    try {
      const r = await startCheckout({
        data: {
          plan: code,
          callbackUrl: `${window.location.origin}/billing`,
          userId: user?.id,
          email: user?.email || undefined,
        },
      });
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
            <p className="text-muted-foreground text-sm mt-1">
              Every account starts with a <b>7-day free trial</b> with all features included.
              Upgrade anytime with Mobile Money or Bank Cards.
            </p>
          </div>
          <Link to={"/dashboard" as string} className="w-full sm:w-auto">
            <Button className="w-full">
              <HomeIcon className="size-4 mr-1" />
              Dashboard
            </Button>
          </Link>
        </div>

        {verifying && (
          <Alert className="border-primary/40 bg-primary/5">
            <RefreshCw className="size-4 animate-spin text-primary" />
            <AlertTitle>Verifying your payment...</AlertTitle>
            <AlertDescription>
              Please wait a moment while we activate your subscription.
            </AlertDescription>
          </Alert>
        )}

        <Alert className="border-emerald-500/30 bg-emerald-500/5">
          <ShieldCheck className="size-4 text-emerald-600" />
          <AlertTitle className="text-emerald-800 dark:text-emerald-300 font-semibold">
            Live Payments Connected
          </AlertTitle>
          <AlertDescription className="text-emerald-700 dark:text-emerald-400 text-xs">
            Secure, instant payment processing via Ghana Mobile Money (MTN MoMo, Telecel Cash, AT
            Money), Visa, Mastercard, and Bank Transfer.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Your current status
            </CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="text-sm capitalize font-medium">
              {planLabel}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {sub?.is_active
                ? `Active subscription · ${sub.days_remaining} day${sub.days_remaining === 1 ? "" : "s"} remaining`
                : `${trial.daysLeft} of ${TRIAL_DAYS} trial days remaining · ends ${trial.ends.toLocaleDateString()}`}
            </span>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <Card
              key={p.code}
              className={`relative transition-all hover:-translate-y-0.5 hover:shadow-lg ${chosen === p.code ? "border-primary ring-2 ring-primary/30 shadow-lg" : p.highlight ? "border-primary shadow-md" : ""}`}
            >
              {p.highlight && <Badge className="absolute -top-2 right-4">Most popular</Badge>}
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {p.name}
                  {chosen === p.code && (
                    <Badge variant="secondary" className="text-[10px]">
                      Your pick
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>{p.note}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-3xl font-bold">{formatGhs(p.amountGhs)}</div>
                  <div className="text-xs text-muted-foreground">{p.cadence}</div>
                </div>
                <ul className="space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="size-4 text-primary mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full font-medium"
                  variant={chosen === p.code ? "default" : p.highlight ? "default" : "outline"}
                  disabled={busy === p.code || verifying}
                  onClick={() => void checkout(p.code, p.name)}
                >
                  <CreditCard className="size-4 mr-1.5" />{" "}
                  {busy === p.code
                    ? "Redirecting to checkout…"
                    : `Pay ${formatGhs(p.amountGhs)} (MoMo / Card)`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Payment is processed securely. All prices in Ghana Cedis (GHS). Automatic receipts are
          sent to your registered email.
        </p>
      </div>
    </AppShell>
  );
}
