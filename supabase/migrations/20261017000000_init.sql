-- Tuitor core schema: users, tutors, availability, bookings, payments,
-- AI lesson reports, reviews, messaging and AI practice.
--
-- Conventions
--   * Money is stored in minor units (cents) as integers.
--   * Timestamps are timestamptz (UTC). Availability rules are wall-clock
--     times in the tutor's own timezone (profiles.timezone).
--   * Every lesson is LESSON_MINUTES long and starts on the hour in the
--     tutor's local time.
--   * Rows that affect money or trust (bookings, payments, packages, lesson
--     reports) are written only by security-definer functions or the service
--     role, never directly by clients.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('student', 'tutor', 'admin');
create type public.tutor_status as enum ('pending', 'approved', 'rejected');
create type public.booking_type as enum ('trial', 'regular');
create type public.booking_status as enum (
  'pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show'
);
create type public.payment_status as enum ('pending', 'succeeded', 'refunded', 'failed');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'student',
  full_name   text not null default '',
  avatar_url  text,
  timezone    text not null default 'UTC'
              check (now() at time zone timezone is not null),
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Create a profile for every new auth user. Sign-up may request the
-- 'student' or 'tutor' role; 'admin' is only ever granted by an operator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.user_role := 'student';
  v_tz   text := coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC');
begin
  if new.raw_user_meta_data ->> 'role' = 'tutor' then
    v_role := 'tutor';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;

  insert into public.profiles (id, role, full_name, timezone)
  values (new.id, v_role, coalesce(new.raw_user_meta_data ->> 'full_name', ''), v_tz);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Tutors
-- ---------------------------------------------------------------------------
create table public.tutor_profiles (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  headline           text not null default '',
  bio                text not null default '',
  video_url          text,
  country            text,
  hourly_rate_cents  integer not null default 2000 check (hourly_rate_cents between 100 and 100000),
  trial_rate_cents   integer not null default 500 check (trial_rate_cents between 0 and 100000),
  currency           text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status             public.tutor_status not null default 'pending',
  stripe_account_id  text,
  rating_avg         numeric(3, 2) not null default 0,
  review_count       integer not null default 0,
  lessons_taught     integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index tutor_profiles_status_idx on public.tutor_profiles (status);

create table public.tutor_languages (
  id           bigint generated always as identity primary key,
  tutor_id     uuid not null references public.tutor_profiles (user_id) on delete cascade,
  language     text not null,
  proficiency  text not null check (proficiency in ('native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1')),
  teaches      boolean not null default false,
  unique (tutor_id, language)
);

create index tutor_languages_teaches_idx on public.tutor_languages (language) where teaches;

-- Weekly recurring availability, in the tutor's local wall-clock time.
create table public.availability_rules (
  id          bigint generated always as identity primary key,
  tutor_id    uuid not null references public.tutor_profiles (user_id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time  time not null,
  end_time    time not null, -- "24:00" for midnight
  check (end_time > start_time)
);

create index availability_rules_tutor_idx on public.availability_rules (tutor_id);

-- One-off blocked periods (holidays etc.).
create table public.availability_exceptions (
  id         bigint generated always as identity primary key,
  tutor_id   uuid not null references public.tutor_profiles (user_id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  note       text,
  check (ends_at > starts_at)
);

create index availability_exceptions_tutor_idx on public.availability_exceptions (tutor_id, starts_at);

-- ---------------------------------------------------------------------------
-- Bookings, payments, packages
-- ---------------------------------------------------------------------------
create table public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.profiles (id) on delete restrict,
  tutor_id            uuid not null references public.tutor_profiles (user_id) on delete restrict,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  type                public.booking_type not null,
  status              public.booking_status not null default 'pending_payment',
  price_cents         integer not null check (price_cents >= 0),
  platform_fee_cents  integer not null check (platform_fee_cents between 0 and price_cents),
  currency            text not null,
  hold_expires_at     timestamptz,
  package_id          uuid,
  daily_room_url      text,
  created_at          timestamptz not null default now(),
  check (ends_at > starts_at),
  check (student_id <> tutor_id),
  -- A tutor can never have two live bookings that overlap.
  constraint bookings_no_overlap exclude using gist (
    tutor_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending_payment', 'confirmed', 'completed'))
);

create index bookings_student_idx on public.bookings (student_id, starts_at desc);
create index bookings_tutor_idx on public.bookings (tutor_id, starts_at desc);

-- One trial lesson per student per tutor.
create unique index bookings_one_trial_idx
  on public.bookings (student_id, tutor_id)
  where type = 'trial' and status <> 'cancelled';

create table public.packages (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles (id) on delete restrict,
  tutor_id       uuid not null references public.tutor_profiles (user_id) on delete restrict,
  credits_total  integer not null check (credits_total > 0),
  credits_used   integer not null default 0 check (credits_used between 0 and credits_total),
  price_cents    integer not null check (price_cents >= 0),
  currency       text not null,
  created_at     timestamptz not null default now()
);

alter table public.bookings
  add constraint bookings_package_fk foreign key (package_id) references public.packages (id);

create table public.payments (
  id                         uuid primary key default gen_random_uuid(),
  booking_id                 uuid references public.bookings (id) on delete restrict,
  package_id                 uuid references public.packages (id) on delete restrict,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,
  amount_cents               integer not null check (amount_cents >= 0),
  currency                   text not null,
  status                     public.payment_status not null default 'pending',
  created_at                 timestamptz not null default now(),
  check ((booking_id is null) <> (package_id is null))
);

-- ---------------------------------------------------------------------------
-- AI lesson reports and reviews
-- ---------------------------------------------------------------------------
create table public.lesson_reports (
  booking_id   uuid primary key references public.bookings (id) on delete cascade,
  transcript   text,
  summary      text not null default '',
  corrections  jsonb not null default '[]'::jsonb, -- [{ "said", "better", "note" }]
  vocabulary   jsonb not null default '[]'::jsonb, -- [{ "term", "meaning", "example" }]
  homework     text not null default '',
  cefr_estimate text check (cefr_estimate in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  generated_at timestamptz,
  approved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table public.reviews (
  booking_id  uuid primary key references public.bookings (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  tutor_id    uuid not null references public.tutor_profiles (user_id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text not null default '' check (char_length(body) <= 2000),
  -- Student first name, copied on insert: reviews are public, student profiles are not.
  reviewer_name text not null default '',
  created_at  timestamptz not null default now()
);

create index reviews_tutor_idx on public.reviews (tutor_id, created_at desc);

create or replace function public.set_reviewer_name()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'Student')
    into new.reviewer_name
    from public.profiles where id = new.student_id;
  return new;
end;
$$;

create trigger reviews_set_reviewer_name
  before insert on public.reviews
  for each row execute function public.set_reviewer_name();

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  tutor_id    uuid not null references public.tutor_profiles (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (student_id, tutor_id),
  check (student_id <> tutor_id)
);

create table public.messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 4000),
  created_at       timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- AI practice partner
-- ---------------------------------------------------------------------------
create table public.practice_sessions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  language    text not null,
  level       text check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  topic       text,
  created_at  timestamptz not null default now()
);

create table public.practice_messages (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.practice_sessions (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index practice_messages_session_idx on public.practice_messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tutor_profiles_touch
  before update on public.tutor_profiles
  for each row execute function public.touch_updated_at();

-- Keep tutor rating aggregates in sync with reviews.
create or replace function public.refresh_tutor_rating()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tutor uuid := coalesce(new.tutor_id, old.tutor_id);
begin
  update public.tutor_profiles t
     set rating_avg   = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where tutor_id = v_tutor), 0),
         review_count = (select count(*) from public.reviews where tutor_id = v_tutor)
   where t.user_id = v_tutor;
  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_tutor_rating();

-- ---------------------------------------------------------------------------
-- Booking functions
-- ---------------------------------------------------------------------------
create or replace function public.lesson_minutes()
returns integer language sql immutable as $$ select 60 $$;

-- Platform fee: the whole trial fee, and a flat 20% commission on regular lessons.
create or replace function public.platform_fee_cents(p_type public.booking_type, p_price integer)
returns integer language sql immutable as $$
  select case when p_type = 'trial' then p_price else round(p_price * 0.20)::integer end
$$;

-- Busy intervals for a tutor, so clients can render free slots without being
-- able to read other students' bookings.
create or replace function public.tutor_busy_times(p_tutor_id uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select b.starts_at, b.ends_at
    from public.bookings b
   where b.tutor_id = p_tutor_id
     and b.starts_at < p_to and b.ends_at > p_from
     and (b.status in ('confirmed', 'completed')
          or (b.status = 'pending_payment' and b.hold_expires_at > now()))
  union all
  select e.starts_at, e.ends_at
    from public.availability_exceptions e
   where e.tutor_id = p_tutor_id
     and e.starts_at < p_to and e.ends_at > p_from;
$$;

-- Reserve a slot for the calling student for 15 minutes while they pay.
-- Validates availability, lead time and alignment, and sets the price
-- server-side. Payment confirmation (webhook) flips it to 'confirmed'.
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
  v_tz      text;
  v_local   timestamp;
  v_ends    timestamptz := p_starts_at + make_interval(mins => public.lesson_minutes());
  v_price   integer;
  v_booking public.bookings;
begin
  if v_student is null then
    raise exception 'You must be signed in to book.' using errcode = '28000';
  end if;
  if v_student = p_tutor_id then
    raise exception 'You cannot book a lesson with yourself.' using errcode = '22023';
  end if;

  select * into v_tutor from public.tutor_profiles where user_id = p_tutor_id and status = 'approved';
  if not found then
    raise exception 'This tutor is not accepting bookings.' using errcode = '22023';
  end if;

  if p_starts_at < now() + interval '12 hours' then
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
  ) then
    raise exception 'The tutor is not available at that time.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.availability_exceptions e
     where e.tutor_id = p_tutor_id and e.starts_at < v_ends and e.ends_at > p_starts_at
  ) then
    raise exception 'The tutor is not available at that time.' using errcode = '22023';
  end if;

  -- Release this tutor's abandoned holds so they don't block the slot.
  update public.bookings
     set status = 'cancelled'
   where tutor_id = p_tutor_id
     and status = 'pending_payment'
     and hold_expires_at <= now();

  v_price := case when p_type = 'trial' then v_tutor.trial_rate_cents else v_tutor.hourly_rate_cents end;

  begin
    insert into public.bookings (
      student_id, tutor_id, starts_at, ends_at, type, status,
      price_cents, platform_fee_cents, currency, hold_expires_at
    ) values (
      v_student, p_tutor_id, p_starts_at, v_ends, p_type, 'pending_payment',
      v_price, public.platform_fee_cents(p_type, v_price), v_tutor.currency,
      now() + interval '15 minutes'
    )
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'That slot was just taken. Please pick another time.' using errcode = '23P01';
    when unique_violation then
      raise exception 'You have already booked a trial lesson with this tutor.' using errcode = '23505';
  end;

  return v_booking;
end;
$$;

revoke execute on function public.create_booking_hold(uuid, timestamptz, public.booking_type) from public, anon;
grant execute on function public.create_booking_hold(uuid, timestamptz, public.booking_type) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.tutor_profiles          enable row level security;
alter table public.tutor_languages         enable row level security;
alter table public.availability_rules      enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.bookings                enable row level security;
alter table public.packages                enable row level security;
alter table public.payments                enable row level security;
alter table public.lesson_reports          enable row level security;
alter table public.reviews                 enable row level security;
alter table public.conversations           enable row level security;
alter table public.messages                enable row level security;
alter table public.practice_sessions       enable row level security;
alter table public.practice_messages       enable row level security;

-- Column-level write permissions: clients may only edit harmless fields.
-- Everything else (roles, tutor status, Stripe ids, ratings) is server-only.
revoke insert, update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, timezone) on public.profiles to authenticated;

revoke insert, update on public.tutor_profiles from anon, authenticated;
grant insert (user_id, headline, bio, video_url, country, hourly_rate_cents, trial_rate_cents, currency)
  on public.tutor_profiles to authenticated;
grant update (headline, bio, video_url, country, hourly_rate_cents, trial_rate_cents, currency)
  on public.tutor_profiles to authenticated;

revoke insert, update, delete on public.bookings, public.packages, public.payments from anon, authenticated;

revoke insert, update, delete on public.lesson_reports from anon, authenticated;
grant update (summary, corrections, vocabulary, homework, approved_at) on public.lesson_reports to authenticated;

revoke update on public.reviews from anon, authenticated;
grant update (rating, body) on public.reviews to authenticated;

revoke update on public.messages, public.practice_messages from anon, authenticated;

-- profiles: yourself, approved tutors (public), and people you have a
-- booking or conversation with.
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.tutor_profiles t where t.user_id = profiles.id and t.status = 'approved')
  or exists (select 1 from public.bookings b
              where (b.student_id = auth.uid() and b.tutor_id = profiles.id)
                 or (b.tutor_id = auth.uid() and b.student_id = profiles.id))
  or exists (select 1 from public.conversations c
              where (c.student_id = auth.uid() and c.tutor_id = profiles.id)
                 or (c.tutor_id = auth.uid() and c.student_id = profiles.id))
);
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- tutor_profiles: approved ones are public; owners and admins see all.
create policy tutor_profiles_select on public.tutor_profiles for select
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy tutor_profiles_insert_own on public.tutor_profiles for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'tutor')
  );
create policy tutor_profiles_update_own on public.tutor_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tutor-owned child tables: readable when the tutor is visible, writable by the tutor.
create policy tutor_languages_select on public.tutor_languages for select
  using (exists (select 1 from public.tutor_profiles t where t.user_id = tutor_languages.tutor_id));
create policy tutor_languages_write on public.tutor_languages for all
  using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());

create policy availability_rules_select on public.availability_rules for select
  using (exists (select 1 from public.tutor_profiles t where t.user_id = availability_rules.tutor_id));
create policy availability_rules_write on public.availability_rules for all
  using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());

-- Exceptions may carry private notes; others see busy times via tutor_busy_times().
create policy availability_exceptions_own on public.availability_exceptions for all
  using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());

-- Money tables: participants read, the server writes.
create policy bookings_select on public.bookings for select
  using (student_id = auth.uid() or tutor_id = auth.uid() or public.is_admin());
create policy packages_select on public.packages for select
  using (student_id = auth.uid() or tutor_id = auth.uid() or public.is_admin());
create policy payments_select on public.payments for select using (
  public.is_admin()
  or exists (select 1 from public.bookings b where b.id = payments.booking_id and b.student_id = auth.uid())
  or exists (select 1 from public.packages k where k.id = payments.package_id and k.student_id = auth.uid())
);

-- Lesson reports: the tutor reviews and approves; the student sees approved ones.
create policy lesson_reports_select on public.lesson_reports for select using (
  public.is_admin()
  or exists (
    select 1 from public.bookings b
     where b.id = lesson_reports.booking_id
       and (b.tutor_id = auth.uid() or (b.student_id = auth.uid() and lesson_reports.approved_at is not null))
  )
);
create policy lesson_reports_update_tutor on public.lesson_reports for update
  using (exists (select 1 from public.bookings b where b.id = lesson_reports.booking_id and b.tutor_id = auth.uid()))
  with check (exists (select 1 from public.bookings b where b.id = lesson_reports.booking_id and b.tutor_id = auth.uid()));

-- Reviews are public; only the student of a completed lesson can write one.
create policy reviews_select on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.bookings b
     where b.id = reviews.booking_id
       and b.student_id = auth.uid()
       and b.tutor_id = reviews.tutor_id
       and b.status = 'completed'
  )
);
create policy reviews_update_own on public.reviews for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- Conversations and messages: participants only.
create policy conversations_select on public.conversations for select
  using (student_id = auth.uid() or tutor_id = auth.uid());
create policy conversations_insert on public.conversations for insert
  with check (
    (student_id = auth.uid() or tutor_id = auth.uid())
    and exists (select 1 from public.tutor_profiles t where t.user_id = conversations.tutor_id and t.status = 'approved')
  );

create policy messages_select on public.messages for select using (
  exists (select 1 from public.conversations c
           where c.id = messages.conversation_id
             and (c.student_id = auth.uid() or c.tutor_id = auth.uid()))
);
create policy messages_insert on public.messages for insert with check (
  sender_id = auth.uid()
  and exists (select 1 from public.conversations c
               where c.id = messages.conversation_id
                 and (c.student_id = auth.uid() or c.tutor_id = auth.uid()))
);

-- AI practice: private to the student. Assistant turns are written by the server.
create policy practice_sessions_own on public.practice_sessions for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy practice_messages_select on public.practice_messages for select using (
  exists (select 1 from public.practice_sessions s where s.id = practice_messages.session_id and s.student_id = auth.uid())
);
create policy practice_messages_insert_user on public.practice_messages for insert with check (
  role = 'user'
  and exists (select 1 from public.practice_sessions s where s.id = practice_messages.session_id and s.student_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
