import { headers } from "next/headers";

/** The site's origin for building absolute URLs (Stripe redirects, auth emails). */
export async function siteOrigin() {
  return (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
