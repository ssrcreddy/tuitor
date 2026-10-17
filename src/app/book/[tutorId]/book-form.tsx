"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LocalTime } from "@/components/local-time";
import { SubmitButton } from "@/components/submit-button";
import { holdSlot, type HoldState } from "./actions";

export function BookForm({ tutorId, startsAt, type }: { tutorId: string; startsAt: string; type: "trial" | "regular" }) {
  const [state, action] = useActionState<HoldState, FormData>(holdSlot, {});

  if (state.bookingId) {
    return (
      <div role="status" className="mt-6 space-y-3 rounded-xl bg-success-soft p-4 text-sm text-success">
        <p className="font-semibold">This time is reserved for you.</p>
        <p>
          Online payment isn&apos;t switched on yet. Your reservation is held until{" "}
          {state.holdExpiresAt && <LocalTime iso={state.holdExpiresAt} options={{ hour: "numeric", minute: "2-digit" }} />}.
        </p>
        <Link href="/dashboard/student" className="link">
          Go to my lessons
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="tutor_id" value={tutorId} />
      <input type="hidden" name="starts_at" value={startsAt} />
      <input type="hidden" name="type" value={type} />
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton className="w-full py-3">Continue to payment</SubmitButton>
    </form>
  );
}
