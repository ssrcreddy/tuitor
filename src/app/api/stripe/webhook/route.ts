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
 * Stripe webhook. Subscribe it to: checkout.session.completed,
 * checkout.session.async_payment_succeeded, checkout.session.expired,
 * charge.refunded, and (for connected accounts) account.updated.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

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
