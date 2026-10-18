-- Payments with Stripe.
--
-- Flow
--   1. create_booking_hold() reserves a slot; the app opens a Stripe Checkout
--      session and records a 'pending' payment.
--   2. The Stripe webhook calls confirm_booking_payment() when paid, or
--      expire_booking_hold() when the session expires.
--   3. complete_past_lessons() marks finished lessons completed (daily job).
--   4. The app transfers the tutor's share for rows in payouts_due() and
--      refunds rows in refunds_due(), recording the results on payments.
--
-- Everything here except the column changes is for the service role only.

alter type public.payment_status add value if not exists 'expired';

alter table public.payments
  add column stripe_charge_id   text,
  add column stripe_refund_id   text,
  add column refunded_at        timestamptz,
  add column stripe_transfer_id text,
  add column transferred_at     timestamptz,
  add column last_error         text,
  add column updated_at         timestamptz not null default now();

-- At most one open or successful payment per booking.
create unique index payments_one_live_per_booking on public.payments (booking_id)
  where status in ('pending', 'succeeded');

-- Set from Stripe (Connect onboarding finished and transfers enabled). Not client-writable.
alter table public.tutor_profiles add column payouts_enabled boolean not null default false;

-- Checkout sessions last at least 30 minutes, so holds last a little longer.
create or replace function public.hold_minutes()
returns integer language sql immutable set search_path = '' as $$ select 35 $$;

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
      now() + make_interval(mins => public.hold_minutes())
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

-- Record a successful Checkout payment and confirm the booking. Idempotent.
-- Returns 'confirmed', 'already_confirmed', or 'refund_needed' when the
-- booking can no longer happen (cancelled by the user while paying, or the
-- hold lapsed and the slot was taken); refund_due is then set.
create or replace function public.confirm_booking_payment(
  p_booking_id          uuid,
  p_checkout_session_id text,
  p_payment_intent_id   text,
  p_charge_id           text,
  p_amount_cents        integer
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking % not found.', p_booking_id using errcode = 'P0002';
  end if;

  insert into public.payments (booking_id, stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id,
                               amount_cents, currency, status)
  values (p_booking_id, p_checkout_session_id, p_payment_intent_id, p_charge_id, p_amount_cents, v_booking.currency, 'succeeded')
  on conflict (stripe_checkout_session_id) do update
     set status = 'succeeded',
         stripe_payment_intent_id = excluded.stripe_payment_intent_id,
         stripe_charge_id = excluded.stripe_charge_id,
         amount_cents = excluded.amount_cents,
         updated_at = now();

  if v_booking.status in ('confirmed', 'completed') then
    return 'already_confirmed';
  end if;

  -- Revive the booking unless a person cancelled it (cancelled_by is null
  -- only for holds released on expiry).
  if v_booking.status = 'pending_payment' or (v_booking.status = 'cancelled' and v_booking.cancelled_by is null) then
    begin
      update public.bookings
         set status = 'confirmed', hold_expires_at = null, cancelled_at = null, refund_due = null
       where id = p_booking_id;
      return 'confirmed';
    exception
      when exclusion_violation or unique_violation then
        null; -- the slot (or the student's trial) was taken meanwhile
    end;
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), refund_due = true
   where id = p_booking_id;
  return 'refund_needed';
end;
$$;

-- A Checkout session expired unpaid: release the hold.
create or replace function public.expire_booking_hold(p_booking_id uuid, p_checkout_session_id text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.payments
     set status = 'expired', updated_at = now()
   where stripe_checkout_session_id = p_checkout_session_id and status = 'pending';

  update public.bookings
     set status = 'cancelled', cancelled_at = now()
   where id = p_booking_id and status = 'pending_payment';
end;
$$;

-- Mark confirmed lessons that have ended as completed. Returns how many.
create or replace function public.complete_past_lessons()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  with done as (
    update public.bookings
       set status = 'completed'
     where status = 'confirmed' and ends_at <= now()
    returning tutor_id
  ), per_tutor as (
    select tutor_id, count(*) as n from done group by tutor_id
  ), bumped as (
    update public.tutor_profiles t
       set lessons_taught = t.lessons_taught + p.n
      from per_tutor p
     where t.user_id = p.tutor_id
    returning p.n
  )
  select coalesce(sum(n), 0) into v_count from bumped;
  return v_count;
end;
$$;

-- Completed, paid lessons whose tutor share hasn't been transferred yet.
create or replace function public.payouts_due()
returns table (
  payment_id uuid, booking_id uuid, stripe_charge_id text, stripe_account_id text,
  amount_cents integer, currency text
)
language sql stable security definer set search_path = public
as $$
  select p.id, b.id, p.stripe_charge_id, t.stripe_account_id,
         b.price_cents - b.platform_fee_cents, b.currency
    from public.payments p
    join public.bookings b on b.id = p.booking_id
    join public.tutor_profiles t on t.user_id = b.tutor_id
   where p.status = 'succeeded'
     and p.stripe_transfer_id is null
     and b.status = 'completed'
     and b.refund_due is not true
     and b.price_cents - b.platform_fee_cents > 0
     and t.payouts_enabled
     and t.stripe_account_id is not null;
$$;

-- Paid bookings that owe the student a refund that hasn't been made yet.
create or replace function public.refunds_due(p_booking_id uuid default null)
returns table (payment_id uuid, booking_id uuid, stripe_payment_intent_id text, amount_cents integer)
language sql stable security definer set search_path = public
as $$
  select p.id, b.id, p.stripe_payment_intent_id, p.amount_cents
    from public.payments p
    join public.bookings b on b.id = p.booking_id
   where p.status = 'succeeded'
     and b.refund_due
     and (p_booking_id is null or b.id = p_booking_id);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.confirm_booking_payment(uuid, text, text, text, integer)',
    'public.expire_booking_hold(uuid, text)',
    'public.complete_past_lessons()',
    'public.payouts_due()',
    'public.refunds_due(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Tutors can see payments for their own lessons (for their earnings page).
create policy payments_select_tutor on public.payments for select using (
  exists (select 1 from public.bookings b where b.id = payments.booking_id and b.tutor_id = auth.uid())
);
