"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { completePayment, type LessonActionState } from "./actions";

export function PayButton({ lessonId }: { lessonId: string }) {
  const [state, action] = useActionState<LessonActionState, FormData>(() => completePayment(lessonId), {});
  return (
    <form action={action} className="space-y-2">
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton className="w-full">Complete payment</SubmitButton>
    </form>
  );
}
