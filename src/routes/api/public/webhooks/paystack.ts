import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Paystack webhook. Verifies the HMAC-SHA512 signature Paystack sends in
 * x-paystack-signature, then records the payment and updates the subscription.
 */
export const Route = createFileRoute("/api/public/webhooks/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"] ?? process.env["STRIPE_TEST_API_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";
        const expected = createHmac("sha512", secret).update(raw).digest("hex");
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(raw) as {
          event: string;
          data?: {
            reference?: string;
            amount?: number;
            currency?: string;
            customer?: { customer_code?: string; email?: string };
            metadata?: { owner_id?: string; plan_code?: string };
          };
        };

        const ownerId = event.data?.metadata?.owner_id;
        const planCode = event.data?.metadata?.plan_code ?? "monthly";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let subscriptionId: string | null = null;

        if (ownerId && (event.event === "charge.success" || event.event === "subscription.create")) {
          const months = planCode === "yearly" ? 12 : planCode === "semester" ? 4 : 1;
          const periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + months);

          const { data: existing } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .eq("owner_id", ownerId)
            .maybeSingle();

          const payload = {
            owner_id: ownerId,
            plan_code: planCode,
            status: "active",
            provider: "paystack",
            provider_ref: event.data?.reference ?? null,
            provider_customer: event.data?.customer?.customer_code ?? null,
            currency: event.data?.currency ?? "USD",
            current_period_end: periodEnd.toISOString(),
            cancel_at_period_end: false,
          };

          const { data: saved } = existing
            ? await supabaseAdmin.from("subscriptions").update(payload).eq("id", existing.id).select("id").maybeSingle()
            : await supabaseAdmin.from("subscriptions").insert(payload).select("id").maybeSingle();
          subscriptionId = saved?.id ?? existing?.id ?? null;
        }

        if (ownerId && (event.event === "subscription.disable" || event.event === "invoice.payment_failed")) {
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: event.event === "subscription.disable" ? "canceled" : "past_due" })
            .eq("owner_id", ownerId);
        }

        await supabaseAdmin.from("payment_events").insert({
          subscription_id: subscriptionId,
          owner_id: ownerId ?? null,
          provider: "paystack",
          event_type: event.event,
          amount: event.data?.amount ?? null,
          currency: event.data?.currency ?? null,
          raw: event as never,
        });

        return new Response("ok");
      },
    },
  },
});
