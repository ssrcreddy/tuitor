"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { WEEKDAYS } from "@/lib/languages";
import { saveAvailability, type FormState } from "../actions";

type Rule = { weekday: number; start_time: string; end_time: string };
type TimeWindow = { key: number; weekday: number; start: string; end: string };

// Show Monday first.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Weekly availability: any number of time windows per day. */
export function AvailabilityForm({ rules }: { rules: Rule[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveAvailability, {});
  const [windows, setWindows] = useState<TimeWindow[]>(() =>
    rules.map((r, i) => ({ key: i, weekday: r.weekday, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) })),
  );
  const [nextKey, setNextKey] = useState(rules.length);

  const add = (weekday: number) => {
    const existing = windows.filter((w) => w.weekday === weekday);
    const last = existing.at(-1);
    // Suggest the hours after the day's last window, or a normal working day.
    const start = last ? last.end : "09:00";
    const end = last ? `${String(Math.min(23, Number(last.end.slice(0, 2)) + 4)).padStart(2, "0")}:00` : "17:00";
    setWindows([...windows, { key: nextKey, weekday, start, end }]);
    setNextKey(nextKey + 1);
  };
  const remove = (key: number) => setWindows(windows.filter((w) => w.key !== key));

  return (
    <form action={action} className="mt-8 space-y-4">
      <ul className="divide-y divide-border rounded-xl border border-border">
        {ORDER.map((weekday) => {
          const day = windows.filter((w) => w.weekday === weekday);
          return (
            <li key={weekday} className="flex flex-wrap items-start gap-3 p-4">
              <span className="w-28 pt-2 text-sm font-medium">{WEEKDAYS[weekday]}</span>
              <div className="flex-1 space-y-2">
                {day.length === 0 && <p className="pt-2 text-sm text-muted">Unavailable</p>}
                {day.map((w) => (
                  <div key={w.key} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="weekday" value={weekday} />
                    <input
                      type="time"
                      step={3600}
                      name="start"
                      defaultValue={w.start}
                      aria-label={`${WEEKDAYS[weekday]} from`}
                      className="input mt-0 w-32"
                    />
                    <span className="text-muted">to</span>
                    <input
                      type="time"
                      step={3600}
                      name="end"
                      defaultValue={w.end}
                      aria-label={`${WEEKDAYS[weekday]} to`}
                      className="input mt-0 w-32"
                    />
                    <button
                      type="button"
                      onClick={() => remove(w.key)}
                      aria-label={`Remove ${WEEKDAYS[weekday]} ${w.start} window`}
                      className="btn-secondary px-3 py-2"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => add(weekday)} className="link pt-2 text-sm">
                + Add hours
              </button>
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
