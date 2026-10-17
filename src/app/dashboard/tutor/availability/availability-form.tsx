"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { WEEKDAYS } from "@/lib/languages";
import { saveAvailability, type FormState } from "../actions";

type Rule = { weekday: number; start_time: string; end_time: string };

/** One availability window per weekday. */
export function AvailabilityForm({ rules }: { rules: Rule[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveAvailability, {});
  const byDay = new Map(rules.map((r) => [r.weekday, r]));

  // Show Monday first.
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <form action={action} className="mt-8 space-y-4">
      <ul className="divide-y divide-border rounded-xl border border-border">
        {order.map((weekday) => {
          const rule = byDay.get(weekday);
          return (
            <li key={weekday} className="flex flex-wrap items-center gap-3 p-4">
              <label className="flex w-36 items-center gap-2 text-sm font-medium">
                <input type="checkbox" name={`day-${weekday}`} defaultChecked={!!rule} />
                {WEEKDAYS[weekday]}
              </label>
              <input
                type="time"
                step={3600}
                name={`start-${weekday}`}
                defaultValue={rule?.start_time.slice(0, 5) ?? "09:00"}
                aria-label={`${WEEKDAYS[weekday]} start`}
                className="input mt-0 w-32"
              />
              <span className="text-muted">to</span>
              <input
                type="time"
                step={3600}
                name={`end-${weekday}`}
                defaultValue={rule?.end_time.slice(0, 5) ?? "17:00"}
                aria-label={`${WEEKDAYS[weekday]} end`}
                className="input mt-0 w-32"
              />
            </li>
          );
        })}
      </ul>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="text-sm text-success">
          Availability saved.
        </p>
      )}
      <SubmitButton>Save availability</SubmitButton>
    </form>
  );
}
