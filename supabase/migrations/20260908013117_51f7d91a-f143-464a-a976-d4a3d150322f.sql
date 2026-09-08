CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  submission_url text,
  levels text[] NOT NULL DEFAULT '{}',
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage their assignments" ON public.assignments
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER trg_assignments_updated
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_assignments_owner ON public.assignments(owner_id);
CREATE INDEX idx_assignments_course ON public.assignments(course_id);

CREATE OR REPLACE FUNCTION public.student_assignments(_index text, _password text)
RETURNS TABLE(id uuid, title text, details text, submission_url text, course_code text, due_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  with me as (
    select s.id, s.level from public.students s
    where lower(s.index_number) = lower(trim(_index))
      and s.password_hash is not null
      and s.password_hash = extensions.crypt(_password, s.password_hash)
  ),
  my_owners as (
    select distinct c.owner_id, c.id as course_id
    from me
    join public.course_registrations cr on cr.student_id = me.id
    join public.courses c on c.id = cr.course_id
  )
  select distinct a.id, a.title, a.details, a.submission_url, c.code, a.due_at
  from public.assignments a
  join my_owners o on o.owner_id = a.owner_id
  left join public.courses c on c.id = a.course_id
  cross join me
  where (a.course_id is null or a.course_id = o.course_id)
    and (cardinality(a.levels) = 0 or me.level = any(a.levels))
  order by a.due_at nulls last
  limit 100
$$;

REVOKE ALL ON FUNCTION public.student_assignments(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_assignments(text, text) TO anon, authenticated;