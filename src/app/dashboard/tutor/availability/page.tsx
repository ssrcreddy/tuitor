import { formatInTimeZone } from "date-fns-tz";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { removeTimeOff } from "../actions";
import { AvailabilityForm } from "./availability-form";
import { TimeOffForm } from "./time-off-form";

export const metadata = { title: "Availability · Tuitor" };

export default async function AvailabilityPage() {
  const profile = await requireProfile("tutor");
  const supabase = await createClient();

  const { data: tutor } = await supabase.from("tutor_profiles").select("user_id").eq("user_id", profile.id).maybeSingle();
  if (!tutor) redirect("/dashboard/tutor/profile");

  const [{ data: rules }, { data: timeOff }] = await Promise.all([
    supabase.from("availability_rules").select("weekday, start_time, end_time").eq("tutor_id", profile.id).order("weekday"),
    supabase
      .from("availability_exceptions")
      .select("id, starts_at, ends_at, note")
      .eq("tutor_id", profile.id)
      .gt("ends_at", new Date().toISOString())
      .order("starts_at"),
  ]);

  // Time off covers whole days in the tutor's timezone; ends_at is the start of the next day.
  const day = (iso: string, offsetMs = 0) =>
    formatInTimeZone(new Date(new Date(iso).getTime() + offsetMs), profile.timezone, "EEE d MMM yyyy");

  return (
    <div className="mx-auto max-w-2xl space-y-12 px-4 py-10">
      <section>
        <h1 className="text-2xl font-semibold">Weekly availability</h1>
        <p className="mt-1 text-muted">
          Times are in your timezone, <strong>{profile.timezone}</strong>. Lessons are 60 minutes and start on the hour.
        </p>
        <AvailabilityForm rules={rules ?? []} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Time off</h2>
          <p className="mt-1 text-muted">Students can&apos;t book you on these days.</p>
        </div>

        {timeOff && timeOff.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {timeOff.map((t) => {
              const first = day(t.starts_at);
              const last = day(t.ends_at, -1);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <span className="font-medium">{first === last ? first : `${first} – ${last}`}</span>
                  {t.note && <span className="text-muted">{t.note}</span>}
                  <form action={removeTimeOff} className="ml-auto">
                    <input type="hidden" name="id" value={t.id} />
                    <SubmitButton variant="secondary" className="py-1.5">
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <TimeOffForm today={formatInTimeZone(new Date(), profile.timezone, "yyyy-MM-dd")} />
      </section>
    </div>
  );
}
