import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { formatMoney } from "@/lib/format";
import { LANGUAGES } from "@/lib/languages";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Find a language tutor · Tuitor" };

const SORTS = {
  rating: { label: "Top rated", column: "rating_avg", ascending: false },
  popular: { label: "Most lessons", column: "lessons_taught", ascending: false },
  price_asc: { label: "Price: low to high", column: "hourly_rate_cents", ascending: true },
  price_desc: { label: "Price: high to low", column: "hourly_rate_cents", ascending: false },
} as const;

type Search = { language?: string; max?: string; native?: string; sort?: string };

export default async function TutorsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const language = LANGUAGES.find((l) => l === params.language);
  const maxPrice = Number(params.max) > 0 ? Number(params.max) : undefined;
  const nativeOnly = params.native === "1";
  const sort = SORTS[params.sort as keyof typeof SORTS] ?? SORTS.rating;

  const supabase = await createClient();
  let query = supabase
    .from("tutor_profiles")
    .select(
      `user_id, headline, country, hourly_rate_cents, trial_rate_cents, currency, rating_avg, review_count, lessons_taught,
       profile:profiles!tutor_profiles_user_id_fkey(full_name, avatar_url),
       teaching:tutor_languages!inner(language, proficiency),
       speaks:tutor_languages(language, proficiency)`,
    )
    .eq("status", "approved")
    .eq("teaching.teaches", true);

  if (language) query = query.eq("teaching.language", language);
  if (nativeOnly) query = query.eq("teaching.proficiency", "native");
  if (maxPrice) query = query.lte("hourly_rate_cents", maxPrice * 100);

  const { data: tutors, error } = await query
    .order(sort.column, { ascending: sort.ascending })
    .order("review_count", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold">{language ? `${language} tutors` : "Find a language tutor"}</h1>

      <form className="mt-6 grid gap-3 rounded-xl bg-surface p-4 sm:grid-cols-5 sm:items-end">
        <label className="block">
          <span className="label">I want to learn</span>
          <select name="language" defaultValue={language ?? ""} className="input">
            <option value="">Any language</option>
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Max price / hour</span>
          <select name="max" defaultValue={maxPrice ?? ""} className="input">
            <option value="">Any price</option>
            {[10, 15, 20, 30, 40].map((p) => (
              <option key={p} value={p}>
                Up to ${p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Sort by</span>
          <select name="sort" defaultValue={params.sort ?? "rating"} className="input">
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm sm:pb-2.5">
          <input type="checkbox" name="native" value="1" defaultChecked={nativeOnly} /> Native speakers only
        </label>
        <button className="btn-primary">Search</button>
      </form>

      {error && (
        <p role="alert" className="mt-6 text-danger">
          Could not load tutors. Please try again.
        </p>
      )}

      <p className="mt-6 text-sm text-muted">{tutors?.length ?? 0} tutors available</p>

      <ul className="mt-3 space-y-4">
        {tutors?.map((t) => {
          const name = t.profile?.full_name ?? "Tutor";
          return (
            <li key={t.user_id}>
              <Link
                href={`/tutors/${t.user_id}`}
                className="card flex flex-col gap-4 transition-shadow hover:shadow-md sm:flex-row"
              >
                <Avatar name={name} url={t.profile?.avatar_url} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="text-lg font-semibold">{name}</h2>
                    {t.country && <span className="text-sm text-muted">{t.country}</span>}
                  </div>
                  <p className="font-medium">{t.headline}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.teaching.map((l) => (
                      <span key={l.language} className="chip bg-brand-soft">
                        Teaches {l.language}
                        {l.proficiency === "native" && " · Native"}
                      </span>
                    ))}
                    {t.speaks
                      .filter((s) => !t.teaching.some((l) => l.language === s.language))
                      .map((s) => (
                        <span key={s.language} className="chip">
                          Speaks {s.language} {s.proficiency !== "native" && s.proficiency}
                        </span>
                      ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-6 text-sm sm:flex-col sm:gap-1 sm:text-right">
                  <div>
                    <span className="text-xl font-semibold">{formatMoney(t.hourly_rate_cents, t.currency)}</span>
                    <span className="text-muted"> / 60 min</span>
                  </div>
                  <div>
                    {t.review_count > 0 ? (
                      <>
                        <span className="font-semibold">★ {Number(t.rating_avg).toFixed(1)}</span>
                        <span className="text-muted">
                          {" "}
                          ({t.review_count} {t.review_count === 1 ? "review" : "reviews"})
                        </span>
                      </>
                    ) : (
                      <span className="chip">New tutor</span>
                    )}
                  </div>
                  <div className="text-muted">{t.lessons_taught} lessons</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
