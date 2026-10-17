import { describe, expect, it } from "vitest";
import { generateSlots, groupByDay } from "./scheduling";

const iso = (d: Date[]) => d.map((x) => x.toISOString());

describe("generateSlots", () => {
  const now = new Date("2026-03-01T00:00:00Z"); // a Sunday

  it("creates hourly slots inside a rule, in the tutor's timezone", () => {
    const slots = generateSlots({
      rules: [{ weekday: 1, start_time: "09:00:00", end_time: "12:00:00" }],
      tutorTimezone: "Asia/Kolkata", // UTC+05:30
      busy: [],
      from: new Date("2026-03-02T00:00:00Z"),
      to: new Date("2026-03-03T00:00:00Z"),
      now,
    });
    // 09:00, 10:00, 11:00 IST on Monday 2 March
    expect(iso(slots)).toEqual([
      "2026-03-02T03:30:00.000Z",
      "2026-03-02T04:30:00.000Z",
      "2026-03-02T05:30:00.000Z",
    ]);
  });

  it("rounds a rule that starts mid-hour up to the next hour and needs a full lesson before the end", () => {
    const slots = generateSlots({
      rules: [{ weekday: 1, start_time: "09:30", end_time: "11:30" }],
      tutorTimezone: "UTC",
      busy: [],
      from: new Date("2026-03-02T00:00:00Z"),
      to: new Date("2026-03-03T00:00:00Z"),
      now,
    });
    expect(iso(slots)).toEqual(["2026-03-02T10:00:00.000Z"]);
  });

  it("removes slots overlapping busy times and inside the lead time", () => {
    const slots = generateSlots({
      rules: [{ weekday: 0, start_time: "06:00", end_time: "20:00" }],
      tutorTimezone: "UTC",
      busy: [{ starts_at: "2026-03-01T15:30:00Z", ends_at: "2026-03-01T16:30:00Z" }],
      from: new Date("2026-03-01T00:00:00Z"),
      to: new Date("2026-03-02T00:00:00Z"),
      now, // lead time pushes the first slot to 12:00
    });
    expect(iso(slots)).toEqual([
      "2026-03-01T12:00:00.000Z",
      "2026-03-01T13:00:00.000Z",
      "2026-03-01T14:00:00.000Z",
      // 15:00 and 16:00 overlap the busy period
      "2026-03-01T17:00:00.000Z",
      "2026-03-01T18:00:00.000Z",
      "2026-03-01T19:00:00.000Z",
    ]);
  });

  it("skips the non-existent hour on a spring-forward DST day", () => {
    // US clocks jump from 02:00 to 03:00 on Sunday 8 March 2026.
    const slots = generateSlots({
      rules: [{ weekday: 0, start_time: "01:00", end_time: "04:00" }],
      tutorTimezone: "America/New_York",
      busy: [],
      from: new Date("2026-03-08T00:00:00Z"),
      to: new Date("2026-03-09T00:00:00Z"),
      now,
    });
    expect(iso(slots)).toEqual([
      "2026-03-08T06:00:00.000Z", // 01:00 EST
      "2026-03-08T07:00:00.000Z", // 03:00 EDT
    ]);
  });

  it('supports rules that run until midnight ("24:00")', () => {
    const slots = generateSlots({
      rules: [{ weekday: 1, start_time: "22:00", end_time: "24:00" }],
      tutorTimezone: "UTC",
      busy: [],
      from: new Date("2026-03-02T00:00:00Z"),
      to: new Date("2026-03-03T00:00:00Z"),
      now,
    });
    expect(iso(slots)).toEqual(["2026-03-02T22:00:00.000Z", "2026-03-02T23:00:00.000Z"]);
  });
});

describe("groupByDay", () => {
  it("groups by the viewer's local date", () => {
    const groups = groupByDay(
      [new Date("2026-03-02T03:30:00Z"), new Date("2026-03-02T23:00:00Z")],
      "America/Los_Angeles",
    );
    expect([...groups.keys()]).toEqual(["2026-03-01", "2026-03-02"]);
  });
});
