-- Local development seed. Runs on `supabase db reset`.
--
-- Test accounts (local only), all with password: password123
--   admin@tuitor.test               admin
--   alex@tuitor.test, sam@tuitor.test   students
--   <firstname>@tuitor.test         tutors (emma, daniel, priya, lucia, mateo,
--                                   sophie, kenji, hannah, wei, ana; omar is pending)

create or replace function pg_temp.seed_user(
  p_id uuid, p_email text, p_name text, p_role text, p_tz text
) returns uuid language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_name, 'role', p_role, 'timezone', p_tz),
    now(), now(), '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );
  return p_id;
end;
$$;

-- Admin and students
select pg_temp.seed_user('00000000-0000-0000-0000-00000000a001', 'admin@tuitor.test', 'Ada Admin', 'student', 'UTC');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a001';

select pg_temp.seed_user('00000000-0000-0000-0000-00000000c001', 'alex@tuitor.test', 'Alex Kim', 'student', 'America/Los_Angeles');
select pg_temp.seed_user('00000000-0000-0000-0000-00000000c002', 'sam@tuitor.test', 'Sam Patel', 'student', 'Asia/Kolkata');

-- Tutors
with t(id, email, name, tz, country, headline, bio, rate, trial, status) as (values
  ('00000000-0000-0000-0000-0000000000d1'::uuid, 'emma@tuitor.test', 'Emma Clarke', 'Europe/London', 'GB',
   'IELTS & exam English with a Cambridge-certified teacher',
   'I have helped 300+ students reach band 7+. Lessons are structured around real exam tasks, with clear feedback after every session.',
   2500, 500, 'approved'),
  ('00000000-0000-0000-0000-0000000000d2', 'daniel@tuitor.test', 'Daniel Brooks', 'America/New_York', 'US',
   'Business English for meetings, pitches and interviews',
   'Ex-consultant turned teacher. We practise the conversations you actually have at work.',
   3500, 800, 'approved'),
  ('00000000-0000-0000-0000-0000000000d3', 'priya@tuitor.test', 'Priya Sharma', 'Asia/Kolkata', 'IN',
   'Confident spoken English and job interview prep',
   'Friendly, patient lessons for beginners and intermediates. I also teach Hindi.',
   1200, 300, 'approved'),
  ('00000000-0000-0000-0000-0000000000d4', 'lucia@tuitor.test', 'Lucía Fernández', 'Europe/Madrid', 'ES',
   'Conversational Spanish from day one',
   'Native speaker from Madrid. Expect to talk a lot, laugh a little and leave with phrases you can use tomorrow.',
   2200, 500, 'approved'),
  ('00000000-0000-0000-0000-0000000000d5', 'mateo@tuitor.test', 'Mateo Rossi', 'Europe/Rome', 'IT',
   'Italian for travel, family and culture lovers',
   'Grammar without the boredom. We learn through food, film and everyday Italian.',
   2000, 400, 'approved'),
  ('00000000-0000-0000-0000-0000000000d6', 'sophie@tuitor.test', 'Sophie Martin', 'Europe/Paris', 'FR',
   'French with a DELF examiner (A1–C1)',
   'Certified DELF/DALF examiner. Clear plans, regular mock tests, steady progress.',
   2800, 600, 'approved'),
  ('00000000-0000-0000-0000-0000000000d7', 'kenji@tuitor.test', 'Kenji Tanaka', 'Asia/Tokyo', 'JP',
   'Japanese for JLPT N5–N2 and anime fans',
   'From hiragana to keigo. Every lesson comes with a short practice pack.',
   3000, 700, 'approved'),
  ('00000000-0000-0000-0000-0000000000d8', 'hannah@tuitor.test', 'Hannah Weber', 'Europe/Berlin', 'DE',
   'German for work, study and moving to Germany',
   'Goethe-certified teacher. Practical German for visas, jobs and daily life.',
   2600, 600, 'approved'),
  ('00000000-0000-0000-0000-0000000000d9', 'wei@tuitor.test', 'Li Wei', 'Asia/Shanghai', 'CN',
   'Mandarin Chinese and HSK preparation',
   'Tones, characters and real conversation, step by step.',
   2400, 500, 'approved'),
  ('00000000-0000-0000-0000-0000000000da', 'ana@tuitor.test', 'Ana Souza', 'America/Sao_Paulo', 'BR',
   'Brazilian Portuguese the natural way',
   'Relaxed conversation lessons with music, slang and culture.',
   1800, 400, 'approved'),
  ('00000000-0000-0000-0000-0000000000db', 'omar@tuitor.test', 'Omar Haddad', 'Asia/Dubai', 'AE',
   'Arabic (MSA and Gulf dialect)',
   'Awaiting approval.',
   2000, 500, 'pending')
),
users as (
  select pg_temp.seed_user(id, email, name, 'tutor', tz) as uid, t.* from t
)
insert into public.tutor_profiles (user_id, headline, bio, country, hourly_rate_cents, trial_rate_cents, status, lessons_taught)
select u.uid, u.headline, u.bio, u.country, u.rate, u.trial, u.status::public.tutor_status, (random() * 400)::int
  from users u;

-- Look up tutor ids by email for the inserts below.
create temporary table seed_tutor as
  select p.id, u.email from public.profiles p join auth.users u on u.id = p.id where p.role = 'tutor';

insert into public.tutor_languages (tutor_id, language, proficiency, teaches)
select s.id, l.language, l.proficiency, l.teaches
  from seed_tutor s
  join (values
    ('emma@tuitor.test', 'English', 'native', true), ('emma@tuitor.test', 'French', 'B2', false),
    ('daniel@tuitor.test', 'English', 'native', true), ('daniel@tuitor.test', 'Spanish', 'B1', false),
    ('priya@tuitor.test', 'English', 'C2', true), ('priya@tuitor.test', 'Hindi', 'native', true),
    ('lucia@tuitor.test', 'Spanish', 'native', true), ('lucia@tuitor.test', 'English', 'C1', false),
    ('mateo@tuitor.test', 'Italian', 'native', true), ('mateo@tuitor.test', 'English', 'B2', false),
    ('sophie@tuitor.test', 'French', 'native', true), ('sophie@tuitor.test', 'English', 'C1', false),
    ('kenji@tuitor.test', 'Japanese', 'native', true), ('kenji@tuitor.test', 'English', 'B2', false),
    ('hannah@tuitor.test', 'German', 'native', true), ('hannah@tuitor.test', 'English', 'C2', true),
    ('wei@tuitor.test', 'Chinese (Mandarin)', 'native', true), ('wei@tuitor.test', 'English', 'C1', false),
    ('ana@tuitor.test', 'Portuguese', 'native', true), ('ana@tuitor.test', 'Spanish', 'C1', true),
    ('omar@tuitor.test', 'Arabic', 'native', true), ('omar@tuitor.test', 'English', 'C1', false)
  ) as l(email, language, proficiency, teaches) on l.email = s.email;

-- Weekday mornings and evenings in each tutor's local time, plus Saturday mornings.
insert into public.availability_rules (tutor_id, weekday, start_time, end_time)
select s.id, d.weekday, w.start_time, w.end_time
  from seed_tutor s
  cross join generate_series(1, 5) as d(weekday)
  cross join (values (time '09:00', time '13:00'), (time '17:00', time '21:00')) as w(start_time, end_time)
union all
select s.id, 6, time '10:00', time '14:00' from seed_tutor s;

-- Past completed lessons with reviews, so tutors have ratings.
with past(student_email, tutor_email, days_ago, rating, body) as (values
  ('alex@tuitor.test', 'emma@tuitor.test', 20, 5, 'Emma explained exactly what examiners look for. My writing score went up a full band.'),
  ('sam@tuitor.test',  'emma@tuitor.test', 12, 5, 'Very structured and encouraging.'),
  ('alex@tuitor.test', 'lucia@tuitor.test', 15, 5, 'I spoke more Spanish in one hour than in a year of apps.'),
  ('sam@tuitor.test',  'daniel@tuitor.test', 9, 4, 'Great interview practice, very practical.'),
  ('sam@tuitor.test',  'priya@tuitor.test', 7, 5, 'Patient and kind. I finally feel confident speaking.'),
  ('alex@tuitor.test', 'kenji@tuitor.test', 5, 5, 'Fun lessons and great practice packs.'),
  ('alex@tuitor.test', 'sophie@tuitor.test', 3, 4, 'Clear and well organised.')
),
inserted as (
  insert into public.bookings (student_id, tutor_id, starts_at, ends_at, type, status, price_cents, platform_fee_cents, currency)
  select su.id, st.id,
         date_trunc('hour', now()) - make_interval(days => p.days_ago),
         date_trunc('hour', now()) - make_interval(days => p.days_ago) + interval '60 minutes',
         'regular', 'completed', tp.hourly_rate_cents,
         public.platform_fee_cents('regular', tp.hourly_rate_cents), tp.currency
    from past p
    join auth.users su on su.email = p.student_email
    join seed_tutor st on st.email = p.tutor_email
    join public.tutor_profiles tp on tp.user_id = st.id
  returning id, student_id, tutor_id, ends_at
)
insert into public.reviews (booking_id, student_id, tutor_id, rating, body, created_at)
select i.id, i.student_id, i.tutor_id, p.rating, p.body, i.ends_at + interval '2 hours'
  from inserted i
  join auth.users su on su.id = i.student_id
  join seed_tutor st on st.id = i.tutor_id
  join past p on p.student_email = su.email and p.tutor_email = st.email;
