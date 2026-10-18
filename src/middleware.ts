import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Stripe webhooks and cron jobs authenticate themselves; skip the session refresh.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/stripe|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
