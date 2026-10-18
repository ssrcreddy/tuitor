import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing route for links in auth emails and for OAuth redirects.
 *
 * - `token_hash` + `type`: emails whose template links here directly. These
 *   work in any browser.
 * - `code`: the PKCE flow. Exchanging the code needs a verifier cookie from
 *   the browser that started the flow, so it fails when an email link is
 *   opened elsewhere (another browser, a mail app's built-in browser).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const to = (path: string) => NextResponse.redirect(new URL(path, origin));

  // Supabase redirects here with error details when a link is invalid or already used.
  if (searchParams.get("error_code") === "otp_expired") return to("/login?error=link_expired");

  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    return to(error ? "/login?error=link_expired" : next);
  }

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return to(next);
    // Supabase only issues an email-flow code after verifying the address, so the
    // account is confirmed even if this browser can't finish signing in.
    if (searchParams.get("flow") === "email") return to("/login?notice=confirmed");
  }

  return to("/login?error=callback");
}
