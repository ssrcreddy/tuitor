import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Role = Database["public"]["Enums"]["user_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/** The signed-in user's profile, or null when signed out. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
}

/** Use in server components and actions that need a signed-in user with one of `roles`. */
export async function requireProfile(...roles: Role[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (roles.length > 0 && !roles.includes(profile.role)) redirect(dashboardPath(profile.role));
  return profile;
}

export function dashboardPath(role: Role) {
  return `/dashboard/${role}`;
}

/** Only allow same-site relative redirects, to avoid open redirects via ?next=. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
