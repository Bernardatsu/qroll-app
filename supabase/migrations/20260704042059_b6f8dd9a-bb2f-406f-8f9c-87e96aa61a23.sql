CREATE OR REPLACE FUNCTION public.portal_courses(_token text)
RETURNS TABLE(id uuid, code text, title text, level text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE link record;
BEGIN
  SELECT * INTO link FROM public.student_portal_links WHERE token = _token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive link'; END IF;
  RETURN QUERY
    SELECT c.id, c.code, c.title, c.level::text
    FROM public.courses c
    WHERE c.owner_id = link.owner_id AND c.archived = false
    ORDER BY c.code;
END $$;

GRANT EXECUTE ON FUNCTION public.portal_courses(text) TO anon, authenticated;