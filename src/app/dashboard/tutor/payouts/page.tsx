import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { syncPayoutAccount } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { PayoutButton } from "./payout-button";

export const metadata = { title: "Payouts · Tuitor" };

export default async function PayoutsPage() {
  const profile = await requireProfile("tutor");
  const supabase = await createClient();

  const { data: tutor } = await supabase
    .from("tutor_profiles")
    .select("stripe_account_id, payouts_enabled, currency")
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!tutor) redirect("/dashboard/tutor/profile");

  // Refresh from Stripe on every visit, so returning from onboarding shows the latest state.
  let account: Awaited<ReturnType<typeof syncPayoutAccount>> | null = null;
  let stripeError: string | null = null;
  if (tutor.stripe_account_id) {
    try {
      account = await syncPayoutAccount(tutor.stripe_account_id);
    } catch (e) {
      stripeError = e instanceof Error ? e.message : "Could not reach Stripe.";
    }
  }

  const { data: lessons } = await supabase
    .from("bookings")
    .select("price_cents, platform_fee_cents, status, refund_due, payments(status, transferred_at)")
    .eq("tutor_id", profile.id)
    .in("status", ["confirmed", "completed"]);

  let paidOut = 0;
  let awaitingPayout = 0;
  let upcoming = 0;
  for (const l of lessons ?? []) {
    const share = l.price_cents - l.platform_fee_cents;
    const paid = l.payments.find((p) => p.status === "succeeded");
    if (!paid || l.refund_due || share <= 0) continue;
    if (paid.transferred_at) paidOut += share;
    else if (l.status === "completed") awaitingPayout += share;
    else upcoming += share;
  }

  const ready = account?.ready ?? false;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Payouts</h1>
        <p className="mt-1 text-muted">
          You&apos;re paid your share of each lesson after it happens. Payouts are sent daily through Stripe.
        </p>
      </header>

      <section className="card space-y-3">
        {ready ? (
          <>
            <p className="font-medium text-success">Payouts are set up.</p>
            <PayoutButton action="dashboard" label="View payouts on Stripe" variant="secondary" />
          </>
        ) : (
          <>
            <p className="font-medium">
              {account?.detailsSubmitted
                ? "Stripe is still checking your details, or needs more information."
                : "Connect a Stripe account to receive payouts."}
            </p>
            <p className="text-sm text-muted">
              Stripe verifies your identity and bank details. Lessons you teach before this is done are paid once
              it&apos;s finished.
            </p>
            <PayoutButton action="setUp" label={tutor.stripe_account_id ? "Continue Stripe setup" : "Set up payouts"} />
          </>
        )}
        {stripeError && (
          <p role="alert" className="text-sm text-danger">
            {stripeError}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Earnings</h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
          {[
            ["Paid out", paidOut],
            ["Awaiting payout", awaitingPayout],
            ["Upcoming lessons", upcoming],
          ].map(([label, cents]) => (
            <div key={label} className="card">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 text-xl font-semibold">{formatMoney(Number(cents), tutor.currency)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">After Tuitor&apos;s 20% commission. Trial lesson fees go to Tuitor.</p>
      </section>
    </div>
  );
}
