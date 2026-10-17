import Link from "next/link";
import { BookingList, type BookingRow } from "@/components/booking-list";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My lessons · Tuitor" };

export default async function StudentDashboard() {
  const profile = await requireProfile("student");
  const supabase = await createClient();

  const { data } = await supabase
    .from("bookings")
    .select("id, starts_at, type, status, price_cents, currency, hold_expires_at, tutor:tutor_profiles(profile:profiles!tutor_profiles_user_id_fkey(full_name))")
    .eq("student_id", profile.id)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: false })
    .limit(50);

  const now = Date.now();
  const rows: BookingRow[] = (data ?? [])
    // Unpaid holds expire after 15 minutes; hide the abandoned ones.
    .filter((b) => b.status !== "pending_payment" || new Date(b.hold_expires_at ?? 0).getTime() > now)
    .map((b) => ({ ...b, counterpart: b.tutor?.profile?.full_name ?? "Tutor" }));
  const upcoming = rows.filter((b) => new Date(b.starts_at).getTime() >= now).reverse();
  const past = rows.filter((b) => new Date(b.starts_at).getTime() < now);

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Hi {profile.full_name.split(" ")[0] || "there"}</h1>
        <p className="mt-1 text-muted">Your lessons, in your local time.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming lessons</h2>
        <BookingList
          bookings={upcoming}
          empty={
            <>
              No lessons booked yet.{" "}
              <Link href="/tutors" className="link">
                Find a tutor
              </Link>
            </>
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Past lessons</h2>
        <BookingList bookings={past} empty="Your completed lessons will show up here." />
      </section>
    </div>
  );
}
