create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  title text not null,
  body text not null,
  levels text[] not null default '{}',
  course_id uuid references public.courses(id) on delete cascade,
  starts_on date not null default current_date,
  expires_on date,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;

alter table public.announcements enable row level security;

drop policy if exists "owners manage their announcements" on public.announcements;
create policy "owners manage their announcements"
on public.announcements for all to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index if not exists announcements_owner_idx on public.announcements(owner_id, starts_on desc);

-- Announcements visible to a password-verified student:
-- from the tutors who own the courses the student is registered in,
-- targeted at all levels or at the student's level, and within date range.
create or replace function public.student_announcements(_index text, _password text)
returns table(id uuid, title text, body text, course_code text, starts_on date, expires_on date)
language sql stable security definer set search_path = public, extensions
as $$
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
  select distinct a.id, a.title, a.body, c.code, a.starts_on, a.expires_on
  from public.announcements a
  join my_owners o on o.owner_id = a.owner_id
  left join public.courses c on c.id = a.course_id
  cross join me
  where (a.course_id is null or a.course_id = o.course_id)
    and (cardinality(a.levels) = 0 or me.level = any(a.levels))
    and a.starts_on <= current_date
    and (a.expires_on is null or a.expires_on >= current_date)
  order by a.starts_on desc
  limit 100
$$;

revoke all on function public.student_announcements(text,text) from public;
grant execute on function public.student_announcements(text,text) to anon, authenticated;