-- Allow arbitrary levels beyond 100-400 by switching from enum to text
ALTER TABLE public.students ALTER COLUMN level TYPE text USING level::text;
ALTER TABLE public.courses  ALTER COLUMN level TYPE text USING level::text;

-- Update RPCs that returned/used the enum (recreate with text)
CREATE OR REPLACE FUNCTION public.portal_courses(_token text)
 RETURNS TABLE(id uuid, code text, title text, level text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE link record;
BEGIN
  SELECT * INTO link FROM public.student_portal_links WHERE token = _token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive link'; END IF;
  RETURN QUERY
    SELECT c.id, c.code, c.title, c.level
    FROM public.courses c
    WHERE c.owner_id = link.owner_id AND c.archived = false
    ORDER BY c.code;
END $function$;

CREATE OR REPLACE FUNCTION public.portal_lookup(_token text, _index text, _email text)
 RETURNS TABLE(full_name text, index_number text, level text, department text, qr_uuid text, pin text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE link record;
BEGIN
  SELECT * INTO link FROM public.student_portal_links WHERE token = _token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive link'; END IF;
  RETURN QUERY
    SELECT s.full_name, s.index_number, s.level, COALESCE(d.name, '—'),
           s.qr_uuid::text, s.pin
    FROM public.students s
    LEFT JOIN public.departments d ON d.id = s.department_id
    WHERE LOWER(s.index_number) = LOWER(_index)
      AND LOWER(COALESCE(s.email, '')) = LOWER(_email)
      AND s.owner_id = link.owner_id
    LIMIT 1;
END $function$;

DROP TYPE IF EXISTS public.student_level;