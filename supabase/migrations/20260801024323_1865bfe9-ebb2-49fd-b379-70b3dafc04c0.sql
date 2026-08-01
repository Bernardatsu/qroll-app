ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS session_date date;

UPDATE public.attendance_records
SET session_date = COALESCE(check_in_at, created_at)::date
WHERE session_date IS NULL;

ALTER TABLE public.attendance_records
  ALTER COLUMN session_date SET DEFAULT CURRENT_DATE;

ALTER TABLE public.attendance_records
  ALTER COLUMN session_date SET NOT NULL;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_session_id_student_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_session_student_day_key
  ON public.attendance_records (session_id, student_id, session_date);