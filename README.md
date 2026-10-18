# Tuitor

A language-tutoring marketplace in the style of Preply. Students book live 1:1 lessons with human tutors, and an AI coach helps them between lessons.

Built with Next.js 15 (App Router), Supabase (Postgres, Auth, RLS, Realtime) and Tailwind CSS v4.

## Getting started

Requires Node 24+ and a working Docker engine (for the local Supabase stack).

```bash
npm install
npm run db:start            # starts local Supabase, applies migrations and seed
npx supabase status         # prints the API URL, anon key and service-role key
cp .env.example .env.local  # fill in the three Supabase values
npm run db:types            # regenerate src/lib/database.types.ts from the schema
npm run dev                 # http://localhost:3000
```

After changing the migration or seed, run `npm run db:reset`.

### Test accounts (local seed)

All seed accounts use the password `password123`. They're listed at the top of [`supabase/seed.sql`](supabase/seed.sql). Here are some of them:

| Role    | Email                                                 |
|---------|-------------------------------------------------------|
| Admin   | `admin@tuitor.test`                                   |
| Student | `alex@tuitor.test`, `sam@tuitor.test`                 |
| Tutor   | `emma@tuitor.test` (approved), `omar@tuitor.test` (pending) |

## Deployment

- **App:** https://tuitor.vercel.app (Vercel project `tuitor`). Deploy with `npx vercel deploy --prod`.
- **Database:** Supabase project `tuitor` (`lpfqlfophetfjyuigxij`, us-east-1).
  - Apply new migrations in `supabase/migrations/` there, in order.
  - The live database was loaded once with [`supabase/demo_seed.sql`](supabase/demo_seed.sql): the sample tutors with banned, random-password accounts, and no admin. Never run `seed.sql` against it.
- **Vercel settings:** the deployment needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The anon key holds the project's publishable key. The service-role key isn't used at runtime yet.
- **Admins:** promote an existing account from the Supabase SQL editor:
  `update profiles set role = 'admin' where id = (select id from auth.users where email = '…');`

## Scripts

| Script              | What it does                         |
|---------------------|--------------------------------------|
| `npm run dev`       | Next.js dev server                   |
| `npm run build`     | Production build                     |
| `npm test`          | Unit tests (Vitest)                  |
| `npm run typecheck` | TypeScript check                     |
| `npm run db:reset`  | Re-apply migrations and seed locally |
| `npm run db:types`  | Regenerate database types            |

## How it fits together

- **Schema:** everything lives in [`supabase/migrations/20261017000000_init.sql`](supabase/migrations/20261017000000_init.sql).
  - **Row-level security:** the database enforces every access rule. Column-level grants stop clients writing roles, tutor status, prices or ratings.
  - **Bookings:** these are only created through `create_booking_hold()`. It checks the tutor's availability, the 12-hour lead time and hour alignment. It sets the price and platform fee on the server, then holds the slot for 15 minutes.
  - **Double-booking:** a Postgres exclusion constraint makes overlapping bookings for the same tutor impossible.
- **Scheduling:** [`src/lib/scheduling.ts`](src/lib/scheduling.ts) works out the free slots shown on a tutor's page, and it mirrors the database's rules. Tests cover timezones, DST gaps and lead time.
- **Auth:** this uses Supabase Auth with email/password and Google. [`src/middleware.ts`](src/middleware.ts) refreshes the session and protects `/dashboard`, `/book`, `/lesson`, `/practice` and `/messages`.
- **Commission:** Tuitor keeps the whole trial-lesson fee and a flat 20% of regular lessons. Both are set in `platform_fee_cents()`.

## Roadmap

1. ~~Setup: schema, RLS, seed, auth and roles~~
2. ~~Tutor onboarding, admin approval, search and profiles~~
3. ~~Scheduling and booking: holds, cancel and reschedule (12-hour policy), tutor time off~~
4. Payments: Stripe Checkout and Connect, packages, refunds
5. Lesson room: a Daily.co video room for each booking, plus transcription
6. AI layer: lesson reports (Claude) that the tutor approves, a practice partner, and a progress view
7. Messaging, notifications (Resend) and reviews UI
8. Hardening: rate limits, Sentry, analytics, legal review
