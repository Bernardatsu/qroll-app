import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";

/**
 * Paystack webhook. Verifies the HMAC-SHA512 signature Paystack sends in
 * x-paystack-signature, then records the payment and updates the subscription in Firestore.
 */
export const Route = createFileRoute("/api/public/webhooks/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"];
        if (!secret) {
          return new Response("Paystack secret key is not configured on the server", {
            status: 503,
          });
        }

        const raw = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";
        if (!signature) {
          return new Response("Missing signature header", { status: 400 });
        }

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
        let subscriptionId: string | null = null;

        if (
          ownerId &&
          (event.event === "charge.success" || event.event === "subscription.create")
        ) {
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
            provider_ref: event.data?.reference ?? null,
            provider_customer: event.data?.customer?.customer_code ?? null,
            currency: event.data?.currency ?? "USD",
            current_period_end: periodEnd.toISOString(),
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          };

          if (!subQuery.empty) {
            const existingDoc = subQuery.docs[0];
            await existingDoc.ref.update(payload);
            subscriptionId = existingDoc.id;
          } else {
            const newDoc = await firestoreAdmin.collection("subscriptions").add({
              ...payload,
              created_at: new Date().toISOString(),
            });
            subscriptionId = newDoc.id;
          }
        }

        if (
          ownerId &&
          (event.event === "subscription.disable" || event.event === "invoice.payment_failed")
        ) {
          const subQuery = await firestoreAdmin
            .collection("subscriptions")
            .where("owner_id", "==", ownerId)
            .limit(1)
            .get();

          if (!subQuery.empty) {
            await subQuery.docs[0].ref.update({
              status: event.event === "subscription.disable" ? "canceled" : "past_due",
              updated_at: new Date().toISOString(),
            });
          }
        }

        await firestoreAdmin.collection("payment_events").add({
          subscription_id: subscriptionId,
          owner_id: ownerId ?? null,
          provider: "paystack",
          event_type: event.event,
          amount: event.data?.amount ?? null,
          currency: event.data?.currency ?? null,
          raw: event,
          created_at: new Date().toISOString(),
        });

        return new Response("ok");
      },
    },
  },
});
