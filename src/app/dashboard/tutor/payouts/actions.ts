"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { payoutDashboardUrl, startPayoutOnboarding } from "@/lib/payments";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export type PayoutActionState = { error?: string };

export async function setUpPayouts(): Promise<PayoutActionState> {
  const profile = await requireProfile("tutor");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let url: string;
  try {
    url = await startPayoutOnboarding(profile.id, user?.email, await siteOrigin());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reach Stripe. Please try again." };
  }
  redirect(url);
}

export async function openStripeDashboard(): Promise<PayoutActionState> {
  const profile = await requireProfile("tutor");
  const supabase = await createClient();
  const { data } = await supabase.from("tutor_profiles").select("stripe_account_id").eq("user_id", profile.id).single();
  if (!data?.stripe_account_id) return { error: "Set up payouts first." };

  let url: string;
  try {
    url = await payoutDashboardUrl(data.stripe_account_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reach Stripe." };
  }
  redirect(url);
}
