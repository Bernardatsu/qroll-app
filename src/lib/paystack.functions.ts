import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAYMENTS_LIVE, PLANS, type PlanCode } from "@/lib/billing";

/**
 * Starts a Paystack checkout for the signed-in account.
 *
 * The Paystack secret key is read from PAYSTACK_SECRET_KEY, falling back to the
 * test key currently stored as STRIPE_TEST_API_KEY. Swapping in the live key
 * later needs no code change.
 */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { plan: PlanCode; callbackUrl: string }) => {
    if (!PLANS.some((p) => p.code === data.plan)) throw new Error("Unknown plan");
    if (!/^https?:\/\//.test(data.callbackUrl)) throw new Error("Invalid callback URL");
    return data;
  })
  .handler(async ({ data, context }) => {
    if (!PAYMENTS_LIVE) {
      return { live: false as const, url: null, message: "Payments are not switched on yet." };
    }

    const secret = process.env["PAYSTACK_SECRET_KEY"] ?? process.env["STRIPE_TEST_API_KEY"];
    if (!secret) throw new Error("Paystack secret key is not configured");

    const plan = PLANS.find((p) => p.code === data.plan)!;
    const email = context.claims?.email as string | undefined;
    if (!email) throw new Error("No email on the signed-in account");

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: plan.usd * 100,
        currency: "USD",
        callback_url: data.callbackUrl,
        channels: ["card", "mobile_money", "bank", "bank_transfer", "ussd"],
        metadata: { owner_id: context.userId, plan_code: plan.code },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Paystack initialize failed [${res.status}]: ${body}`);
      throw new Error(`Paystack request failed [${res.status}]: ${body}`);
    }

    const json = (await res.json()) as { status: boolean; message: string; data?: { authorization_url: string } };
    if (!json.status || !json.data?.authorization_url) throw new Error(json.message || "Paystack did not return a checkout link");

    return { live: true as const, url: json.data.authorization_url, message: "ok" };
  });
