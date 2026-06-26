
-- Tighten is_staff to explicit staff-role allowlist (future-proof)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admin','lecturer','teaching_assistant')
  )
$$;

-- Revoke direct EXECUTE on SECURITY DEFINER helper functions from API roles.
-- They remain callable from RLS policies (policy evaluation uses the function
-- owner's privileges) but can no longer be invoked as RPC by anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
