import { NextResponse } from "next/server";
import { runDailyJobs } from "@/lib/payments";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily job (Vercel Cron): complete finished lessons, retry refunds, pay tutors. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runDailyJobs());
}
