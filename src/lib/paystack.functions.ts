import { createServerFn } from "@tanstack/react-start";
import { PAYMENTS_LIVE, PLANS, type PlanCode } from "@/lib/billing";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";

const PAYSTACK_LIVE_SECRET = "sk_live_44b99be16eb314c1643a8b3f7cd8294279ac9c46";

/**
 * Starts a Paystack checkout for the signed-in account.
 * Reads strictly from PAYSTACK_SECRET_KEY or the configured live key.
 */
export const startCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { plan: PlanCode; callbackUrl: string; userId?: string; email?: string }) => {
      if (!PLANS.some((p) => p.code === data.plan)) throw new Error("Unknown plan");
      if (!/^https?:\/\//.test(data.callbackUrl)) throw new Error("Invalid callback URL");
      if (!data.email) throw new Error("User email is required");
      return data;
    },
  )
  .handler(async ({ data }) => {
    if (!PAYMENTS_LIVE) {
      return { live: false as const, url: null, message: "Payments are not switched on yet." };
    }

    const secret = process.env["PAYSTACK_SECRET_KEY"] || PAYSTACK_LIVE_SECRET;
    if (!secret) throw new Error("Paystack secret key is not configured on the server");

    const plan = PLANS.find((p) => p.code === data.plan)!;

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.email,
        amount: Math.round(plan.amountGhs * 100), // in pesewas
        currency: "GHS",
        callback_url: data.callbackUrl,
        channels: ["mobile_money", "card"],
        metadata: {
          owner_id: data.userId || null,
          plan_code: plan.code,
          plan_name: plan.name,
          paystack_plan: plan.paystackPlanCode,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Paystack initialize failed [${res.status}]: ${body}`);
      throw new Error(`Paystack request failed [${res.status}]: ${body}`);
    }

    const json = (await res.json()) as {
      status: boolean;
      message: string;
      data?: { authorization_url: string; reference: string; access_code: string };
    };
    if (!json.status || !json.data?.authorization_url) {
      throw new Error(json.message || "Paystack did not return a checkout link");
    }

    return { live: true as const, url: json.data.authorization_url, message: "ok" };
  });

/**
 * Instant transaction verification after returning from Paystack checkout.
 */
export const verifyCheckout = createServerFn({ method: "POST" })
  .inputValidator((data: { reference: string; userId?: string }) => {
    if (!data.reference) throw new Error("Reference is required");
    return data;
  })
  .handler(async ({ data }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"] || PAYSTACK_LIVE_SECRET;
    if (!secret) throw new Error("Paystack secret key is not configured on the server");

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}` },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Paystack verification failed: ${body}`);
    }

    const json = (await res.json()) as {
      status: boolean;
      message: string;
      data?: {
        status: string;
        reference: string;
        amount: number;
        currency: string;
        customer?: { customer_code?: string; email?: string };
        metadata?: { owner_id?: string; plan_code?: string };
        plan_object?: { plan_code?: string };
      };
    };

    if (!json.status || json.data?.status !== "success") {
      return { success: false, status: json.data?.status || "failed" };
    }

    const ownerId = data.userId || json.data?.metadata?.owner_id;
    const planCode = (json.data?.metadata?.plan_code as PlanCode) || "monthly";

    if (ownerId) {
      const months = planCode === "yearly" ? 12 : planCode === "semester" ? 3 : 1;
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + months);

      const subQuery = await firestoreAdmin
        .collection("subscriptions")
        .where("owner_id", "==", ownerId)
        .limit(1)
        .get();

      const payload = {
        owner_id: ownerId,
        plan_code: planCode,
        status: "active",
        provider: "paystack",
        provider_ref: json.data.reference,
        provider_customer: json.data.customer?.customer_code ?? null,
        currency: json.data.currency || "GHS",
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      };

      if (!subQuery.empty) {
        await subQuery.docs[0].ref.update(payload);
      } else {
        await firestoreAdmin.collection("subscriptions").add({
          ...payload,
          created_at: new Date().toISOString(),
        });
      }
    }

    return { success: true, planCode };
  });
