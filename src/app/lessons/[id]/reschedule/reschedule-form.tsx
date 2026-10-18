"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { rescheduleLesson, type LessonActionState } from "../actions";

export function RescheduleForm({ lessonId, startsAt }: { lessonId: string; startsAt: string }) {
  const [state, action] = useActionState<LessonActionState, FormData>(rescheduleLesson.bind(null, lessonId), {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="starts_at" value={startsAt} />
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton>Confirm new time</SubmitButton>
    </form>
  );
}
