CREATE TABLE IF NOT EXISTS public.class_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_levels TO authenticated;
GRANT ALL ON public.class_levels TO service_role;

ALTER TABLE public.class_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their class levels"
ON public.class_levels FOR ALL TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER update_class_levels_updated_at
BEFORE UPDATE ON public.class_levels
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'single';