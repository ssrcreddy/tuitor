import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Tutor profile · Tuitor" };

export default async function TutorProfilePage() {
  const profile = await requireProfile("tutor");
  const supabase = await createClient();

  const [{ data: tutor }, { data: teaching }] = await Promise.all([
    supabase.from("tutor_profiles").select("*").eq("user_id", profile.id).maybeSingle(),
    supabase.from("tutor_languages").select("language, proficiency").eq("tutor_id", profile.id).eq("teaches", true).limit(1).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{tutor ? "Edit your profile" : "Create your tutor profile"}</h1>
      <p className="mt-1 text-muted">This is what students see when they search for tutors.</p>
      <ProfileForm tutor={tutor} teaching={teaching} />
    </div>
  );
}
