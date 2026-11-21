export const SCHOOL_START_MIN = 8 * 60;
export const SCHOOL_END_MIN = 15 * 60 + 30;
export const SCHOOL_PERIOD_COUNT = 5;
export const STUDY_AFTER_SCHOOL_START = SCHOOL_END_MIN;
export const STUDY_END_MIN = 20 * 60;

export const STUDY_CONSTRAINTS = {
  maxDailyMinutes: 360,
  bufferPct: 10,
} as const;

export function schoolWeekdaysForGrade(grade: string): number[] {
  return grade === "دوازدهم" ? [0, 1, 2, 3] : [0, 1, 2, 3, 4];
}

export type StudyWindow = { weekday: number; startMin: number; endMin: number };

const STUDY_BLOCK_MINUTES = 90;
const BREAK_MINUTES = 5;

/**
 * Splits a long free range into bell-sized windows so the planner places each
 * session in its own bell instead of stacking several sessions in the same one.
 */
function splitRange(startMin: number, endMin: number): { startMin: number; endMin: number }[] {
  const windows: { startMin: number; endMin: number }[] = [];
  let cursor = startMin;
  while (cursor + BREAK_MINUTES < endMin) {
    const end = Math.min(cursor + STUDY_BLOCK_MINUTES, endMin);
    windows.push({ startMin: cursor, endMin: end });
    cursor = end + BREAK_MINUTES;
  }
  return windows;
}

/**
 * School days only have an after-school study window. Days off get a morning
 * and an afternoon window; the daily cap keeps the total around 3-4 bells.
 */
export function availabilityForGrade(
  grade: string,
  restWeekday: number,
): StudyWindow[] {
  const schoolDays = new Set(schoolWeekdaysForGrade(grade));
  const rows: StudyWindow[] = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    if (weekday === restWeekday) continue;
    if (schoolDays.has(weekday)) {
      for (const window of splitRange(STUDY_AFTER_SCHOOL_START, STUDY_END_MIN)) {
        rows.push({ weekday, ...window });
      }
    } else {
      for (const window of splitRange(9 * 60, 13 * 60)) {
        rows.push({ weekday, ...window });
      }
      for (const window of splitRange(15 * 60, STUDY_END_MIN)) {
        rows.push({ weekday, ...window });
      }
    }
  }
  return rows;
}
