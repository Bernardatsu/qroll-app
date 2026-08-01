CREATE OR REPLACE FUNCTION public.self_checkin_geo(_session_id uuid, _index text, _lat double precision, _lng double precision)
 RETURNS TABLE(ok boolean, message text, student_name text, distance_m integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE sess record; stu record; crs record; dist double precision;
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

  SELECT * INTO crs FROM public.courses WHERE id = sess.course_id;
  IF crs.level IS NOT NULL AND stu.level IS NOT NULL
     AND btrim(crs.level::text) <> '' AND btrim(crs.level::text) <> btrim(stu.level::text) THEN
    RETURN QUERY SELECT false,
      format('This class is for level %s students only.', crs.level), stu.full_name, 0;
    RETURN;
  END IF;

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

  INSERT INTO public.attendance_records(session_id, student_id, status, check_in_at, source, session_date)
    VALUES (_session_id, stu.id, 'PRESENT', now(), 'self', CURRENT_DATE)
    ON CONFLICT (session_id, student_id, session_date) DO NOTHING;

  RETURN QUERY SELECT true, 'Marked present', stu.full_name, round(dist)::int;
END $function$;

REVOKE ALL ON FUNCTION public.self_checkin_geo(uuid, text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_checkin_geo(uuid, text, double precision, double precision) TO anon, authenticated;