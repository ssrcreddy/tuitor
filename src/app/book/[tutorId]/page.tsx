import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { LESSON_MINUTES } from "@/lib/scheduling";
import { createClient } from "@/lib/supabase/server";
import { BookForm } from "./book-form";

export const metadata = { title: "Book a lesson · Tuitor" };

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ tutorId: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const [{ tutorId }, { start }] = await Promise.all([params, searchParams]);
  const profile = await requireProfile("student");
  const startsAt = start ? new Date(start) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(tutorId)) notFound();

  const supabase = await createClient();
  const [{ data: tutor }, { count: trials }] = await Promise.all([
    supabase
      .from("tutor_profiles")
      .select("user_id, hourly_rate_cents, trial_rate_cents, currency, profile:profiles!tutor_profiles_user_id_fkey(full_name)")
      .eq("user_id", tutorId)
      .eq("status", "approved")
      .maybeSingle(),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("student_id", profile.id)
      .eq("tutor_id", tutorId)
      .eq("type", "trial")
      .neq("status", "cancelled"),
  ]);
  if (!tutor) notFound();

  const trialAvailable = (trials ?? 0) === 0;
  const type = trialAvailable ? "trial" : "regular";
  const price = trialAvailable ? tutor.trial_rate_cents : tutor.hourly_rate_cents;

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Link href={`/tutors/${tutorId}#schedule`} className="text-sm text-muted hover:text-brand">
        ← Back to schedule
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">
        {trialAvailable ? "Book a trial lesson" : "Book a lesson"} with {tutor.profile?.full_name}
      </h1>

      <dl className="card mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-muted">When</dt>
        <dd className="text-right font-medium">
          <LocalTime
            iso={startsAt.toISOString()}
            options={{ weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZoneName: "short" }}
          />
        </dd>
        <dt className="text-muted">Length</dt>
        <dd className="text-right font-medium">{LESSON_MINUTES} minutes</dd>
        <dt className="text-muted">Price</dt>
        <dd className="text-right text-lg font-semibold">{formatMoney(price, tutor.currency)}</dd>
      </dl>

      {trialAvailable && (
        <p className="mt-3 text-sm text-muted">
          If this tutor isn&apos;t the right fit, you can try someone else for free.
        </p>
      )}

      <BookForm tutorId={tutorId} startsAt={startsAt.toISOString()} type={type} />
    </div>
  );
}
