This work is too large for one turn. I'll ship it in 4 phases so you can test after each. Reply "go" to start Phase 1, or edit any phase first.

---

## Phase 1 — Quick wins (this turn)

**Nav polish (item 3).** Rework the sidebar footer so Manual / Terms / Privacy are a proper section with icons, dividers and hover states — visible on both desktop and mobile. Add a matching footer on the public landing, `/portal/*` and `/check-in` pages so students see the legal links too.

**Google + email linking (item 1).** Configure the Supabase auth setting `manual_linking_enabled` so a lecturer who already has a password account can add Google as a second identity. Flow on the Auth page:
- Sign in with password.
- New "Connected accounts" card in a small `/settings` page shows "Link Google" button. Clicking it calls `supabase.auth.linkIdentity('google')` (via the Lovable broker) → same profile, both sign-in methods work forever after.
- If someone clicks "Continue with Google" first and the email already exists as a password account, we show a toast: *"An account exists for this email. Sign in with your password first, then link Google from Settings."* — matches your chosen "Ask for password first, then link" policy.

---

## Phase 2 — Subscription foundation

**Data model (one migration).**
```
subscription_plans(id, code, name, price_ghs, price_usd, interval, features[], trial_days=14)
subscriptions(id, owner_id, plan_code, status: trialing|active|past_due|canceled|expired,
              provider: stripe|paystack, provider_ref, current_period_end,
              trial_ends_at, created_at, updated_at)
payment_events(id, subscription_id, provider, event_type, raw jsonb, created_at)
```
RLS: owner reads own subscription; service role writes from webhooks.

**Plan (single Pro tier).**
- **Free trial** — 14 days, full features, auto-starts on first sign-in via trigger.
- **Pro Monthly** — GHS 80 / USD 8 (Stripe cards + Paystack MoMo).
- **Pro Yearly** — GHS 800 / USD 80 (17% off).

**Gating helper.** `useSubscription()` hook + `<RequirePro>` wrapper. When trial expires and no active sub, dashboard shows a soft paywall banner and disables *create session*, *import students*, and *generate portal link*. Read-only (reports, existing students) stays open so nothing gets lost.

**Billing page** `/billing` — current plan, trial countdown, "Upgrade" buttons per provider, invoice history.

---

## Phase 3 — Payment providers

**Stripe (seamless via Lovable, no key needed from you).**
- `enable_stripe_payments` + `batch_create_product` for Monthly / Yearly.
- Server route `/api/public/webhooks/stripe` — verifies signature, upserts `subscriptions` row on `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated|deleted`.
- Checkout via `createServerFn` → returns hosted Stripe URL.

**Paystack (needs your secret key).** I'll request `PAYSTACK_SECRET_KEY` via the secure form.
- Server route `/api/public/webhooks/paystack` — HMAC verification with same secret, upserts subscription rows.
- Checkout via `createServerFn` calling Paystack `/transaction/initialize` with MoMo channels enabled → returns hosted URL.
- Uses the same `subscriptions` table so gating is provider-agnostic.

**Test mode first.** Both start in sandbox; you claim/verify each account when ready to accept live money.

---

## Phase 4 — Commercial hardening

Ship in this order (each is a small standalone change):

1. **Auth & abuse.**
   - `/auth/forgot-password` + `/auth/reset-password` pages.
   - Email verification on signup (Supabase `auto_confirm_email = false`).
   - Enable `password_hibp_enabled` (blocks leaked passwords).
   - Rate limits: portal lookup ≤ 6 / min per IP; self check-in ≤ 4 / min per index number — enforced in the RPC with a small `rate_limits(key, count, window_start)` table.

2. **Compliance & data rights.**
   - `/settings/data` — "Download my data" (JSON export of students + sessions + attendance) and "Delete my account" (cascades all owned rows, revokes auth user via edge fn).
   - Surface the existing `audit_logs` table as a viewer at `/settings/audit`.
   - Add Ghana Data Protection Act 843 reference to Privacy page.

3. **In-app onboarding tour.**
   - First-run modal + 5-step spotlight using `driver.js` (5 KB) on Dashboard → Departments → Students → Sessions → Portal Link.
   - Empty-state cards on each list page with the exact next action + "Watch 30-sec demo" link.

4. **Branding & notifications.**
   - New table `institution_branding(owner_id, logo_url, primary_color, accent_color)` — appears on the portal page.
   - Transactional emails via Resend (I'll request `RESEND_API_KEY`): welcome email, session-opened summary (opt-in), weekly attendance digest.

---

## Estimate
- Phase 1: 1 turn
- Phase 2: 1 turn
- Phase 3: 2 turns (Stripe, then Paystack)
- Phase 4: 4 turns (one per bundle)

Reply **"go"** to start Phase 1, or tell me what to change.