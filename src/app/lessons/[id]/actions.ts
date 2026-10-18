"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { expireOpenCheckout, processRefunds, startCheckout } from "@/lib/payments";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export type LessonActionState = { error?: string };

function revalidateLesson(id: string) {
  revalidatePath(`/lessons/${id}`);
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/tutor");
}

export async function cancelLesson(id: string, _prev: LessonActionState, formData: FormData): Promise<LessonActionState> {
  await requireProfile();
  const reason = String(formData.get("reason") ?? "").slice(0, 500);

  const supabase = await createClient();
  // cancel_booking() enforces who may cancel and decides whether a refund is due.
  const { data: booking, error } = await supabase.rpc("cancel_booking", { p_booking_id: id, p_reason: reason });
  if (error) return { error: error.message };

  if (booking.refund_due) {
    // A failed refund is recorded on the payment and retried by the daily job.
    await processRefunds(id).catch((e) => console.error(`Refund for booking ${id} failed`, e));
  } else if (booking.refund_due === null) {
    // An unpaid hold: close its Checkout page so it can't be paid any more.
    await expireOpenCheckout(id);
  }

  revalidateLesson(id);
  return {};
}

export async function completePayment(id: string): Promise<LessonActionState> {
  await requireProfile("student");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS: the student can only see their own booking.
  const { data: booking } = await supabase.from("bookings").select("id, status").eq("id", id).maybeSingle();
  if (!booking || booking.status !== "pending_payment") return { error: "This reservation is no longer available." };

  let url: string;
  try {
    url = await startCheckout(id, user?.email, await siteOrigin());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start payment." };
  }
  redirect(url);
}

export async function rescheduleLesson(
  id: string,
  _prev: LessonActionState,
  formData: FormData,
): Promise<LessonActionState> {
  await requireProfile("student");
  const startsAt = z.iso.datetime().safeParse(formData.get("starts_at"));
  if (!startsAt.success) return { error: "Please pick a new time." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reschedule_booking", { p_booking_id: id, p_new_starts_at: startsAt.data });
  if (error) return { error: error.message };

  revalidateLesson(id);
  redirect(`/lessons/${id}?rescheduled=1`);
}
