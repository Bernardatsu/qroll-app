-- Temporary: lift the 14-day trial limit until premium billing is ready.
-- Extends every existing user's access, and makes new signups get the same.
-- To revert later: shorten the intervals below back to 14 days in both places.

UPDATE public.subscriptions
SET trial_ends_at = now() + interval '10 years',
    current_period_end = now() + interval '10 years'
WHERE status IN ('trialing', 'expired', 'past_due');

UPDATE public.subscription_plans
SET trial_days = 3650
WHERE code = 'trial';

CREATE OR REPLACE FUNCTION public.start_trial_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.subscriptions(owner_id, plan_code, status, trial_ends_at, current_period_end)
  VALUES (NEW.id, 'trial', 'trialing', now() + interval '10 years', now() + interval '10 years')
  ON CONFLICT (owner_id) DO NOTHING;
  RETURN NEW;
END $$;
