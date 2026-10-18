import { CHANGE_CUTOFF_HOURS } from "@/lib/scheduling";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

/** A booking with both participants' names, as visible to the signed-in user (RLS applies). */
export async function loadLesson(supabase: Supabase, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase
    .from("bookings")
    .select(
      `*, tutor:tutor_profiles(profile:profiles!tutor_profiles_user_id_fkey(full_name, timezone)),
       student:profiles!bookings_student_id_fkey(full_name)`,
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

export type Lesson = NonNullable<Awaited<ReturnType<typeof loadLesson>>>;

/**
 * What the viewer may do with a lesson right now. Mirrors the rules in
 * cancel_booking() and reschedule_booking(), which remain the source of truth.
 */
export function lessonState(lesson: Lesson, viewerId: string, now = Date.now()) {
  const startsIn = new Date(lesson.starts_at).getTime() - now;
  const holdExpired =
    lesson.status === "pending_payment" && new Date(lesson.hold_expires_at ?? 0).getTime() <= now;
  const upcoming = startsIn > 0 && !holdExpired && (lesson.status === "confirmed" || lesson.status === "pending_payment");
  const beforeCutoff = startsIn >= CHANGE_CUTOFF_HOURS * 3_600_000;
  const isStudent = lesson.student_id === viewerId;

  return {
    isStudent,
    isTutor: lesson.tutor_id === viewerId,
    holdExpired,
    upcoming,
    beforeCutoff,
    canCancel: upcoming,
    canReschedule: upcoming && isStudent && beforeCutoff,
    statusLabel: holdExpired ? "Reservation expired" : (STATUS_LABEL[lesson.status] ?? lesson.status),
  };
}
