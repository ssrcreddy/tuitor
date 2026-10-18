"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { PAYMENTS_UNAVAILABLE, paymentsConfigured, startCheckout } from "@/lib/payments";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export type HoldState = { error?: string };

const holdSchema = z.object({
  tutor_id: z.guid(), // any well-formed UUID; Postgres validates it
  starts_at: z.iso.datetime(),
  type: z.enum(["trial", "regular"]),
});

/** Reserves the slot, then sends the student to Stripe Checkout. */
export async function holdSlot(_prev: HoldState, formData: FormData): Promise<HoldState> {
  await requireProfile("student");
  if (!paymentsConfigured()) return { error: PAYMENTS_UNAVAILABLE };
  const parsed = holdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "That booking request was invalid. Please pick a time again." };

  const supabase = await createClient();
  const { data: booking, error } = await supabase.rpc("create_booking_hold", {
    p_tutor_id: parsed.data.tutor_id,
    p_starts_at: parsed.data.starts_at,
    p_type: parsed.data.type,
  });
  // create_booking_hold raises user-facing messages for every rule it enforces.
  if (error) return { error: error.message };

  let checkoutUrl: string;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    checkoutUrl = await startCheckout(booking.id, user?.email, await siteOrigin());
  } catch (e) {
    // Don't keep the slot blocked if payment can't start.
    await supabase.rpc("cancel_booking", { p_booking_id: booking.id });
    return { error: e instanceof Error ? e.message : "Could not start payment. Please try again." };
  }
  redirect(checkoutUrl);
}
