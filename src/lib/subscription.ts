import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionState = {
  planCode: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  provider: "stripe" | "paystack" | null;
  currency: "GHS" | "USD";
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
  daysRemaining: number;
};

export type Plan = {
  code: string;
  name: string;
  description: string | null;
  price_ghs: number;
  price_usd: number;
  interval: "month" | "year" | "trial";
  trial_days: number;
  features: string[];
  sort_order: number;
};

export function useSubscription() {
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("my_subscription");
    const row = (data as any[] | null)?.[0];
    if (!row) {
      setSub(null);
    } else {
      setSub({
        planCode: row.plan_code,
        status: row.status,
        provider: row.provider,
        currency: row.currency,
        trialEndsAt: row.trial_ends_at,
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        isActive: row.is_active,
        daysRemaining: row.days_remaining,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { sub, loading, refresh };
}

export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setPlans((data as any) ?? []));
  }, []);
  return plans;
}

export function formatMoney(minor: number, currency: "GHS" | "USD") {
  const value = minor / 100;
  return currency === "GHS"
    ? `GHS ${value.toFixed(0)}`
    : `$${value.toFixed(0)}`;
}
