import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatJalaliNumeric,
  formatTime,
  isISODate,
  parseTime,
  startOfWeekSaturday,
  weekDates,
  weekdayIndex,
} from "./dates";

describe("dates", () => {
  it("validates ISO dates", () => {
    expect(isISODate("2026-10-25")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026/10/25")).toBe(false);
  });

  it("treats Saturday as day zero", () => {
    expect(weekdayIndex("2026-10-24")).toBe(0);
    expect(weekdayIndex("2026-10-30")).toBe(6);
    expect(startOfWeekSaturday("2026-10-28")).toBe("2026-10-24");
  });

  it("returns the seven days of the week", () => {
    expect(weekDates("2026-10-24")).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
  });

  it("handles month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2026-10-24", "2026-10-31")).toBe(7);
  });

  it("formats Jalali dates", () => {
    const formatted = formatJalaliNumeric("2026-10-25").replace(/\u200f/g, "");
    expect(formatted).toContain("۱۴۰۵");
    expect(formatted).toContain("۰۸");
  });

  it("parses and formats clock times", () => {
    expect(parseTime("09:30")).toBe(570);
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("24:00")).toBeNull();
    expect(formatTime(570)).toBe("09:30");
  });
});
