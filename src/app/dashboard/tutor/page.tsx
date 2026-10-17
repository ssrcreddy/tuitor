import Link from "next/link";
import { BookingList, type BookingRow } from "@/components/booking-list";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Tutor dashboard · Tuitor" };

const STATUS_BANNER = {
  pending: { tone: "bg-surface", text: "Your profile is waiting for review. We'll email you once it's approved." },
  approved: { tone: "bg-success-soft text-success", text: "Your profile is live. Students can find and book you." },
  rejected: { tone: "bg-danger-soft text-danger", text: "Your profile wasn't approved. Update it and contact support." },
} as const;

export default async function TutorDashboard() {
  const profile = await requireProfile("tutor");
  const supabase = await createClient();

  const [{ data: tutor }, { data: bookings }, { count: ruleCount }] = await Promise.all([
    supabase.from("tutor_profiles").select("status").eq("user_id", profile.id).maybeSingle(),
    supabase
      .from("bookings")
      .select("id, starts_at, type, status, price_cents, platform_fee_cents, currency, student:profiles!bookings_student_id_fkey(full_name)")
      .eq("tutor_id", profile.id)
      .in("status", ["confirmed", "completed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(50),
    supabase.from("availability_rules").select("id", { count: "exact", head: true }).eq("tutor_id", profile.id),
  ]);

  const rows: BookingRow[] = (bookings ?? []).map((b) => ({
    ...b,
    // Tutors see what they earn, not what the student paid.
    price_cents: b.price_cents - b.platform_fee_cents,
    counterpart: b.student?.full_name ?? "Student",
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <h1 className="text-2xl font-semibold">Tutor dashboard</h1>

      {!tutor ? (
        <div className="card space-y-3">
          <p className="font-medium">Set up your tutor profile to start teaching.</p>
          <Link href="/dashboard/tutor/profile" className="btn-primary">
            Create profile
          </Link>
        </div>
      ) : (
        <p className={`rounded-lg p-4 text-sm ${STATUS_BANNER[tutor.status].tone}`}>{STATUS_BANNER[tutor.status].text}</p>
      )}

      {tutor && (
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/tutor/profile" className="btn-secondary">
            Edit profile
          </Link>
          <Link href="/dashboard/tutor/availability" className="btn-secondary">
            Availability{ruleCount === 0 && " (not set)"}
          </Link>
          {tutor.status === "approved" && (
            <Link href={`/tutors/${profile.id}`} className="btn-secondary">
              View public profile
            </Link>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming lessons</h2>
        <BookingList bookings={rows} empty="No upcoming lessons yet." />
      </section>
    </div>
  );
}
