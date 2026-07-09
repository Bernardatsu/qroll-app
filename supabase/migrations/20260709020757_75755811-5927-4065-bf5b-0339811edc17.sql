
-- ============ subscription_plans ============
CREATE TABLE public.subscription_plans (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  description     text,
  price_ghs       integer NOT NULL DEFAULT 0,     -- in pesewas (GHS * 100)
  price_usd       integer NOT NULL DEFAULT 0,     -- in cents (USD * 100)
  interval        text NOT NULL CHECK (interval IN ('month','year','trial')),
  trial_days      integer NOT NULL DEFAULT 0,
  features        jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans are public" ON public.subscription_plans FOR SELECT USING (true);

INSERT INTO public.subscription_plans(code,name,description,price_ghs,price_usd,interval,trial_days,features,sort_order) VALUES
 ('trial','Free Trial','Full access for 14 days',0,0,'trial',14,
   '["Unlimited courses","Unlimited students","QR + geofence attendance","Reports & exports","Student QR portal"]'::jsonb,1),
 ('pro_month','Pro (Monthly)','Everything unlocked, billed monthly',8000,800,'month',0,
   '["Unlimited courses","Unlimited students","QR + geofence attendance","Reports & exports","Student QR portal","Priority support"]'::jsonb,2),
 ('pro_year','Pro (Yearly)','Save 17% with annual billing',80000,8000,'year',0,
   '["Unlimited courses","Unlimited students","QR + geofence attendance","Reports & exports","Student QR portal","Priority support","2 months free"]'::jsonb,3);

-- ============ subscriptions ============
CREATE TABLE public.subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan_code           text NOT NULL REFERENCES public.subscription_plans(code),
  status              text NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  provider            text CHECK (provider IN ('stripe','paystack')),
  provider_customer   text,
  provider_ref        text,
  currency            text NOT NULL DEFAULT 'GHS' CHECK (currency IN ('GHS','USD')),
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read own subscription" ON public.subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-start a 14-day trial for every new user
CREATE OR REPLACE FUNCTION public.start_trial_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.subscriptions(owner_id, plan_code, status, trial_ends_at, current_period_end)
  VALUES (NEW.id, 'trial', 'trialing', now() + interval '14 days', now() + interval '14 days')
  ON CONFLICT (owner_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_start_trial ON auth.users;
CREATE TRIGGER on_auth_user_created_start_trial
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.start_trial_on_signup();

-- Backfill trials for existing users
INSERT INTO public.subscriptions(owner_id, plan_code, status, trial_ends_at, current_period_end)
SELECT u.id, 'trial', 'trialing', now() + interval '14 days', now() + interval '14 days'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.owner_id = u.id);

-- ============ payment_events ============
CREATE TABLE public.payment_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  owner_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider        text NOT NULL CHECK (provider IN ('stripe','paystack')),
  event_type      text NOT NULL,
  amount          integer,
  currency        text,
  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read own events" ON public.payment_events FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

-- Helper: current subscription state for the signed-in user
CREATE OR REPLACE FUNCTION public.my_subscription()
RETURNS TABLE(
  plan_code text, status text, provider text, currency text,
  trial_ends_at timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean, is_active boolean, days_remaining integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.plan_code, s.status, s.provider, s.currency,
         s.trial_ends_at, s.current_period_end, s.cancel_at_period_end,
         (s.status IN ('trialing','active')
           AND COALESCE(s.current_period_end, s.trial_ends_at, now()) > now()) AS is_active,
         GREATEST(0, EXTRACT(day FROM COALESCE(s.current_period_end, s.trial_ends_at, now()) - now())::int) AS days_remaining
  FROM public.subscriptions s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;
$$;
