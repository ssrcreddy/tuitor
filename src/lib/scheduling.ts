import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Must match public.lesson_minutes() in the database. */
export const LESSON_MINUTES = 60;
/** Must match the lead time enforced by public.create_booking_hold(). */
export const MIN_LEAD_HOURS = 12;

export type AvailabilityRule = {
  weekday: number; // 0 = Sunday, in the tutor's timezone
  start_time: string; // "HH:mm" or "HH:mm:ss", tutor-local wall clock
  end_time: string;
};

export type Interval = { starts_at: string | Date; ends_at: string | Date };

type SlotOptions = {
  rules: AvailabilityRule[];
  tutorTimezone: string;
  busy: Interval[];
  from: Date;
  to: Date;
  now?: Date;
};

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Bookable lesson start times (UTC) between `from` and `to`.
 *
 * Slots start on the hour in the tutor's local time, fit entirely inside an
 * availability rule, respect the minimum lead time and don't overlap `busy`.
 * Mirrors the checks in public.create_booking_hold(), which stays the source
 * of truth.
 */
export function generateSlots({ rules, tutorTimezone, busy, from, to, now = new Date() }: SlotOptions): Date[] {
  const earliest = Math.max(from.getTime(), now.getTime() + MIN_LEAD_HOURS * 3_600_000);
  const busyMs = busy.map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()] as const);

  const [fy, fm, fd] = formatInTimeZone(from, tutorTimezone, "yyyy-MM-dd").split("-").map(Number);
  const lastLocalDay = formatInTimeZone(to, tutorTimezone, "yyyy-MM-dd");

  const slots: Date[] = [];
  for (let day = new Date(Date.UTC(fy, fm - 1, fd)); ; day = new Date(day.getTime() + 86_400_000)) {
    const localDay = day.toISOString().slice(0, 10);
    if (localDay > lastLocalDay) break;
    const weekday = day.getUTCDay();

    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      const end = toMinutes(rule.end_time); // midnight is written "24:00"
      const firstHour = Math.ceil(toMinutes(rule.start_time) / 60);

      for (let h = firstHour; h * 60 + LESSON_MINUTES <= end; h++) {
        const wallClock = `${localDay}T${pad(h)}:00:00`;
        const start = fromZonedTime(wallClock, tutorTimezone);
        // Skip wall-clock times that don't exist (spring-forward DST gap).
        if (formatInTimeZone(start, tutorTimezone, "yyyy-MM-dd'T'HH:mm:ss") !== wallClock) continue;

        const s = start.getTime();
        const e = s + LESSON_MINUTES * 60_000;
        if (s < earliest || s > to.getTime()) continue;
        if (busyMs.some(([bs, be]) => bs < e && be > s)) continue;
        slots.push(start);
      }
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}

/** Group slot dates by calendar day in the viewer's timezone. */
export function groupByDay(slots: Date[], viewerTimezone: string) {
  const days = new Map<string, Date[]>();
  for (const slot of slots) {
    const key = formatInTimeZone(slot, viewerTimezone, "yyyy-MM-dd");
    days.set(key, [...(days.get(key) ?? []), slot]);
  }
  return days;
}
