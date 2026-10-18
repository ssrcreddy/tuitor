import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { LocalTime } from "@/components/local-time";
import { SlotPicker } from "@/components/slot-picker";
import { formatMoney } from "@/lib/format";
import { generateSlots } from "@/lib/scheduling";
import { createClient } from "@/lib/supabase/server";

const DAYS_SHOWN = 14;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("tutor_profiles")
    .select("headline, profile:profiles!tutor_profiles_user_id_fkey(full_name)")
    .eq("user_id", id)
    .eq("status", "approved")
    .maybeSingle();
  return data ? { title: `${data.profile?.full_name} · Tuitor`, description: data.headline } : {};
}

export default async function TutorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: tutor } = await supabase
    .from("tutor_profiles")
    .select(
      `*, profile:profiles!tutor_profiles_user_id_fkey(full_name, avatar_url, timezone),
       tutor_languages(language, proficiency, teaches),
       availability_rules(weekday, start_time, end_time)`,
    )
    .eq("user_id", id)
    .eq("status", "approved")
    .maybeSingle();
  if (!tutor || !tutor.profile) notFound();

  const from = new Date();
  const to = new Date(from.getTime() + DAYS_SHOWN * 86_400_000);
  const [{ data: busy }, { data: reviews }] = await Promise.all([
    supabase.rpc("tutor_busy_times", { p_tutor_id: id, p_from: from.toISOString(), p_to: to.toISOString() }),
    supabase
      .from("reviews")
      .select("booking_id, rating, body, reviewer_name, created_at")
      .eq("tutor_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const slots = generateSlots({
    rules: tutor.availability_rules,
    tutorTimezone: tutor.profile.timezone,
    busy: busy ?? [],
    from,
    to,
  }).map((d) => d.toISOString());

  const name = tutor.profile.full_name;
  const teaches = tutor.tutor_languages.filter((l) => l.teaches);
  const speaks = tutor.tutor_languages;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-10">
        <header className="flex gap-5">
          <Avatar name={name} url={tutor.profile.avatar_url} size={112} />
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">{name}</h1>
            <p className="text-lg">{tutor.headline}</p>
            <div className="flex flex-wrap gap-1.5">
              {teaches.map((l) => (
                <span key={l.language} className="chip bg-brand-soft">
                  Teaches {l.language}
                </span>
              ))}
              {tutor.country && <span className="chip">From {tutor.country}</span>}
            </div>
          </div>
        </header>

        {tutor.video_url && (
          <a href={tutor.video_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            ▶ Watch intro video
          </a>
        )}

        <section>
          <h2 className="text-xl font-semibold">About me</h2>
          <p className="mt-3 whitespace-pre-line text-muted">{tutor.bio}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">I speak</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {speaks.map((l) => (
              <li key={l.language} className="chip">
                {l.language} · {l.proficiency === "native" ? "Native" : l.proficiency}
              </li>
            ))}
          </ul>
        </section>

        <section id="schedule">
          <h2 className="text-xl font-semibold">Schedule</h2>
          <p className="mt-1 text-sm text-muted">Shown in your timezone. Pick a time to book.</p>
          <div className="mt-4">
            <SlotPicker hrefBase={`/book/${id}?start=`} slots={slots} />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">
            What students say{" "}
            {tutor.review_count > 0 && (
              <span className="text-base font-normal text-muted">
                ★ {Number(tutor.rating_avg).toFixed(1)} · {tutor.review_count} {tutor.review_count === 1 ? "review" : "reviews"}
              </span>
            )}
          </h2>
          {!reviews?.length && <p className="mt-3 text-sm text-muted">No reviews yet.</p>}
          <ul className="mt-4 space-y-4">
            {reviews?.map((r) => (
              <li key={r.booking_id} className="card">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{r.reviewer_name}</span>
                  <span aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}</span>
                  <LocalTime
                    iso={r.created_at}
                    options={{ day: "numeric", month: "short", year: "numeric" }}
                    className="ml-auto text-muted"
                  />
                </div>
                {r.body && <p className="mt-2 text-sm">{r.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="card space-y-4">
          <div>
            <span className="text-3xl font-semibold">{formatMoney(tutor.hourly_rate_cents, tutor.currency)}</span>
            <span className="text-muted"> / 60-min lesson</span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Trial lesson</dt>
            <dd className="text-right font-medium">{formatMoney(tutor.trial_rate_cents, tutor.currency)}</dd>
            <dt className="text-muted">Lessons taught</dt>
            <dd className="text-right font-medium">{tutor.lessons_taught}</dd>
          </dl>
          <a href="#schedule" className="btn-primary w-full">
            Book a trial lesson
          </a>
          <p className="text-xs text-muted">
            After each lesson you get an AI summary, corrections and homework, reviewed by your tutor.
          </p>
        </div>
      </aside>
    </div>
  );
}
