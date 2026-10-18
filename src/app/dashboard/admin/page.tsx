import { revalidatePath } from "next/cache";
import { SubmitButton } from "@/components/submit-button";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { runDailyJobs } from "@/lib/payments";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin · Tuitor" };

async function reviewTutor(formData: FormData) {
  "use server";
  await requireProfile("admin");
  const userId = String(formData.get("user_id"));
  const decision = formData.get("decision") === "approve" ? "approved" : "rejected";

  // Tutor status is not client-writable; this function checks is_admin() itself.
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_tutor_status", { p_tutor_id: userId, p_status: decision });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/admin");
  revalidatePath("/tutors");
}

async function runJobsNow() {
  "use server";
  await requireProfile("admin");
  await runDailyJobs();
  revalidatePath("/dashboard/admin");
}

export default async function AdminDashboard() {
  await requireProfile("admin");
  const supabase = await createClient();

  // Admins can read all payments (RLS); the due lists are server-only functions.
  const admin = createAdminClient();
  const [{ data: failures }, { data: refundsDue }, { data: payoutsDue }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, booking_id, amount_cents, currency, last_error, updated_at")
      .not("last_error", "is", null)
      .order("updated_at", { ascending: false })
      .limit(20),
    admin.rpc("refunds_due", {}),
    admin.rpc("payouts_due"),
  ]);

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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payments</h2>
        <p className="text-sm text-muted">
          Refunds waiting: {refundsDue?.length ?? 0} · Tutor payouts waiting: {payoutsDue?.length ?? 0}. The daily job
          completes finished lessons, retries refunds and pays tutors.
        </p>
        {failures && failures.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {failures.map((f) => (
              <li key={f.id} className="space-y-1 p-4">
                <a href={`/lessons/${f.booking_id}`} className="link">
                  {formatMoney(f.amount_cents, f.currency)} payment
                </a>
                <p className="text-danger">{f.last_error}</p>
              </li>
            ))}
          </ul>
        )}
        <form action={runJobsNow}>
          <SubmitButton variant="secondary">Run daily jobs now</SubmitButton>
        </form>
      </section>
    </div>
  );
}
