"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { groupByDay } from "@/lib/scheduling";

const subscribe = () => () => {};

/** Free slots grouped by day in the viewer's own timezone. */
export function SlotPicker({ tutorId, slots }: { tutorId: string; slots: string[] }) {
  const timezone = useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
  const days = useMemo(() => [...groupByDay(slots.map((s) => new Date(s)), timezone)], [slots, timezone]);
  const [dayIndex, setDayIndex] = useState(0);

  if (days.length === 0) {
    return <p className="card text-sm text-muted">No free times in the next two weeks.</p>;
  }

  const [, daySlots] = days[Math.min(dayIndex, days.length - 1)];
  const dayLabel = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }).format(d);
  const timeLabel = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(d);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Day" className="flex gap-2 overflow-x-auto pb-1">
        {days.map(([key, list], i) => (
          <button
            key={key}
            role="tab"
            aria-selected={i === dayIndex}
            onClick={() => setDayIndex(i)}
            className={`choice shrink-0 ${i === dayIndex ? "border-brand bg-brand-soft" : ""}`}
          >
            {dayLabel(list[0])}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {daySlots.map((slot) => (
          <li key={slot.toISOString()}>
            <Link
              href={`/book/${tutorId}?start=${encodeURIComponent(slot.toISOString())}`}
              className="btn-secondary w-full"
            >
              {timeLabel(slot)}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Times in {timezone}.</p>
    </div>
  );
}
