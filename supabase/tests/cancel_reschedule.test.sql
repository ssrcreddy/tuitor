-- Database tests for cancelling and rescheduling lessons.
-- Run with: npx supabase test db   (needs the local stack and seed data)

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Emma (Europe/London) is available Mon–Fri 09:00–13:00.
-- d10: the next weekday at least two days out, 10:00 London time.
create temporary table slot as
  select (d::date + time '10:00') at time zone 'Europe/London' as d10
    from generate_series((now() at time zone 'Europe/London')::date + 2,
                         (now() at time zone 'Europe/London')::date + 9, interval '1 day') as d
   where extract(isodow from d) between 1 and 5
   order by d
   limit 1;
grant select on slot to authenticated;

-- Confirmed (paid) lessons, inserted directly as the payment webhook would.
-- b_far:  Alex with Emma at d10            (more than 12 hours away)
-- b_near: Alex with Emma in 6 hours        (inside the 12-hour cutoff)
-- b_sam:  Sam with Emma at d10 + 2 hours
create temporary table b (id uuid, name text);
with ins as (
  insert into bookings (student_id, tutor_id, starts_at, ends_at, type, status, price_cents, platform_fee_cents, currency)
  values
    ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000d1',
     (select d10 from slot), (select d10 from slot) + interval '1 hour', 'regular', 'confirmed', 2500, 500, 'USD'),
    ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000d1',
     date_trunc('hour', now()) + interval '6 hours', date_trunc('hour', now()) + interval '7 hours', 'regular', 'confirmed', 2500, 500, 'USD'),
    ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000d1',
     (select d10 from slot) + interval '2 hours', (select d10 from slot) + interval '3 hours', 'regular', 'confirmed', 2500, 500, 'USD')
  returning id, student_id, starts_at
)
insert into b
select id,
       case when student_id = '00000000-0000-0000-0000-00000000c002' then 'sam'
            when starts_at = (select d10 from slot) then 'far' else 'near' end as name
  from ins;
grant select on b to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Rescheduling
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select throws_ok($$ select reschedule_booking((select id from b where name = 'far'), (select d10 from slot) + interval '1 hour') $$,
                 'P0002', 'Lesson not found.', 'students cannot reschedule other students'' lessons');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok($$ select reschedule_booking((select id from b where name = 'far'), (select d10 from slot) + interval '1 hour') $$,
                 'P0002', 'Lesson not found.', 'tutors cannot move a student''s lesson');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select throws_ok($$ select reschedule_booking((select id from b where name = 'near'), (select d10 from slot) + interval '1 hour') $$,
                 '22023', 'Lessons can only be rescheduled more than 12 hours before they start.',
                 'cannot reschedule inside the 12-hour cutoff');
select throws_ok($$ select reschedule_booking((select id from b where name = 'far'), (select d10 from slot) - interval '7 hours') $$,
                 '22023', 'The tutor is not available at that time.', 'cannot reschedule outside availability');
select throws_ok($$ select reschedule_booking((select id from b where name = 'far'), (select d10 from slot) + interval '2 hours') $$,
                 '23P01', 'That slot was just taken. Please pick another time.', 'cannot reschedule onto a booked slot');
select throws_ok($$ select reschedule_booking((select id from b where name = 'far'), (select d10 from slot)) $$,
                 '22023', 'Pick a different time.', 'rescheduling needs a new time');

select is(
  (select row(starts_at = (select d10 from slot) + interval '1 hour',
              ends_at = (select d10 from slot) + interval '2 hours', reschedule_count, status::text)::text
     from reschedule_booking((select id from b where name = 'far'), (select d10 from slot) + interval '1 hour')),
  '(t,t,1,confirmed)',
  'reschedule moves the lesson, keeps it confirmed and counts the change'
);
select is((select count(*)::int from tutor_busy_times('00000000-0000-0000-0000-0000000000d1',
                                                      (select d10 from slot), (select d10 from slot) + interval '1 hour')), 0,
          'the old slot is free again after rescheduling');

-- ---------------------------------------------------------------------------
-- Cancelling
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select throws_ok($$ select cancel_booking((select id from b where name = 'far')) $$,
                 'P0002', 'Lesson not found.', 'students cannot cancel other students'' lessons');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select is(
  (select row(status::text, refund_due, cancelled_by = '00000000-0000-0000-0000-00000000c001', cancellation_reason)::text
     from cancel_booking((select id from b where name = 'far'), '  Change of plans  ')),
  '(cancelled,t,t,"Change of plans")',
  'student cancelling 12+ hours ahead is refunded, and the reason is stored trimmed'
);
select is((select refund_due from cancel_booking((select id from b where name = 'near'))), false,
          'student cancelling inside 12 hours is not refunded');
select throws_ok($$ select cancel_booking((select id from b where name = 'far')) $$,
                 '22023', 'This lesson can no longer be cancelled.', 'cannot cancel twice');
select throws_ok(
  $$ select cancel_booking((select id from bookings where student_id = auth.uid() and status = 'completed' limit 1)) $$,
  '22023', 'This lesson can no longer be cancelled.', 'cannot cancel a completed lesson'
);
select throws_ok($$ update bookings set status = 'cancelled' where id = (select id from b where name = 'sam') $$,
                 '42501', null, 'bookings still cannot be changed directly');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select is((select row(status::text, refund_due)::text from cancel_booking((select id from b where name = 'sam'))),
          '(cancelled,t)', 'a tutor cancelling always refunds the student');
select is((select count(*)::int from tutor_busy_times('00000000-0000-0000-0000-0000000000d1',
                                                      (select d10 from slot), (select d10 from slot) + interval '4 hours')), 0,
          'cancelled lessons free their slots');

-- Unpaid holds: nothing to refund.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select is(
  (select row(status::text, refund_due is null)::text
     from cancel_booking((select id from create_booking_hold('00000000-0000-0000-0000-0000000000d1', (select d10 from slot), 'regular')))),
  '(cancelled,t)', 'cancelling an unpaid hold releases it with no refund due'
);

-- Booking a cancelled slot again works.
select lives_ok($$ select create_booking_hold('00000000-0000-0000-0000-0000000000d1', (select d10 from slot), 'regular') $$,
                'a cancelled slot can be booked again');

-- A student can't be in two lessons at once, even with different tutors.
-- (Sophie, in Paris, is free at 10:00 London time; Alex holds Emma then.)
select throws_ok(
  $$ select create_booking_hold('00000000-0000-0000-0000-0000000000d6', (select d10 from slot), 'trial') $$,
  '23P01', 'You already have a lesson at that time.', 'students cannot double-book themselves across tutors'
);
reset role;
insert into bookings (student_id, tutor_id, starts_at, ends_at, type, status, price_cents, platform_fee_cents, currency)
values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000d4',
        (select d10 from slot) + interval '5 days', (select d10 from slot) + interval '5 days 1 hour', 'regular', 'confirmed', 2200, 440, 'USD');
set local role authenticated;
select throws_ok(
  $$ select reschedule_booking((select id from bookings where student_id = auth.uid() and tutor_id = '00000000-0000-0000-0000-0000000000d4'
                                 and starts_at = (select d10 from slot) + interval '5 days'),
                               (select d10 from slot)) $$,
  '23P01', 'You already have a lesson at that time.', 'cannot reschedule onto your own other lesson'
);

-- Tutor time off blocks new bookings and reschedules.
reset role;
insert into availability_exceptions (tutor_id, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000d1', (select d10 from slot) - interval '10 hours', (select d10 from slot) + interval '14 hours');
set local role authenticated;
select throws_ok($$ select create_booking_hold('00000000-0000-0000-0000-0000000000d1', (select d10 from slot) + interval '1 hour', 'regular') $$,
                 '22023', 'The tutor is not available at that time.', 'time off blocks new bookings');
select is((select count(*)::int from tutor_busy_times('00000000-0000-0000-0000-0000000000d1',
                                                      (select d10 from slot), (select d10 from slot) + interval '1 hour')), 2,
          'time off and the new hold both show as busy');

select * from finish();
rollback;
