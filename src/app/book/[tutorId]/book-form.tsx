"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { holdSlot, type HoldState } from "./actions";

export function BookForm({ tutorId, startsAt, type }: { tutorId: string; startsAt: string; type: "trial" | "regular" }) {
  const [state, action] = useActionState<HoldState, FormData>(holdSlot, {});

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
      <p className="text-center text-xs text-muted">You&apos;ll pay securely with Stripe. The time is held for you while you pay.</p>
    </form>
  );
}
