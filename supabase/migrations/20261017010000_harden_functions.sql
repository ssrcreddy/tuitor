-- Security hardening from the Supabase database linter.

-- Pin search_path on helper functions.
alter function public.lesson_minutes() set search_path = '';
alter function public.platform_fee_cents(public.booking_type, integer) set search_path = '';
alter function public.touch_updated_at() set search_path = '';

-- Trigger-only functions should not be callable through the API.
-- Triggers still fire: EXECUTE is only checked when a trigger is created.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.refresh_tutor_rating() from public, anon, authenticated;
revoke execute on function public.set_reviewer_name() from public, anon, authenticated;

-- Keep extensions out of the API-exposed public schema.
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- Intentionally callable through the API:
--   is_admin()              used by RLS policies; only reveals the caller's own role
--   tutor_busy_times()      public free/busy times, without who booked them
--   create_booking_hold()   the only way students create bookings (signed-in only)
