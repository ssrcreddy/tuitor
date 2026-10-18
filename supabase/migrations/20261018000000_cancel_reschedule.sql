-- Cancelling and rescheduling lessons.
--
-- Policy
--   * Students can cancel any upcoming lesson. Cancelling at least
--     change_cutoff() before the start is refunded; later is not.
--   * Tutors can cancel any upcoming lesson; the student is always refunded.
--   * Students can reschedule to another free slot until change_cutoff()
--     before the start. Tutors cancel instead of moving a student's lesson.
--   * refund_due records the decision; payments (phase 4) act on it.
--     It is null when nothing was paid (an unpaid hold).

alter table public.bookings
  add column cancelled_at        timestamptz,
  add column cancelled_by        uuid references public.profiles (id),
  add column cancellation_reason text check (char_length(cancellation_reason) <= 500),
  add column refund_due          boolean,
  add column reschedule_count    integer not null default 0;

-- A student can't be in two live lessons at once (across different tutors).
alter table public.bookings
  add constraint bookings_student_no_overlap exclude using gist (
    student_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending_payment', 'confirmed', 'completed'));

-- Turns an exclusion violation on bookings into a user-facing error.
create or replace function public.raise_booking_conflict(p_constraint text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_constraint = 'bookings_student_no_overlap' then
    raise exception 'You already have a lesson at that time.' using errcode = '23P01';
  end if;
  raise exception 'That slot was just taken. Please pick another time.' using errcode = '23P01';
end;
$$;

revoke execute on function public.raise_booking_conflict(text) from public, anon, authenticated;

create or replace function public.change_cutoff()
returns interval language sql immutable set search_path = '' as $$ select interval '12 hours' $$;

-- Shared slot validation for new and moved bookings. Raises a user-facing
-- error if p_starts_at is not a bookable start time for the tutor.
create or replace function public.assert_slot_bookable(p_tutor_id uuid, p_starts_at timestamptz)
returns public.tutor_profiles
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tutor public.tutor_profiles;
  v_tz    text;
  v_local timestamp;
  v_ends  timestamptz := p_starts_at + make_interval(mins => public.lesson_minutes());
begin
  select * into v_tutor from public.tutor_profiles where user_id = p_tutor_id and status = 'approved';
  if not found then
    raise exception 'This tutor is not accepting bookings.' using errcode = '22023';
  end if;

  if p_starts_at < now() + public.change_cutoff() then
    raise exception 'Lessons must be booked at least 12 hours in advance.' using errcode = '22023';
  end if;
  if p_starts_at > now() + interval '60 days' then
    raise exception 'Lessons can be booked at most 60 days ahead.' using errcode = '22023';
  end if;

  select timezone into v_tz from public.profiles where id = p_tutor_id;
  v_local := p_starts_at at time zone v_tz;

  if extract(minute from v_local) <> 0 or extract(second from v_local) <> 0 then
    raise exception 'Lessons start on the hour.' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.availability_rules r
     where r.tutor_id = p_tutor_id
       and r.weekday = extract(dow from v_local)
       and v_local::time >= r.start_time
       and r.end_time - v_local::time >= make_interval(mins => public.lesson_minutes())
  ) or exists (
    select 1 from public.availability_exceptions e
     where e.tutor_id = p_tutor_id and e.starts_at < v_ends and e.ends_at > p_starts_at
  ) then
    raise exception 'The tutor is not available at that time.' using errcode = '22023';
  end if;

  return v_tutor;
end;
$$;

revoke execute on function public.assert_slot_bookable(uuid, timestamptz) from public, anon, authenticated;

-- Release a tutor's abandoned payment holds so they stop blocking slots.
create or replace function public.release_expired_holds(p_tutor_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.bookings
     set status = 'cancelled', cancelled_at = now()
   where tutor_id = p_tutor_id
     and status = 'pending_payment'
     and hold_expires_at <= now();
$$;

revoke execute on function public.release_expired_holds(uuid) from public, anon, authenticated;

-- Same behaviour as before, now using the shared validation.
create or replace function public.create_booking_hold(
  p_tutor_id  uuid,
  p_starts_at timestamptz,
  p_type      public.booking_type
)
returns public.bookings
language plpgsql security definer set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_tutor   public.tutor_profiles;
  v_price   integer;
  v_booking public.bookings;
  v_constraint text;
begin
  if v_student is null then
    raise exception 'You must be signed in to book.' using errcode = '28000';
  end if;
  if v_student = p_tutor_id then
    raise exception 'You cannot book a lesson with yourself.' using errcode = '22023';
  end if;

  v_tutor := public.assert_slot_bookable(p_tutor_id, p_starts_at);
  perform public.release_expired_holds(p_tutor_id);

  v_price := case when p_type = 'trial' then v_tutor.trial_rate_cents else v_tutor.hourly_rate_cents end;

  begin
    insert into public.bookings (
      student_id, tutor_id, starts_at, ends_at, type, status,
      price_cents, platform_fee_cents, currency, hold_expires_at
    ) values (
      v_student, p_tutor_id, p_starts_at, p_starts_at + make_interval(mins => public.lesson_minutes()),
      p_type, 'pending_payment',
      v_price, public.platform_fee_cents(p_type, v_price), v_tutor.currency,
      now() + interval '15 minutes'
    )
    returning * into v_booking;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform public.raise_booking_conflict(v_constraint);
    when unique_violation then
      raise exception 'You have already booked a trial lesson with this tutor.' using errcode = '23505';
  end;

  return v_booking;
end;
$$;

-- Move the caller's upcoming lesson to another free slot with the same tutor.
create or replace function public.reschedule_booking(p_booking_id uuid, p_new_starts_at timestamptz)
returns public.bookings
language plpgsql security definer set search_path = public
as $$
declare
  v_booking    public.bookings;
  v_constraint text;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.student_id is distinct from auth.uid() then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  if v_booking.status not in ('pending_payment', 'confirmed') or v_booking.starts_at <= now()
     or (v_booking.status = 'pending_payment' and v_booking.hold_expires_at <= now()) then
    raise exception 'Only upcoming lessons can be rescheduled.' using errcode = '22023';
  end if;
  if v_booking.starts_at - now() < public.change_cutoff() then
    raise exception 'Lessons can only be rescheduled more than 12 hours before they start.' using errcode = '22023';
  end if;
  if p_new_starts_at = v_booking.starts_at then
    raise exception 'Pick a different time.' using errcode = '22023';
  end if;

  perform public.assert_slot_bookable(v_booking.tutor_id, p_new_starts_at);
  perform public.release_expired_holds(v_booking.tutor_id);

  begin
    update public.bookings
       set starts_at = p_new_starts_at,
           ends_at = p_new_starts_at + make_interval(mins => public.lesson_minutes()),
           reschedule_count = reschedule_count + 1
     where id = p_booking_id
    returning * into v_booking;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform public.raise_booking_conflict(v_constraint);
  end;

  return v_booking;
end;
$$;

-- Cancel an upcoming lesson as its student or tutor, recording whether a refund is due.
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns public.bookings
language plpgsql security definer set search_path = public
as $$
declare
  v_booking public.bookings;
  v_refund  boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or auth.uid() is null or auth.uid() not in (v_booking.student_id, v_booking.tutor_id) then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  if v_booking.status not in ('pending_payment', 'confirmed') or v_booking.starts_at <= now() then
    raise exception 'This lesson can no longer be cancelled.' using errcode = '22023';
  end if;

  v_refund := case
    when v_booking.status = 'pending_payment' then null -- nothing was paid
    when auth.uid() = v_booking.tutor_id then true
    else v_booking.starts_at - now() >= public.change_cutoff()
  end;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancellation_reason = nullif(btrim(p_reason), ''),
         refund_due = v_refund
   where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function public.reschedule_booking(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
