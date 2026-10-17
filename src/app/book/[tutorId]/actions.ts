"use server";

import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type HoldState = { error?: string; bookingId?: string; holdExpiresAt?: string };

const holdSchema = z.object({
  tutor_id: z.guid(), // any well-formed UUID; Postgres validates it
  starts_at: z.iso.datetime(),
  type: z.enum(["trial", "regular"]),
});

export async function holdSlot(_prev: HoldState, formData: FormData): Promise<HoldState> {
  await requireProfile("student");
  const parsed = holdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "That booking request was invalid. Please pick a time again." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking_hold", {
    p_tutor_id: parsed.data.tutor_id,
    p_starts_at: parsed.data.starts_at,
    p_type: parsed.data.type,
  });

  // create_booking_hold raises user-facing messages for every rule it enforces.
  if (error) return { error: error.message };

  // TODO(phase 4): create a Stripe Checkout session for this booking and redirect to it.
  return { bookingId: data.id, holdExpiresAt: data.hold_expires_at ?? undefined };
}
