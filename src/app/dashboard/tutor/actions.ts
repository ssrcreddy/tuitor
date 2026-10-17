"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { LANGUAGES, PROFICIENCIES } from "@/lib/languages";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; saved?: boolean };

const dollarsToCents = z.coerce.number().min(0).max(1000).transform((d) => Math.round(d * 100));

const profileSchema = z.object({
  headline: z.string().trim().min(10, "Write a headline of at least 10 characters.").max(120),
  bio: z.string().trim().min(50, "Tell students a bit more about you (50+ characters).").max(3000),
  country: z.string().trim().length(2, "Use a 2-letter country code, e.g. GB.").toUpperCase(),
  video_url: z.union([z.url("Enter a valid video link."), z.literal("")]).transform((v) => v || null),
  hourly_rate_cents: dollarsToCents.refine((c) => c >= 100, "Hourly rate must be at least $1."),
  trial_rate_cents: dollarsToCents,
  language: z.enum(LANGUAGES),
  proficiency: z.enum(PROFICIENCIES),
});

export async function saveTutorProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireProfile("tutor");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { language, proficiency, ...fields } = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("tutor_profiles").select("user_id").eq("user_id", profile.id).maybeSingle();

  // Insert and update are separate because clients may not update user_id.
  const { error } = existing
    ? await supabase.from("tutor_profiles").update(fields).eq("user_id", profile.id)
    : await supabase.from("tutor_profiles").insert({ user_id: profile.id, ...fields });
  if (error) return { error: "Could not save your profile. Please try again." };

  await supabase.from("tutor_languages").delete().eq("tutor_id", profile.id).eq("teaches", true).neq("language", language);
  const { error: langError } = await supabase
    .from("tutor_languages")
    .upsert({ tutor_id: profile.id, language, proficiency, teaches: true }, { onConflict: "tutor_id,language" });
  if (langError) return { error: "Could not save your teaching language." };

  revalidatePath("/dashboard/tutor");
  if (!existing) redirect("/dashboard/tutor/availability");
  return { saved: true };
}

const timeOfDay = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/);

export async function saveAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireProfile("tutor");

  const rules: { tutor_id: string; weekday: number; start_time: string; end_time: string }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    if (formData.get(`day-${weekday}`) !== "on") continue;
    const start = timeOfDay.safeParse(formData.get(`start-${weekday}`));
    const end = timeOfDay.safeParse(formData.get(`end-${weekday}`));
    if (!start.success || !end.success || end.data <= start.data) {
      return { error: "Each selected day needs an end time later than its start time." };
    }
    rules.push({ tutor_id: profile.id, weekday, start_time: start.data, end_time: end.data });
  }

  const supabase = await createClient();
  const { error: delError } = await supabase.from("availability_rules").delete().eq("tutor_id", profile.id);
  if (delError) return { error: "Could not save availability." };
  if (rules.length > 0) {
    const { error } = await supabase.from("availability_rules").insert(rules);
    if (error) return { error: "Could not save availability." };
  }

  revalidatePath("/dashboard/tutor");
  return { saved: true };
}
