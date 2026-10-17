import { revalidatePath } from "next/cache";
import { SubmitButton } from "@/components/submit-button";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin · Tuitor" };

async function reviewTutor(formData: FormData) {
  "use server";
  await requireProfile("admin");
  const userId = String(formData.get("user_id"));
  const decision = formData.get("decision") === "approve" ? "approved" : "rejected";

  // Tutor status is not client-writable, so this goes through the service role.
  await createAdminClient().from("tutor_profiles").update({ status: decision }).eq("user_id", userId);
  revalidatePath("/dashboard/admin");
  revalidatePath("/tutors");
}

export default async function AdminDashboard() {
  await requireProfile("admin");
  const supabase = await createClient();

  const { data: pending } = await supabase
    .from("tutor_profiles")
    .select("user_id, headline, bio, country, hourly_rate_cents, currency, created_at, profile:profiles!tutor_profiles_user_id_fkey(full_name), tutor_languages(language, proficiency, teaches)")
    .eq("status", "pending")
    .order("created_at");

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tutors awaiting review ({pending?.length ?? 0})</h2>
        {!pending?.length && <p className="card text-sm text-muted">Nothing to review.</p>}
        {pending?.map((t) => (
          <article key={t.user_id} className="card space-y-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="font-semibold">{t.profile?.full_name}</h3>
              <span className="text-sm text-muted">
                {t.country} · {formatMoney(t.hourly_rate_cents, t.currency)}/h
              </span>
              {t.tutor_languages
                .filter((l) => l.teaches)
                .map((l) => (
                  <span key={l.language} className="chip">
                    Teaches {l.language}
                  </span>
                ))}
            </div>
            <p className="font-medium">{t.headline}</p>
            <p className="text-sm text-muted">{t.bio}</p>
            <form action={reviewTutor} className="flex gap-2 pt-2">
              <input type="hidden" name="user_id" value={t.user_id} />
              <SubmitButton name="decision" value="approve">
                Approve
              </SubmitButton>
              <SubmitButton name="decision" value="reject" variant="secondary">
                Reject
              </SubmitButton>
            </form>
          </article>
        ))}
      </section>
    </div>
  );
}
