
create extension if not exists pgcrypto with schema extensions;

alter table public.students add column if not exists password_hash text;

-- status: does this index exist anywhere, and has a password been set?
create or replace function public.student_auth_status(_index text)
returns table(exists_ boolean, has_password boolean, has_email boolean)
language sql stable security definer set search_path = public, extensions
as $$
  select true,
         bool_or(s.password_hash is not null),
         bool_or(s.email is not null and s.email <> '')
  from public.students s
  where lower(s.index_number) = lower(trim(_index))
  having count(*) > 0
$$;

create or replace function public.student_set_password(_index text, _email text, _password text)
returns table(ok boolean, message text)
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare n int;
begin
  if length(coalesce(_password,'')) < 6 then
    return query select false, 'Password must be at least 6 characters'; return;
  end if;

  select count(*) into n from public.students s
   where lower(s.index_number) = lower(trim(_index))
     and (s.email is null or s.email = '' or lower(s.email) = lower(trim(coalesce(_email,''))));
  if n = 0 then
    return query select false, 'Index number and email do not match our records'; return;
  end if;

  if exists (select 1 from public.students s
              where lower(s.index_number) = lower(trim(_index)) and s.password_hash is not null) then
    return query select false, 'A password already exists for this index number'; return;
  end if;

  update public.students s
     set password_hash = extensions.crypt(_password, extensions.gen_salt('bf'))
   where lower(s.index_number) = lower(trim(_index));

  return query select true, 'Password created';
end;
$$;

create or replace function public.student_reset_password(_index text, _email text, _password text)
returns table(ok boolean, message text)
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare n int;
begin
  if length(coalesce(_password,'')) < 6 then
    return query select false, 'Password must be at least 6 characters'; return;
  end if;
  select count(*) into n from public.students s
   where lower(s.index_number) = lower(trim(_index))
     and s.email is not null and lower(s.email) = lower(trim(coalesce(_email,'')));
  if n = 0 then
    return query select false, 'We could not verify that email for this index number'; return;
  end if;
  update public.students s
     set password_hash = extensions.crypt(_password, extensions.gen_salt('bf'))
   where lower(s.index_number) = lower(trim(_index));
  return query select true, 'Password reset';
end;
$$;

create or replace function public.student_login(_index text, _password text)
returns table(ok boolean, full_name text, index_number text, level text, qr_uuid text, pin text)
language sql stable security definer set search_path = public, extensions
as $$
  select true, s.full_name, s.index_number, s.level, s.qr_uuid::text, s.pin
  from public.students s
  where lower(s.index_number) = lower(trim(_index))
    and s.password_hash is not null
    and s.password_hash = extensions.crypt(_password, s.password_hash)
  order by s.created_at desc
  limit 1
$$;

-- per-course attendance summary for the authenticated-by-password student
create or replace function public.student_courses(_index text, _password text)
returns table(course_id uuid, code text, title text, sessions_total bigint, attended bigint, percentage numeric)
language sql stable security definer set search_path = public, extensions
as $$
  with me as (
    select s.id, s.owner_id from public.students s
    where lower(s.index_number) = lower(trim(_index))
      and s.password_hash is not null
      and s.password_hash = extensions.crypt(_password, s.password_hash)
  )
  select c.id, c.code, c.title,
         count(distinct sess.id) as sessions_total,
         count(distinct ar.session_id) filter (where ar.id is not null) as attended,
         case when count(distinct sess.id) = 0 then 0
              else round(100.0 * count(distinct ar.session_id) / count(distinct sess.id), 1) end
  from me
  join public.course_registrations cr on cr.student_id = me.id
  join public.courses c on c.id = cr.course_id
  left join public.attendance_sessions sess on sess.course_id = c.id
  left join public.attendance_records ar on ar.session_id = sess.id and ar.student_id = me.id
  group by c.id, c.code, c.title
  order by c.code
$$;

create or replace function public.student_history(_index text, _password text)
returns table(course_code text, session_title text, session_date date, checked_in timestamptz, status text)
language sql stable security definer set search_path = public, extensions
as $$
  with me as (
    select s.id from public.students s
    where lower(s.index_number) = lower(trim(_index))
      and s.password_hash is not null
      and s.password_hash = extensions.crypt(_password, s.password_hash)
  )
  select c.code, coalesce(sess.title, to_char(sess.starts_at,'DD Mon YYYY')), ar.session_date, ar.check_in_at, ar.status::text
  from me
  join public.attendance_records ar on ar.student_id = me.id
  join public.attendance_sessions sess on sess.id = ar.session_id
  join public.courses c on c.id = sess.course_id
  order by ar.session_date desc, ar.check_in_at desc
  limit 200
$$;

revoke all on function public.student_auth_status(text) from public;
revoke all on function public.student_set_password(text,text,text) from public;
revoke all on function public.student_reset_password(text,text,text) from public;
revoke all on function public.student_login(text,text) from public;
revoke all on function public.student_courses(text,text) from public;
revoke all on function public.student_history(text,text) from public;

grant execute on function public.student_auth_status(text) to anon, authenticated;
grant execute on function public.student_set_password(text,text,text) to anon, authenticated;
grant execute on function public.student_reset_password(text,text,text) to anon, authenticated;
grant execute on function public.student_login(text,text) to anon, authenticated;
grant execute on function public.student_courses(text,text) to anon, authenticated;
grant execute on function public.student_history(text,text) to anon, authenticated;
