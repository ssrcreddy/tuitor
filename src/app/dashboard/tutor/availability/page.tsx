import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityForm } from "./availability-form";

export const metadata = { title: "Availability · Tuitor" };

export default async function AvailabilityPage() {
  const profile = await requireProfile("tutor");
  const supabase = await createClient();

  const { data: tutor } = await supabase.from("tutor_profiles").select("user_id").eq("user_id", profile.id).maybeSingle();
  if (!tutor) redirect("/dashboard/tutor/profile");

  const { data: rules } = await supabase
    .from("availability_rules")
    .select("weekday, start_time, end_time")
    .eq("tutor_id", profile.id)
    .order("weekday");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Weekly availability</h1>
      <p className="mt-1 text-muted">
        Times are in your timezone, <strong>{profile.timezone}</strong>. Lessons are 60 minutes and start on the hour.
      </p>
      <AvailabilityForm rules={rules ?? []} />
    </div>
  );
}
