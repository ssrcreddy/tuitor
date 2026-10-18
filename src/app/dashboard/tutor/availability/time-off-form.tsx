"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { addTimeOff, type TimeOffState } from "../actions";

export function TimeOffForm({ today }: { today: string }) {
  const [state, action] = useActionState<TimeOffState, FormData>(addTimeOff, {});

  return (
    <form action={action} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">First day off</span>
          <input type="date" name="from" min={today} required className="input" />
        </label>
        <label className="block">
          <span className="label">Last day off</span>
          <input type="date" name="to" min={today} required className="input" />
        </label>
      </div>
      <label className="block">
        <span className="label">Note (only you see this)</span>
        <input name="note" maxLength={200} placeholder="e.g. Holiday" className="input" />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className={`text-sm ${state.conflicts ? "text-danger" : "text-success"}`}>
          Time off added.{" "}
          {state.conflicts ? (
            <>
              You already have {state.conflicts} {state.conflicts === 1 ? "lesson" : "lessons"} in this period. They
              aren&apos;t cancelled automatically; cancel them from your{" "}
              <Link href="/dashboard/tutor" className="link">
                dashboard
              </Link>{" "}
              if you can&apos;t teach them.
            </>
          ) : null}
        </p>
      )}
      <SubmitButton>Add time off</SubmitButton>
    </form>
  );
}
