import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { SlotPicker } from "@/components/slot-picker";
import { requireProfile } from "@/lib/auth";
import { lessonState, loadLesson } from "@/lib/lessons";
import { generateSlots } from "@/lib/scheduling";
import { createClient } from "@/lib/supabase/server";
import { RescheduleForm } from "./reschedule-form";

export const metadata = { title: "Reschedule lesson · Tuitor" };

const DAYS_SHOWN = 14;
const LONG_DATE: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const [{ id }, { start }] = await Promise.all([params, searchParams]);
  const profile = await requireProfile("student");
  const supabase = await createClient();

  const lesson = await loadLesson(supabase, id);
  if (!lesson || lesson.student_id !== profile.id) notFound();
  if (!lessonState(lesson, profile.id).canReschedule) redirect(`/lessons/${id}`);

  const newStart = start ? new Date(start) : null;
  const tutorName = lesson.tutor?.profile?.full_name ?? "your tutor";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href={`/lessons/${id}`} className="text-sm text-muted hover:text-brand">
        ← Back to lesson
      </Link>
      <h1 className="text-2xl font-semibold">Reschedule your lesson with {tutorName}</h1>
      <p className="text-sm">
        Currently: <LocalTime iso={lesson.starts_at} options={LONG_DATE} className="font-medium" />
      </p>

      {newStart && !Number.isNaN(newStart.getTime()) ? (
        <div className="card space-y-4">
          <p>
            Move to <LocalTime iso={newStart.toISOString()} options={LONG_DATE} className="font-semibold" />?
          </p>
          <RescheduleForm lessonId={id} startsAt={newStart.toISOString()} />
          <Link href={`/lessons/${id}/reschedule`} className="link text-sm">
            Pick a different time
          </Link>
        </div>
      ) : (
        <AvailableSlots lessonId={id} tutorId={lesson.tutor_id} timezone={lesson.tutor?.profile?.timezone ?? "UTC"} />
      )}
    </div>
  );
}

async function AvailableSlots({ lessonId, tutorId, timezone }: { lessonId: string; tutorId: string; timezone: string }) {
  const supabase = await createClient();
  const from = new Date();
  const to = new Date(from.getTime() + DAYS_SHOWN * 86_400_000);
  const [{ data: rules }, { data: busy }] = await Promise.all([
    supabase.from("availability_rules").select("weekday, start_time, end_time").eq("tutor_id", tutorId),
    supabase.rpc("tutor_busy_times", { p_tutor_id: tutorId, p_from: from.toISOString(), p_to: to.toISOString() }),
  ]);

  const slots = generateSlots({ rules: rules ?? [], tutorTimezone: timezone, busy: busy ?? [], from, to }).map((d) =>
    d.toISOString(),
  );

  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Pick a new time</h2>
      <SlotPicker hrefBase={`/lessons/${lessonId}/reschedule?start=`} slots={slots} />
    </section>
  );
}
