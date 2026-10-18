"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { cancelLesson, type LessonActionState } from "./actions";

/** Collapsed until opened, so cancelling always takes a deliberate second click. */
export function CancelForm({ lessonId, policy }: { lessonId: string; policy: string }) {
  const [state, action] = useActionState<LessonActionState, FormData>(cancelLesson.bind(null, lessonId), {});

  return (
    <details className="card group">
      <summary className="cursor-pointer list-none font-medium text-danger">Cancel this lesson</summary>
      <form action={action} className="mt-4 space-y-3">
        <p className="text-sm">{policy}</p>
        <label className="block">
          <span className="label">Reason (optional, shared with the other person)</span>
          <textarea name="reason" rows={3} maxLength={500} className="input" />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <SubmitButton className="bg-danger hover:bg-danger">Yes, cancel lesson</SubmitButton>
      </form>
    </details>
  );
}
