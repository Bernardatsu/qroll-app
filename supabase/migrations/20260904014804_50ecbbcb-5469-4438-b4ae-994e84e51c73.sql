CREATE OR REPLACE FUNCTION public.portal_options(_token text)
RETURNS TABLE(kind text, id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE link record;
BEGIN
  SELECT * INTO link FROM public.student_portal_links WHERE token = _token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive link'; END IF;

  RETURN QUERY
    SELECT 'level'::text, cl.id, cl.name FROM public.class_levels cl WHERE cl.owner_id = link.owner_id
    UNION ALL
    SELECT 'level'::text, NULL::uuid, DISTINCT_LEVELS.level
      FROM (SELECT DISTINCT s.level FROM public.students s WHERE s.owner_id = link.owner_id AND COALESCE(s.level,'') <> '') AS DISTINCT_LEVELS(level)
    UNION ALL
    SELECT 'department'::text, d.id, d.name FROM public.departments d WHERE d.owner_id = link.owner_id;
END $$;

REVOKE ALL ON FUNCTION public.portal_options(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_options(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_register(
  _token text,
  _full_name text,
  _index text,
  _email text,
  _level text,
  _department_id uuid DEFAULT NULL,
  _program text DEFAULT NULL
)
RETURNS TABLE(full_name text, index_number text, level text, department text, qr_uuid text, pin text, existed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE link record; stu record; was boolean := false;
BEGIN
  SELECT * INTO link FROM public.student_portal_links WHERE token = _token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive link'; END IF;

  IF btrim(COALESCE(_full_name,'')) = '' OR btrim(COALESCE(_index,'')) = ''
     OR btrim(COALESCE(_email,'')) = '' OR btrim(COALESCE(_level,'')) = '' THEN
    RAISE EXCEPTION 'All fields are required';
  END IF;

  SELECT s.* INTO stu FROM public.students s
   WHERE s.owner_id = link.owner_id AND LOWER(s.index_number) = LOWER(btrim(_index)) LIMIT 1;

  IF FOUND THEN
    was := true;
  ELSE
    INSERT INTO public.students(owner_id, full_name, index_number, email, level, department_id, program, status)
    VALUES (link.owner_id, btrim(_full_name), btrim(_index), LOWER(btrim(_email)), btrim(_level), _department_id, NULLIF(btrim(COALESCE(_program,'')),''), 'active')
    RETURNING * INTO stu;
  END IF;

  RETURN QUERY
    SELECT stu.full_name, stu.index_number, stu.level,
           COALESCE((SELECT d.name FROM public.departments d WHERE d.id = stu.department_id), COALESCE(stu.program,'—')),
           stu.qr_uuid::text, stu.pin, was;
END $$;

REVOKE ALL ON FUNCTION public.portal_register(text,text,text,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_register(text,text,text,text,text,uuid,text) TO anon, authenticated;