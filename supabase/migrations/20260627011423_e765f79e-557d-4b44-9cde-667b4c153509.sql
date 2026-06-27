CREATE SCHEMA IF NOT EXISTS app_private;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'admin', 'lecturer', 'teaching_assistant')
  )
$$;

REVOKE EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION app_private.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION app_private.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_staff(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Staff read departments" ON public.departments;
DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Staff read departments" ON public.departments FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "Admins manage departments" ON public.departments FOR ALL TO authenticated USING (app_private.is_admin(auth.uid())) WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff read years" ON public.academic_years;
DROP POLICY IF EXISTS "Admins manage years" ON public.academic_years;
CREATE POLICY "Staff read years" ON public.academic_years FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "Admins manage years" ON public.academic_years FOR ALL TO authenticated USING (app_private.is_admin(auth.uid())) WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff read students" ON public.students;
DROP POLICY IF EXISTS "Admins manage students" ON public.students;
CREATE POLICY "Staff read students" ON public.students FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "Admins manage students" ON public.students FOR ALL TO authenticated USING (app_private.is_admin(auth.uid())) WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff read courses" ON public.courses;
DROP POLICY IF EXISTS "Admins manage courses" ON public.courses;
CREATE POLICY "Staff read courses" ON public.courses FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "Admins manage courses" ON public.courses FOR ALL TO authenticated USING (app_private.is_admin(auth.uid())) WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff read regs" ON public.course_registrations;
DROP POLICY IF EXISTS "Admins manage regs" ON public.course_registrations;
CREATE POLICY "Staff read regs" ON public.course_registrations FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "Admins manage regs" ON public.course_registrations FOR ALL TO authenticated USING (app_private.is_admin(auth.uid())) WITH CHECK (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff read sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Staff create sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Admins update sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "Admins delete sessions" ON public.attendance_sessions;
CREATE POLICY "Staff read sessions" ON public.attendance_sessions FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "Staff create sessions" ON public.attendance_sessions FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "Admins update sessions" ON public.attendance_sessions FOR UPDATE TO authenticated USING (app_private.is_admin(auth.uid()) OR created_by = auth.uid());
CREATE POLICY "Admins delete sessions" ON public.attendance_sessions FOR DELETE TO authenticated USING (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff read attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Staff insert attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Staff update attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Admins delete attendance" ON public.attendance_records;
CREATE POLICY "Staff read attendance" ON public.attendance_records FOR SELECT TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "Staff insert attendance" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()));
CREATE POLICY "Staff update attendance" ON public.attendance_records FOR UPDATE TO authenticated USING (app_private.is_staff(auth.uid()));
CREATE POLICY "Admins delete attendance" ON public.attendance_records FOR DELETE TO authenticated USING (app_private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins read logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Staff write logs" ON public.audit_logs;
CREATE POLICY "Admins read logs" ON public.audit_logs FOR SELECT TO authenticated USING (app_private.is_admin(auth.uid()));
CREATE POLICY "Staff write logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (app_private.is_staff(auth.uid()) AND user_id = auth.uid());