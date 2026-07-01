
ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS radius_m integer NOT NULL DEFAULT 150;

-- Portal lookup: match by owner of the link, no course-registration requirement
CREATE OR REPLACE FUNCTION public.portal_lookup(_token text, _index text, _email text)
 RETURNS TABLE(full_name text, index_number text, level text, department text, qr_uuid text, pin text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE link record;
BEGIN
  SELECT * INTO link FROM public.student_portal_links WHERE token = _token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive link'; END IF;
  RETURN QUERY
    SELECT s.full_name, s.index_number, s.level::text, COALESCE(d.name, '—'),
           s.qr_uuid::text, s.pin
    FROM public.students s
    LEFT JOIN public.departments d ON d.id = s.department_id
    WHERE LOWER(s.index_number) = LOWER(_index)
      AND LOWER(COALESCE(s.email, '')) = LOWER(_email)
      AND s.owner_id = link.owner_id
    LIMIT 1;
END $function$;

-- GPS self check-in — verifies student is within radius of the session location
CREATE OR REPLACE FUNCTION public.self_checkin_geo(_session_id uuid, _index text, _lat double precision, _lng double precision)
 RETURNS TABLE(ok boolean, message text, student_name text, distance_m integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sess record; stu record; dist double precision;
BEGIN
  SELECT * INTO sess FROM public.attendance_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'Session not found',''::text,0; RETURN; END IF;
  IF sess.status <> 'OPEN' THEN RETURN QUERY SELECT false,'Session is closed',''::text,0; RETURN; END IF;
  IF sess.latitude IS NULL OR sess.longitude IS NULL THEN
    RETURN QUERY SELECT false,'Lecturer has not set the class location',''::text,0; RETURN;
  END IF;

  SELECT s.* INTO stu FROM public.students s
    WHERE LOWER(s.index_number) = LOWER(_index) AND s.owner_id = sess.owner_id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT false,'Index number not recognized',''::text,0; RETURN; END IF;

  -- Haversine (meters)
  dist := 2 * 6371000 * asin(sqrt(
     power(sin(radians((_lat - sess.latitude)/2)), 2) +
     cos(radians(sess.latitude)) * cos(radians(_lat)) *
     power(sin(radians((_lng - sess.longitude)/2)), 2)
  ));

  IF dist > sess.radius_m THEN
    RETURN QUERY SELECT false, format('You appear to be %s m away from the classroom. Get closer and try again.', round(dist)::int), stu.full_name, round(dist)::int;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.course_registrations
                 WHERE course_id = sess.course_id AND student_id = stu.id) THEN
    INSERT INTO public.course_registrations(course_id, student_id) VALUES (sess.course_id, stu.id);
  END IF;

  INSERT INTO public.attendance_records(session_id, student_id, status, check_in_at, source)
    VALUES (_session_id, stu.id, 'PRESENT', now(), 'self')
    ON CONFLICT (session_id, student_id) DO NOTHING;

  RETURN QUERY SELECT true, 'Marked present', stu.full_name, round(dist)::int;
END $function$;

REVOKE ALL ON FUNCTION public.self_checkin_geo(uuid, text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_checkin_geo(uuid, text, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_lookup(text, text, text) TO anon, authenticated;
