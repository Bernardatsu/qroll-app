CREATE TABLE public.academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  year_name text NOT NULL,
  semester public.semester_name NOT NULL,
  starts_on date,
  ends_on date,
  is_current boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, year_name, semester)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_terms TO authenticated;
GRANT ALL ON public.academic_terms TO service_role;

ALTER TABLE public.academic_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_academic_terms ON public.academic_terms
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER trg_academic_terms_updated
  BEFORE UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.courses ADD COLUMN term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL;
CREATE INDEX idx_courses_term ON public.courses(term_id);
CREATE INDEX idx_academic_terms_owner ON public.academic_terms(owner_id);

-- Lock courses that belong to an archived term
CREATE OR REPLACE FUNCTION public.block_archived_term_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.academic_terms
   WHERE id = COALESCE(OLD.term_id, NEW.term_id);
  IF FOUND AND t.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This semester is archived and locked.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_courses_archived_lock
  BEFORE UPDATE OR DELETE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.block_archived_term_changes();