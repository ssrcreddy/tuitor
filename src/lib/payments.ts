import type Stripe from "stripe";
import { formatInTimeZone } from "date-fns-tz";
import { getStripe, isPayoutReady } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

// Server-only payment operations. These use the service-role client, so
// callers must check who the user is first.

/** Stripe's minimum Checkout lifetime is 30 minutes; holds last hold_minutes() (35). */
const CHECKOUT_MINUTES = 31;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Returns a Stripe Checkout URL for an unpaid hold, reusing an open session if there is one. */
export async function startCheckout(bookingId: string, email: string | undefined, origin: string) {
  const admin = createAdminClient();
  const stripe = getStripe();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, type, status, starts_at, price_cents, currency, tutor:tutor_profiles(profile:profiles!tutor_profiles_user_id_fkey(full_name))")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.status !== "pending_payment") throw new Error("This reservation is no longer available.");

  const { data: pending } = await admin
    .from("payments")
    .select("stripe_checkout_session_id")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .maybeSingle();
  if (pending?.stripe_checkout_session_id) {
    const open = await stripe.checkout.sessions.retrieve(pending.stripe_checkout_session_id);
    if (open.status === "open" && open.url) return open.url;
    await admin
      .from("payments")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("stripe_checkout_session_id", open.id)
      .eq("status", "pending");
  }

  const tutorName = booking.tutor?.profile?.full_name ?? "your tutor";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    client_reference_id: booking.id,
    metadata: { booking_id: booking.id },
    payment_intent_data: { metadata: { booking_id: booking.id }, transfer_group: booking.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: booking.currency.toLowerCase(),
          unit_amount: booking.price_cents,
          product_data: {
            name: `${booking.type === "trial" ? "Trial lesson" : "Lesson"} with ${tutorName}`,
            description: `60 minutes, ${formatInTimeZone(new Date(booking.starts_at), "UTC", "EEE d MMM yyyy, HH:mm")} UTC`,
          },
        },
      },
    ],
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60,
    success_url: `${origin}/lessons/${booking.id}?paid=1`,
    cancel_url: `${origin}/lessons/${booking.id}`,
  });

  const { error } = await admin.from("payments").insert({
    booking_id: booking.id,
    stripe_checkout_session_id: session.id,
    amount_cents: booking.price_cents,
    currency: booking.currency,
    status: "pending",
  });
  if (error) throw new Error("Could not start payment. Please try again.");
  return session.url!;
}

/** Best effort: close an open Checkout page for a hold the student cancelled. */
export async function expireOpenCheckout(bookingId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payments")
    .select("stripe_checkout_session_id")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .maybeSingle();
  if (!data?.stripe_checkout_session_id) return;
  try {
    await getStripe().checkout.sessions.expire(data.stripe_checkout_session_id);
  } catch {
    // Already completed or expired; the webhook handles either outcome.
  }
}

// ---------------------------------------------------------------------------
// Webhook handlers
// ---------------------------------------------------------------------------

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId || session.payment_status !== "paid") return;

  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!intentId) throw new Error(`Checkout session ${session.id} has no payment intent`);
  const intent = await getStripe().paymentIntents.retrieve(intentId);
  const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;

  const { data: outcome, error } = await createAdminClient().rpc("confirm_booking_payment", {
    p_booking_id: bookingId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: intentId,
    p_charge_id: chargeId ?? "",
    p_amount_cents: session.amount_total ?? 0,
  });
  if (error) throw new Error(error.message);
  if (outcome === "refund_needed") await processRefunds(bookingId);
}

export async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return;
  const { error } = await createAdminClient().rpc("expire_booking_hold", {
    p_booking_id: bookingId,
    p_checkout_session_id: session.id,
  });
  if (error) throw new Error(error.message);
}

/** Keeps payments in sync with refunds made here or in the Stripe dashboard. */
export async function handleChargeRefunded(charge: Stripe.Charge) {
  if (!charge.refunded) return; // partial refunds aren't used
  await createAdminClient()
    .from("payments")
    .update({ status: "refunded", refunded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("stripe_charge_id", charge.id)
    .neq("status", "refunded");
}

export async function handleAccountUpdated(account: Stripe.Account) {
  await createAdminClient()
    .from("tutor_profiles")
    .update({ payouts_enabled: isPayoutReady(account) })
    .eq("stripe_account_id", account.id);
}

// ---------------------------------------------------------------------------
// Refunds and payouts
// ---------------------------------------------------------------------------

/** Refunds paid bookings that are owed a refund. Failures are recorded on the payment for retry. */
export async function processRefunds(bookingId?: string) {
  const admin = createAdminClient();
  const { data: due, error } = await admin.rpc("refunds_due", { p_booking_id: bookingId });
  if (error) throw new Error(error.message);

  let refunded = 0;
  let failed = 0;
  for (const row of due ?? []) {
    try {
      const refund = await getStripe().refunds.create(
        { payment_intent: row.stripe_payment_intent_id, metadata: { booking_id: row.booking_id } },
        { idempotencyKey: `refund-${row.payment_id}` },
      );
      await admin
        .from("payments")
        .update({
          status: "refunded",
          stripe_refund_id: refund.id,
          refunded_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.payment_id);
      refunded++;
    } catch (e) {
      await admin.from("payments").update({ last_error: `Refund failed: ${errorMessage(e)}` }).eq("id", row.payment_id);
      failed++;
    }
  }
  return { refunded, failed };
}

/**
 * Transfers the tutor's share of completed, paid lessons to their Stripe account.
 *
 * A charge settles in the platform's currency (a Canadian platform charging
 * USD settles in CAD), and a transfer funded by that charge must use the same
 * currency. So the tutor gets their share of the settled gross amount.
 */
export async function processPayouts() {
  const admin = createAdminClient();
  const stripe = getStripe();
  const { data: due, error } = await admin.rpc("payouts_due");
  if (error) throw new Error(error.message);

  let paid = 0;
  let failed = 0;
  for (const row of due ?? []) {
    try {
      const charge = await stripe.charges.retrieve(row.stripe_charge_id, { expand: ["balance_transaction"] });
      const settled = charge.balance_transaction as Stripe.BalanceTransaction | null;
      if (!settled) throw new Error("The payment hasn't settled yet.");
      const amount = Math.floor((settled.amount * row.amount_cents) / charge.amount);

      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: settled.currency,
          destination: row.stripe_account_id,
          source_transaction: row.stripe_charge_id,
          transfer_group: row.booking_id,
          metadata: { booking_id: row.booking_id, share_cents: row.amount_cents, share_currency: row.currency },
        },
        { idempotencyKey: `payout-${row.payment_id}` },
      );
      await admin
        .from("payments")
        .update({
          stripe_transfer_id: transfer.id,
          transferred_at: new Date().toISOString(),
          transfer_amount_cents: transfer.amount,
          transfer_currency: transfer.currency.toUpperCase(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.payment_id);
      paid++;
    } catch (e) {
      await admin.from("payments").update({ last_error: `Payout failed: ${errorMessage(e)}` }).eq("id", row.payment_id);
      failed++;
    }
  }
  return { paid, failed };
}

/** The daily job: complete finished lessons, retry refunds, pay tutors. */
export async function runDailyJobs() {
  const { data: completed, error } = await createAdminClient().rpc("complete_past_lessons");
  if (error) throw new Error(error.message);
  const refunds = await processRefunds();
  const payouts = await processPayouts();
  return { completed: completed ?? 0, refunds, payouts };
}

// ---------------------------------------------------------------------------
// Tutor payout accounts (Stripe Connect Express)
// ---------------------------------------------------------------------------

/** Creates the tutor's Connect account if needed and returns a Stripe onboarding URL. */
export async function startPayoutOnboarding(tutorId: string, email: string | undefined, origin: string) {
  const admin = createAdminClient();
  const stripe = getStripe();

  const { data: tutor } = await admin
    .from("tutor_profiles")
    .select("stripe_account_id, country")
    .eq("user_id", tutorId)
    .single();
  if (!tutor) throw new Error("Create your tutor profile first.");

  let accountId = tutor.stripe_account_id;
  if (!accountId) {
    const platform = await stripe.accounts.retrieveCurrent();
    const country = tutor.country ?? platform.country ?? "US";
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.create({
        type: "express",
        country,
        email,
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        metadata: { tutor_id: tutorId },
        // Tutors outside the platform's country can only receive payouts as recipients.
        ...(country !== platform.country ? { tos_acceptance: { service_agreement: "recipient" as const } } : {}),
      });
    } catch (e) {
      // Which countries a platform can pay depends on where it's based (see README).
      if (e instanceof Error && /not supported for platforms|cannot be created by platforms/i.test(e.message)) {
        const place = new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country;
        throw new Error(`Payouts to tutors in ${place} aren't available yet. We'll let you know when they are.`);
      }
      throw e;
    }
    accountId = account.id;
    await admin.from("tutor_profiles").update({ stripe_account_id: accountId }).eq("user_id", tutorId);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${origin}/dashboard/tutor/payouts?refresh=1`,
    return_url: `${origin}/dashboard/tutor/payouts`,
  });
  return link.url;
}

/** Refreshes payouts_enabled from Stripe and describes the account's state. */
export async function syncPayoutAccount(accountId: string) {
  const account = await getStripe().accounts.retrieve(accountId);
  const ready = isPayoutReady(account);
  await createAdminClient().from("tutor_profiles").update({ payouts_enabled: ready }).eq("stripe_account_id", accountId);
  return {
    ready,
    detailsSubmitted: account.details_submitted,
    needsInfo: (account.requirements?.currently_due?.length ?? 0) > 0,
  };
}

export async function payoutDashboardUrl(accountId: string) {
  return (await getStripe().accounts.createLoginLink(accountId)).url;
}
