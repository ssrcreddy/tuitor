import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { lessonState, loadLesson, type Lesson } from "@/lib/lessons";
import { CHANGE_CUTOFF_HOURS, LESSON_MINUTES } from "@/lib/scheduling";
import { createClient } from "@/lib/supabase/server";
import { CancelForm } from "./cancel-form";
import { PayButton } from "./pay-button";

export const metadata = { title: "Lesson · Tuitor" };

const LONG_DATE: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rescheduled?: string; paid?: string }>;
}) {
  const [{ id }, { rescheduled, paid }] = await Promise.all([params, searchParams]);
  const profile = await requireProfile();
  const supabase = await createClient();

  const lesson = await loadLesson(supabase, id);
  if (!lesson) notFound();

  const state = lessonState(lesson, profile.id);
  const { data: payment } = await supabase
    .from("payments")
    .select("status, refunded_at, transferred_at, last_error")
    .eq("booking_id", id)
    .in("status", ["succeeded", "refunded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const confirming = Boolean(paid) && lesson.status === "pending_payment";
  const tutorName = lesson.tutor?.profile?.full_name ?? "Tutor";
  const studentName = lesson.student?.full_name ?? "Student";
  const counterpart = state.isStudent ? tutorName : studentName;
  const back = state.isStudent ? "/dashboard/student" : "/dashboard/tutor";

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <Link href={back} className="text-sm text-muted hover:text-brand">
        ← My lessons
      </Link>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {lesson.type === "trial" ? "Trial lesson" : "Lesson"} with {counterpart}
        </h1>
        <span className="chip">{state.statusLabel}</span>
      </header>

      {confirming && (
        <p role="status" className="rounded-lg bg-surface p-3 text-sm">
          Payment received. Confirming your lesson…
          <AutoRefresh />
        </p>
      )}
      {paid && lesson.status === "confirmed" && (
        <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
          Payment received. Your lesson is confirmed.
        </p>
      )}

      {rescheduled && state.upcoming && (
        <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
          Lesson rescheduled. Your new time is below.
        </p>
      )}

      <dl className="card grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-muted">When</dt>
        <dd className="text-right font-medium">
          <LocalTime iso={lesson.starts_at} options={LONG_DATE} />
        </dd>
        <dt className="text-muted">Length</dt>
        <dd className="text-right font-medium">{LESSON_MINUTES} minutes</dd>
        {lesson.status !== "cancelled" && (
          <>
            <dt className="text-muted">{state.isStudent ? "Price" : "You earn"}</dt>
            <dd className="text-right font-medium">
              {formatMoney(
                state.isStudent ? lesson.price_cents : lesson.price_cents - lesson.platform_fee_cents,
                lesson.currency,
              )}
            </dd>
          </>
        )}
        {lesson.reschedule_count > 0 && (
          <>
            <dt className="text-muted">Rescheduled</dt>
            <dd className="text-right font-medium">
              {lesson.reschedule_count} {lesson.reschedule_count === 1 ? "time" : "times"}
            </dd>
          </>
        )}
      </dl>

      {payment && <PaymentNote payment={payment} lesson={lesson} isStudent={state.isStudent} />}

      {lesson.status === "cancelled" && lesson.cancelled_at && (
        <CancellationNote lesson={lesson} viewerId={profile.id} isStudent={state.isStudent} />
      )}

      {state.upcoming && (
        <section className="space-y-3">
          {state.isStudent && lesson.status === "pending_payment" && !confirming && (
            <div className="card space-y-3">
              <p className="text-sm">
                This time is reserved for you until{" "}
                <LocalTime iso={lesson.hold_expires_at!} options={{ hour: "numeric", minute: "2-digit" }} />. Pay to
                confirm the lesson.
              </p>
              <PayButton lessonId={lesson.id} />
            </div>
          )}
          {state.canReschedule && (
            <Link href={`/lessons/${lesson.id}/reschedule`} className="btn-secondary w-full">
              Reschedule
            </Link>
          )}
          {state.isStudent && !state.beforeCutoff && (
            <p className="text-sm text-muted">
              Lessons can be rescheduled until {CHANGE_CUTOFF_HOURS} hours before they start.
            </p>
          )}
          {state.canCancel && <CancelForm lessonId={lesson.id} policy={cancelPolicy(lesson, state)} />}
        </section>
      )}
    </div>
  );
}

function cancelPolicy(lesson: Lesson, state: ReturnType<typeof lessonState>) {
  if (lesson.status === "pending_payment") return "Your reservation will be released. You haven't been charged.";
  if (state.isTutor) return "The student will get a full refund.";
  if (state.beforeCutoff) return "You're cancelling more than 12 hours ahead, so you'll get a full refund.";
  return "This lesson starts in less than 12 hours, so cancelling now isn't refunded.";
}

function CancellationNote({ lesson, viewerId, isStudent }: { lesson: Lesson; viewerId: string; isStudent: boolean }) {
  const who = lesson.cancelled_by === viewerId ? "You" : lesson.cancelled_by === lesson.tutor_id ? "The tutor" : "The student";
  const refund =
    lesson.refund_due === null
      ? null
      : lesson.refund_due
        ? isStudent
          ? "You'll get a full refund."
          : "The student gets a full refund."
        : "No refund: cancelled less than 12 hours before the lesson.";

  return (
    <div className="card space-y-1 text-sm">
      <p>
        <span className="font-medium">{who} cancelled this lesson</span> on{" "}
        <LocalTime iso={lesson.cancelled_at!} options={{ day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }} />.
      </p>
      {lesson.cancellation_reason && <p className="text-muted">“{lesson.cancellation_reason}”</p>}
      {refund && <p>{refund}</p>}
    </div>
  );
}

type PaymentSummary = { status: string; refunded_at: string | null; transferred_at: string | null; last_error: string | null };

function PaymentNote({ payment, lesson, isStudent }: { payment: PaymentSummary; lesson: Lesson; isStudent: boolean }) {
  let text: string;
  if (payment.status === "refunded") text = isStudent ? "Refunded to your card." : "Refunded to the student.";
  else if (lesson.refund_due) text = isStudent ? "Refund on its way." : "Refund to the student in progress.";
  else if (isStudent) text = "Paid.";
  else if (payment.transferred_at) text = "Paid out to your Stripe account.";
  else if (lesson.status === "completed") text = "Payout pending. Payouts are sent daily once your Stripe account is set up.";
  else text = "Paid by the student. You'll be paid after the lesson.";

  return (
    <p className="text-sm">
      <span className="text-muted">Payment: </span>
      {text}
    </p>
  );
}
