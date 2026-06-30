
-- =========================================================
-- Phase A: Per-lecturer ownership + PIN + Portal + Self check-in
-- =========================================================

-- 1. owner_id on all owned tables
ALTER TABLE public.departments       ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.academic_years    ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.students          ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.courses           ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. PIN on students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pin text;

-- 3. Backfill owner_id to first super_admin (or first user if none)
DO $$
DECLARE first_admin uuid;
BEGIN
  SELECT user_id INTO first_admin FROM public.user_roles WHERE role = 'super_admin' ORDER BY created_at LIMIT 1;
  IF first_admin IS NULL THEN
    SELECT id INTO first_admin FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;
  IF first_admin IS NOT NULL THEN
    UPDATE public.departments       SET owner_id = first_admin WHERE owner_id IS NULL;
    UPDATE public.academic_years    SET owner_id = first_admin WHERE owner_id IS NULL;
    UPDATE public.students          SET owner_id = first_admin WHERE owner_id IS NULL;
    UPDATE public.courses           SET owner_id = first_admin WHERE owner_id IS NULL;
    UPDATE public.attendance_sessions SET owner_id = first_admin WHERE owner_id IS NULL;
  END IF;
END $$;

-- 4. Backfill PINs for existing students (random 4-digit)
UPDATE public.students SET pin = LPAD((floor(random()*10000))::int::text, 4, '0') WHERE pin IS NULL;

-- 5. Auto-assign owner_id and PIN on insert
CREATE OR REPLACE FUNCTION public.set_owner_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN NEW.owner_id := auth.uid(); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_student_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN NEW.owner_id := auth.uid(); END IF;
  IF NEW.pin IS NULL OR NEW.pin = '' THEN NEW.pin := LPAD((floor(random()*10000))::int::text, 4, '0'); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_owner_departments ON public.departments;
CREATE TRIGGER trg_owner_departments BEFORE INSERT ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();
DROP TRIGGER IF EXISTS trg_owner_academic_years ON public.academic_years;
CREATE TRIGGER trg_owner_academic_years BEFORE INSERT ON public.academic_years FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();
DROP TRIGGER IF EXISTS trg_owner_courses ON public.courses;
CREATE TRIGGER trg_owner_courses BEFORE INSERT ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();
DROP TRIGGER IF EXISTS trg_owner_sessions ON public.attendance_sessions;
CREATE TRIGGER trg_owner_sessions BEFORE INSERT ON public.attendance_sessions FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();
DROP TRIGGER IF EXISTS trg_student_defaults ON public.students;
CREATE TRIGGER trg_student_defaults BEFORE INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_student_defaults();

-- 6. Make owner_id NOT NULL now that everything is backfilled and triggered
ALTER TABLE public.departments       ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.academic_years    ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.students          ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.courses           ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.attendance_sessions ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.students          ALTER COLUMN pin SET NOT NULL;

-- 7. Replace RLS policies with owner-scoped ones
DO $$
DECLARE pol record; tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['departments','academic_years','students','courses','attendance_sessions','course_registrations','attendance_records']
  LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tbl
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl); END LOOP;
  END LOOP;
END $$;

-- Owner-scoped policies
CREATE POLICY "own_departments"    ON public.departments    FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own_academic_years" ON public.academic_years FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own_students"       ON public.students       FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own_courses"        ON public.courses        FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own_sessions"       ON public.attendance_sessions FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "own_course_registrations" ON public.course_registrations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.owner_id = auth.uid()));

CREATE POLICY "own_attendance_records" ON public.attendance_records FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.attendance_sessions s WHERE s.id = session_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.attendance_sessions s WHERE s.id = session_id AND s.owner_id = auth.uid()));

-- 8. Unique attendance per (session,student) to prevent duplicates from self check-in
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_session_student ON public.attendance_records(session_id, student_id);

-- 9. Auto-grant super_admin role on signup so every signup is a self-contained "master admin"
CREATE OR REPLACE FUNCTION public.grant_admin_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_grant_admin ON auth.users;
CREATE TRIGGER trg_grant_admin AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_admin_on_signup();

-- 10. Student Portal links table
CREATE TABLE IF NOT EXISTS public.student_portal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_portal_links TO authenticated;
GRANT ALL ON public.student_portal_links TO service_role;
ALTER TABLE public.student_portal_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_portal_links" ON public.student_portal_links FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP TRIGGER IF EXISTS trg_owner_portal ON public.student_portal_links;
CREATE TRIGGER trg_owner_portal BEFORE INSERT ON public.student_portal_links FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

-- 11. Public RPC: portal_lookup — student retrieves their own QR via shareable link
CREATE OR REPLACE FUNCTION public.portal_lookup(_token text, _index text, _email text)
RETURNS TABLE(full_name text, index_number text, level text, department text, qr_uuid text, pin text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE link record;
BEGIN
  SELECT * INTO link FROM public.student_portal_links WHERE token = _token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive link'; END IF;
  RETURN QUERY
    SELECT s.full_name, s.index_number, s.level::text, COALESCE(d.name, '—'), s.qr_uuid::text, s.pin
    FROM public.students s
    LEFT JOIN public.departments d ON d.id = s.department_id
    INNER JOIN public.course_registrations cr ON cr.student_id = s.id AND cr.course_id = link.course_id
    WHERE LOWER(s.index_number) = LOWER(_index)
      AND LOWER(COALESCE(s.email, '')) = LOWER(_email)
      AND s.owner_id = link.owner_id
    LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.portal_lookup(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_lookup(text,text,text) TO anon, authenticated;

-- 12. Public RPC: self_checkin — student marks themselves present
CREATE OR REPLACE FUNCTION public.self_checkin(_session_id uuid, _index text, _pin text)
RETURNS TABLE(ok boolean, message text, student_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sess record; stu record;
BEGIN
  SELECT * INTO sess FROM public.attendance_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Session not found', ''::text; RETURN; END IF;
  IF sess.status <> 'open' THEN RETURN QUERY SELECT false, 'Session is closed', ''::text; RETURN; END IF;

  SELECT s.* INTO stu FROM public.students s
    WHERE LOWER(s.index_number) = LOWER(_index) AND s.owner_id = sess.owner_id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Invalid details', ''::text; RETURN; END IF;
  IF stu.pin IS DISTINCT FROM _pin THEN RETURN QUERY SELECT false, 'Invalid details', ''::text; RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.course_registrations
                 WHERE course_id = sess.course_id AND student_id = stu.id) THEN
    INSERT INTO public.course_registrations(course_id, student_id) VALUES (sess.course_id, stu.id);
  END IF;

  INSERT INTO public.attendance_records(session_id, student_id, status, check_in_at, source)
    VALUES (_session_id, stu.id, 'present', now(), 'self')
    ON CONFLICT (session_id, student_id) DO NOTHING;

  RETURN QUERY SELECT true, 'Marked present', stu.full_name;
END $$;
REVOKE ALL ON FUNCTION public.self_checkin(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_checkin(uuid,text,text) TO anon, authenticated;

-- 13. attendance_records.source column to distinguish manual scanner vs self check-in
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'scanner';
