import type Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  handleAccountUpdated,
  handleChargeRefunded,
  handleCheckoutCompleted,
  handleCheckoutExpired,
} from "@/lib/payments";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Stripe webhook, shared by two Stripe endpoints with their own signing secrets:
 * - STRIPE_WEBHOOK_SECRET: this account's checkout.session.completed,
 *   checkout.session.async_payment_succeeded, checkout.session.expired and
 *   charge.refunded events.
 * - STRIPE_CONNECT_WEBHOOK_SECRET (optional): connected accounts' account.updated.
 */
export async function POST(request: Request) {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => Boolean(s),
  );
  const signature = request.headers.get("stripe-signature");
  if (secrets.length === 0 || !signature) return NextResponse.json({ error: "Not configured" }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = getStripe().webhooks.constructEvent(payload, signature, secret);
      break;
    } catch {
      // Try the next endpoint's secret.
    }
  }
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "checkout.session.expired":
        await handleCheckoutExpired(event.data.object);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object);
        break;
    }
  } catch (error) {
    // A 500 makes Stripe retry the event later.
    console.error(`Stripe webhook ${event.type} (${event.id}) failed`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
