"use server";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
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

  // One entry per time window; a day can have several (e.g. mornings and evenings).
  const weekdays = formData.getAll("weekday");
  const starts = formData.getAll("start");
  const ends = formData.getAll("end");

  const rules: { tutor_id: string; weekday: number; start_time: string; end_time: string }[] = [];
  for (let i = 0; i < weekdays.length; i++) {
    const weekday = z.coerce.number().int().min(0).max(6).safeParse(weekdays[i]);
    const start = timeOfDay.safeParse(starts[i]);
    const end = timeOfDay.safeParse(ends[i]);
    if (!weekday.success || !start.success || !end.success || end.data <= start.data) {
      return { error: "Each time window needs an end time later than its start time." };
    }
    rules.push({ tutor_id: profile.id, weekday: weekday.data, start_time: start.data, end_time: end.data });
  }

  const sorted = [...rules].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].weekday === sorted[i - 1].weekday && sorted[i].start_time < sorted[i - 1].end_time) {
      return { error: "Time windows on the same day can't overlap." };
    }
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

export type TimeOffState = FormState & { conflicts?: number };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

/** The calendar day after `day` (yyyy-MM-dd). */
function nextDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Blocks whole days, from the start of `from` to the end of `to`, in the tutor's timezone. */
export async function addTimeOff(_prev: TimeOffState, formData: FormData): Promise<TimeOffState> {
  const profile = await requireProfile("tutor");
  const parsed = z
    .object({ from: isoDate, to: isoDate, note: z.string().trim().max(200).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { from, to, note } = parsed.data;

  const today = formatInTimeZone(new Date(), profile.timezone, "yyyy-MM-dd");
  if (from < today) return { error: "Time off can't start in the past." };
  if (to < from) return { error: "The last day must be on or after the first day." };

  const startsAt = fromZonedTime(`${from}T00:00:00`, profile.timezone);
  const endsAt = fromZonedTime(`${nextDay(to)}T00:00:00`, profile.timezone);
  if (endsAt.getTime() - startsAt.getTime() > 92 * 86_400_000) return { error: "Add at most 3 months at a time." };

  const supabase = await createClient();
  const { error } = await supabase.from("availability_exceptions").insert({
    tutor_id: profile.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    note: note || null,
  });
  if (error) return { error: "Could not save your time off." };

  // Existing lessons in this period are not cancelled automatically.
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("tutor_id", profile.id)
    .eq("status", "confirmed")
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString());

  revalidatePath("/dashboard/tutor/availability");
  return { saved: true, conflicts: count ?? 0 };
}

export async function removeTimeOff(formData: FormData) {
  const profile = await requireProfile("tutor");
  const supabase = await createClient();
  await supabase.from("availability_exceptions").delete().eq("id", Number(formData.get("id"))).eq("tutor_id", profile.id);
  revalidatePath("/dashboard/tutor/availability");
}
