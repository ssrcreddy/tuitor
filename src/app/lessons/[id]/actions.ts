"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
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
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: id, p_reason: reason });
  if (error) return { error: error.message };

  revalidateLesson(id);
  return {};
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
