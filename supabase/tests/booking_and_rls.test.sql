-- Database tests for booking rules and row-level security.
-- Run with: npx supabase test db   (needs the local stack and seed data)

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- Seed ids
\set alex   '''00000000-0000-0000-0000-00000000c001'''
\set sam    '''00000000-0000-0000-0000-00000000c002'''
\set emma   '''00000000-0000-0000-0000-0000000000d1'''
\set omar   '''00000000-0000-0000-0000-0000000000db'''

-- A bookable time: the next weekday at least two days out, 10:00 London time.
-- Emma (Europe/London) is available Mon–Fri 09:00–13:00.
create temporary table slot as
  select (d::date + time '10:00') at time zone 'Europe/London' as at10
    from generate_series((now() at time zone 'Europe/London')::date + 2,
                         (now() at time zone 'Europe/London')::date + 9, interval '1 day') as d
   where extract(isodow from d) between 1 and 5
   order by d
   limit 1;
grant select on slot to authenticated, anon;


-- ---------------------------------------------------------------------------
-- Seed and signup trigger
-- ---------------------------------------------------------------------------
select is((select count(*)::int from tutor_profiles where status = 'approved'), 10, 'seed has 10 approved tutors');
select is((select rating_avg from tutor_profiles where user_id = :emma), 5.00::numeric(3,2), 'review trigger keeps rating_avg in sync');
select is((select review_count from tutor_profiles where user_id = :emma), 2, 'review trigger keeps review_count in sync');
select is((select reviewer_name from reviews where tutor_id = :emma and student_id = :alex), 'Alex', 'reviewer_name is the student first name');
select is((select role::text from profiles where id = '00000000-0000-0000-0000-00000000a001'), 'admin', 'seed admin');

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000e1', 'sneaky@tuitor.test', '{"role":"admin","timezone":"Not/AZone"}');
select is((select role::text from profiles where id = '00000000-0000-0000-0000-0000000000e1'), 'student',
          'signup cannot request the admin role');
select is((select timezone from profiles where id = '00000000-0000-0000-0000-0000000000e1'), 'UTC',
          'an invalid signup timezone falls back to UTC');

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from tutor_profiles), 10, 'anon sees only approved tutors');
select is((select count(*)::int from profiles where id in (:alex, :sam)), 0, 'anon cannot see student profiles');
select is((select count(*)::int from bookings), 0, 'anon cannot see bookings');
select ok((select count(*) from reviews) > 0, 'reviews are public');

-- ---------------------------------------------------------------------------
-- Students: column-level write protection
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';

select throws_ok($$ update profiles set role = 'admin' where id = auth.uid() $$, '42501', null,
                 'a student cannot change their own role');
select lives_ok($$ update profiles set full_name = 'Alex K' where id = auth.uid() $$,
                'a student can change their own name');
select throws_ok(
  $$ insert into bookings (student_id, tutor_id, starts_at, ends_at, type, price_cents, platform_fee_cents, currency)
     values (auth.uid(), '00000000-0000-0000-0000-0000000000d1', now() + interval '3 days', now() + interval '3 days 1 hour', 'regular', 1, 0, 'USD') $$,
  '42501', null, 'students cannot insert bookings directly (and so cannot set prices)');

-- ---------------------------------------------------------------------------
-- create_booking_hold
-- ---------------------------------------------------------------------------
select is(
  (select row(price_cents, platform_fee_cents, status::text, type::text)::text
     from create_booking_hold(:emma, (select at10 from slot), 'trial')),
  '(500,500,pending_payment,trial)',
  'trial hold uses the trial price and the platform keeps the whole fee'
);
select throws_ok($$ select create_booking_hold('00000000-0000-0000-0000-0000000000d1', (select at10 from slot) + interval '1 hour', 'trial') $$,
                 '23505', 'You have already booked a trial lesson with this tutor.', 'one trial per student per tutor');
select throws_ok($$ select create_booking_hold('00000000-0000-0000-0000-0000000000d1', (select at10 from slot) + interval '30 minutes', 'regular') $$,
                 '22023', 'Lessons start on the hour.', 'lessons must start on the hour');
select throws_ok($$ select create_booking_hold('00000000-0000-0000-0000-0000000000d1', (select at10 from slot) - interval '7 hours', 'regular') $$,
                 '22023', 'The tutor is not available at that time.', 'cannot book outside availability');
select throws_ok($$ select create_booking_hold('00000000-0000-0000-0000-0000000000d1', date_trunc('hour', now()) + interval '2 hours', 'regular') $$,
                 '22023', 'Lessons must be booked at least 12 hours in advance.', 'minimum lead time');
select throws_ok($$ select create_booking_hold('00000000-0000-0000-0000-0000000000db', (select at10 from slot), 'trial') $$,
                 '22023', 'This tutor is not accepting bookings.', 'cannot book a pending tutor');

-- Another student tries the same slot.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}';
select throws_ok($$ select create_booking_hold('00000000-0000-0000-0000-0000000000d1', (select at10 from slot), 'regular') $$,
                 '23P01', 'That slot was just taken. Please pick another time.', 'no double-booking of a held slot');
select is(
  (select row(price_cents, platform_fee_cents)::text
     from create_booking_hold(:emma, (select at10 from slot) + interval '1 hour', 'regular')),
  '(2500,500)',
  'regular lesson: hourly price with a 20% platform fee'
);
select is((select count(*)::int from bookings where student_id = :alex), 0, 'students cannot see each other''s bookings');
select is((select count(*)::int from tutor_busy_times(:emma, now(), now() + interval '14 days')), 2,
          'tutor_busy_times exposes both holds without revealing who booked');

-- An expired hold no longer blocks the slot.
reset role;
update bookings set hold_expires_at = now() - interval '1 minute'
 where student_id = :sam and starts_at = (select at10 from slot) + interval '1 hour';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select lives_ok($$ select create_booking_hold('00000000-0000-0000-0000-0000000000d1', (select at10 from slot) + interval '1 hour', 'regular') $$,
                'an expired hold is released and the slot can be booked again');

-- ---------------------------------------------------------------------------
-- Reviews and tutors
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into reviews (booking_id, student_id, tutor_id, rating)
     select id, student_id, tutor_id, 5 from bookings where student_id = auth.uid() and status = 'pending_payment' limit 1 $$,
  '42501', null, 'students can only review completed lessons'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok($$ update tutor_profiles set status = 'approved' where user_id = auth.uid() $$, '42501', null,
                 'tutors cannot change their own approval status');
select is((select count(*)::int from bookings where tutor_id = auth.uid() and status = 'pending_payment'), 2,
          'tutors see bookings made with them');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000db","role":"authenticated"}';
select is((select count(*)::int from tutor_profiles where user_id = auth.uid()), 1,
          'a pending tutor can still see their own profile');

-- Admin review of tutors
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}';
select throws_ok($$ select admin_set_tutor_status('00000000-0000-0000-0000-0000000000db', 'approved') $$,
                 '42501', 'Only admins can review tutors.', 'non-admins cannot approve tutors');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
select admin_set_tutor_status('00000000-0000-0000-0000-0000000000db', 'approved');
select is((select status::text from tutor_profiles where user_id = '00000000-0000-0000-0000-0000000000db'), 'approved',
          'admins can approve tutors');

select * from finish();
rollback;
