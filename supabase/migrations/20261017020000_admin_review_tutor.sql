-- Admin approval of tutors, callable by signed-in admins without the
-- service-role key. tutor_profiles.status stays non-writable by clients.
create or replace function public.admin_set_tutor_status(p_tutor_id uuid, p_status public.tutor_status)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can review tutors.' using errcode = '42501';
  end if;

  update public.tutor_profiles set status = p_status where user_id = p_tutor_id;
  if not found then
    raise exception 'Tutor not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_set_tutor_status(uuid, public.tutor_status) from public, anon;
grant execute on function public.admin_set_tutor_status(uuid, public.tutor_status) to authenticated;
