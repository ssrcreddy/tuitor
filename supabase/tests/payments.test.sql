-- Database tests for payment confirmation, expiry, refunds and payouts.
-- Run with: npx supabase test db   (needs the local stack and seed data)

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- d10: the next weekday at least two days out, 10:00 London time.
--   Emma  (London, 09:00–13:00): d10, d10+1h, d10+2h
--   Sophie (Paris, 09:00–13:00 = 08:00–12:00 London): d10-2h, d10-1h
create temporary table slot as
  select (d::date + time '10:00') at time zone 'Europe/London' as d10
    from generate_series((now() at time zone 'Europe/London')::date + 2,
                         (now() at time zone 'Europe/London')::date + 9, interval '1 day') as d
   where extract(isodow from d) between 1 and 5
   order by d
   limit 1;

create temporary table h (name text primary key, id uuid);
grant select on h to authenticated;

create or replace function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.hold(p_name text, p_student uuid, p_tutor uuid, p_at timestamptz, p_type booking_type)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.as_user(p_student);
  select id into v_id from create_booking_hold(p_tutor, p_at, p_type);
  insert into h values (p_name, v_id);
  insert into payments (booking_id, stripe_checkout_session_id, amount_cents, currency, status)
  select v_id, 'cs_' || p_name, price_cents, currency, 'pending' from bookings where id = v_id;
  return v_id;
end;
$$;
create or replace function pg_temp.id(p_name text) returns uuid language sql as $$ select id from h where name = p_name $$;

-- ---------------------------------------------------------------------------
-- Paying for a hold
-- ---------------------------------------------------------------------------
select pg_temp.hold('a', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000d1', (select d10 from slot), 'trial');
select is((select round(extract(epoch from hold_expires_at - now()) / 60)::int from bookings where id = pg_temp.id('a')), 35,
          'holds last 35 minutes, longer than a Checkout session');

select is(confirm_booking_payment(pg_temp.id('a'), 'cs_a', 'pi_a', 'ch_a', 500), 'confirmed', 'a paid hold is confirmed');
select is((select row(status::text, hold_expires_at is null)::text from bookings where id = pg_temp.id('a')), '(confirmed,t)',
          'confirmed bookings no longer expire');
select is((select row(status::text, stripe_charge_id, amount_cents)::text from payments where booking_id = pg_temp.id('a')),
          '(succeeded,ch_a,500)', 'the payment is recorded as succeeded');
select is(confirm_booking_payment(pg_temp.id('a'), 'cs_a', 'pi_a', 'ch_a', 500), 'already_confirmed',
          'repeated webhooks are harmless');
select is((select count(*)::int from payments where booking_id = pg_temp.id('a')), 1, 'and create no extra payments');

-- ---------------------------------------------------------------------------
-- Abandoned checkout
-- ---------------------------------------------------------------------------
select pg_temp.hold('b', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000d1',
                    (select d10 from slot) + interval '1 hour', 'regular');
select expire_booking_hold(pg_temp.id('b'), 'cs_b');
select is((select status::text from bookings where id = pg_temp.id('b')), 'cancelled', 'an expired checkout releases the hold');
select is((select status::text from payments where booking_id = pg_temp.id('b')), 'expired', 'and marks the payment expired');

-- ---------------------------------------------------------------------------
-- Payment arrives after the hold lapsed
-- ---------------------------------------------------------------------------
select pg_temp.hold('c', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000d1',
                    (select d10 from slot) + interval '2 hours', 'regular');
update bookings set hold_expires_at = now() - interval '1 minute' where id = pg_temp.id('c');
select release_expired_holds('00000000-0000-0000-0000-0000000000d1');
select is(confirm_booking_payment(pg_temp.id('c'), 'cs_c', 'pi_c', 'ch_c', 2500), 'confirmed',
          'a late payment still confirms the lesson if the slot is free');

select pg_temp.hold('d', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000d6',
                    (select d10 from slot) - interval '2 hours', 'regular');
update bookings set hold_expires_at = now() - interval '1 minute' where id = pg_temp.id('d');
select release_expired_holds('00000000-0000-0000-0000-0000000000d6');
select pg_temp.hold('d_rival', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000d6',
                    (select d10 from slot) - interval '2 hours', 'trial');
select is(confirm_booking_payment(pg_temp.id('d'), 'cs_d', 'pi_d', 'ch_d', 2800), 'refund_needed',
          'a late payment for a slot someone else took needs a refund');
select is((select row(status::text, refund_due)::text from bookings where id = pg_temp.id('d')), '(cancelled,t)',
          'and the booking stays cancelled with a refund due');

-- The student cancels while the Checkout page is still open, then pays.
select pg_temp.hold('e', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000d6',
                    (select d10 from slot) - interval '1 hour', 'regular');
select pg_temp.as_user('00000000-0000-0000-0000-00000000c002');
select cancel_booking(pg_temp.id('e'));
select is(confirm_booking_payment(pg_temp.id('e'), 'cs_e', 'pi_e', 'ch_e', 2800), 'refund_needed',
          'paying for a lesson you already cancelled is refunded');

select is((select count(*)::int from refunds_due() where booking_id in (pg_temp.id('d'), pg_temp.id('e'))), 2,
          'refunds_due lists both');
select is((select count(*)::int from refunds_due() where booking_id = pg_temp.id('a')), 0, 'but not confirmed lessons');

-- ---------------------------------------------------------------------------
-- Completing lessons and tutor payouts
-- ---------------------------------------------------------------------------
create temporary table past as
with ins as (
  insert into bookings (student_id, tutor_id, starts_at, ends_at, type, status, price_cents, platform_fee_cents, currency)
  values
    ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000d4',
     date_trunc('hour', now()) - interval '26 hours', date_trunc('hour', now()) - interval '25 hours',
     'regular', 'confirmed', 2200, 440, 'USD'),
    ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000d4',
     date_trunc('hour', now()) - interval '30 hours', date_trunc('hour', now()) - interval '29 hours',
     'trial', 'confirmed', 500, 500, 'USD')
  returning id, type
)
select * from ins;
insert into payments (booking_id, stripe_checkout_session_id, stripe_charge_id, amount_cents, currency, status)
select id, 'cs_past_' || type, 'ch_past_' || type, case when type = 'trial' then 500 else 2200 end, 'USD', 'succeeded' from past;

create temporary table lessons_before as select lessons_taught from tutor_profiles where user_id = '00000000-0000-0000-0000-0000000000d4';
select ok(complete_past_lessons() >= 2, 'complete_past_lessons marks ended lessons');
select is((select count(*)::int from bookings where id in (select id from past) and status = 'completed'), 2,
          'both past lessons are completed');
select is((select lessons_taught - (select lessons_taught from lessons_before) from tutor_profiles
            where user_id = '00000000-0000-0000-0000-0000000000d4'), 2, 'and count towards lessons taught');
select is((select count(*)::int from bookings where id = pg_temp.id('a') and status = 'confirmed'), 1,
          'future lessons are not completed');

select is((select count(*)::int from payouts_due() where booking_id in (select id from past)), 0,
          'no payouts until the tutor has set up Stripe');
update tutor_profiles set payouts_enabled = true, stripe_account_id = 'acct_lucia' where user_id = '00000000-0000-0000-0000-0000000000d4';
select is((select row(amount_cents, stripe_account_id, stripe_charge_id)::text from payouts_due()
            where booking_id in (select id from past)),
          '(1760,acct_lucia,ch_past_regular)',
          'the tutor share (price minus 20%) is due once payouts are enabled; trials pay the tutor nothing');

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000c001');
select throws_ok($$ select confirm_booking_payment(gen_random_uuid(), 'x', 'x', 'x', 1) $$, '42501', null,
                 'users cannot confirm payments');
select throws_ok($$ select * from payouts_due() $$, '42501', null, 'users cannot list payouts');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$ update tutor_profiles set payouts_enabled = true where user_id = auth.uid() $$, '42501', null,
                 'tutors cannot mark their own payouts enabled');
select is((select count(*)::int from payments where booking_id = pg_temp.id('a')), 1, 'tutors see payments for their lessons');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d6');
select is((select count(*)::int from payments where booking_id = pg_temp.id('a')), 0, 'but not other tutors'' payments');
reset role;
set local role service_role;
select lives_ok($$ select * from payouts_due() $$, 'the server (service role) can list payouts');

select * from finish();
rollback;
