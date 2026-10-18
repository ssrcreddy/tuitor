import Stripe from "stripe";

let client: Stripe | null = null;

/** Server-side Stripe client. Throws if STRIPE_SECRET_KEY isn't configured. */
export function getStripe() {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Payments aren't configured (STRIPE_SECRET_KEY is missing).");
    client = new Stripe(key);
  }
  return client;
}

/** A Connect account can receive tutor payouts. */
export function isPayoutReady(account: Stripe.Account) {
  return Boolean(account.payouts_enabled) && account.capabilities?.transfers === "active";
}
