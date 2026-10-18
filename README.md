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
- **Vercel settings:**
  - Public: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the project's publishable key).
  - Secret, for payments: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `CRON_SECRET`. Until all are set, booking is paused with a "temporarily unavailable" message and the admin page shows a warning. Redeploy after changing them.
- **Stripe webhook:** add an endpoint for `https://tuitor.vercel.app/api/stripe/webhook` with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` and `charge.refunded`, and enable "Listen to events on connected accounts" with `account.updated`. Its signing secret is `STRIPE_WEBHOOK_SECRET`.
- **Daily job:** Vercel Cron calls `/api/cron/daily` at 07:00 UTC ([`vercel.json`](vercel.json)), sending `CRON_SECRET`. Admins can also run it from the admin page.
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
  - **Bookings:** these are only created through `create_booking_hold()`. It checks the tutor's availability, the 12-hour lead time and hour alignment. It sets the price and platform fee on the server, then holds the slot for 35 minutes while the student pays.
  - **Double-booking:** a Postgres exclusion constraint makes overlapping bookings for the same tutor impossible.
- **Scheduling:** [`src/lib/scheduling.ts`](src/lib/scheduling.ts) works out the free slots shown on a tutor's page, and it mirrors the database's rules. Tests cover timezones, DST gaps and lead time.
- **Auth:** this uses Supabase Auth with email/password and Google. [`src/middleware.ts`](src/middleware.ts) refreshes the session and protects `/dashboard`, `/book`, `/lesson`, `/practice` and `/messages`.
- **Commission:** Tuitor keeps the whole trial-lesson fee and a flat 20% of regular lessons. Both are set in `platform_fee_cents()`.
- **Payments** ([`src/lib/payments.ts`](src/lib/payments.ts), [`supabase/migrations/20261019000000_payments.sql`](supabase/migrations/20261019000000_payments.sql)):
  - Booking holds the slot for 35 minutes and opens Stripe Checkout. The webhook calls `confirm_booking_payment()`; a late payment for a slot someone else took is refunded.
  - Cancellations that are owed a refund are refunded right away; failures are retried by the daily job.
  - Tutors get their share after the lesson (separate charges and transfers via Stripe Connect Express), in the currency the charge settled in.

### Payments: known limits

- **Tutor payouts are untested end to end.** Checkout, webhook confirmation and refunds were tested in Stripe test mode. Connect onboarding was tested up to Stripe's hosted onboarding page, and the daily job up to marking lessons completed. An actual transfer to a tutor hasn't run yet. Before relying on payouts, finish test onboarding for one tutor and run the daily job.
- **The Stripe platform is in Canada, so only tutors in Canada can receive payouts.** Stripe refused payout accounts for tutors in the UK, US and India from a Canadian platform. Other tutors see "Payouts to tutors in <country> aren't available yet." Paying tutors worldwide needs a US Stripe platform (cross-border payouts) or a separate payout provider.
- **Charges are in USD but settle in CAD**, so tutors are paid their share of the CAD amount.

## Roadmap

1. ~~Setup: schema, RLS, seed, auth and roles~~
2. ~~Tutor onboarding, admin approval, search and profiles~~
3. ~~Scheduling and booking: holds, cancel and reschedule (12-hour policy), tutor time off~~
4. ~~Payments: Stripe Checkout, refunds, tutor payouts~~ (payouts untested end to end; packages still to do)
5. Lesson room: a Daily.co video room for each booking, plus transcription
6. AI layer: lesson reports (Claude) that the tutor approves, a practice partner, and a progress view
7. Messaging, notifications (Resend) and reviews UI
8. Hardening: rate limits, Sentry, analytics, legal review
