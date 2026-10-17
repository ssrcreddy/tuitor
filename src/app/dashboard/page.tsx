import { redirect } from "next/navigation";
import { dashboardPath, requireProfile } from "@/lib/auth";

export default async function DashboardIndex() {
  const profile = await requireProfile();
  redirect(dashboardPath(profile.role));
}
