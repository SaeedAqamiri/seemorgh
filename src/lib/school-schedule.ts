import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schoolLessons, subjects } from "@/db/schema";
import { getBellSlots, type PanelSlot } from "./schedule";

export type SchoolLessonInput = {
  weekday: number;
  slotIndex: number;
  subjectId: string | null;
};

export type SchoolLessonView = {
  weekday: number;
  slotIndex: number;
  subjectId: string;
  subjectTitle: string;
  startMin: number;
  endMin: number;
};

export class SchoolScheduleValidationError extends Error {}

export async function getSchoolLessons(studentId: string): Promise<SchoolLessonView[]> {
  const db = await getDb();
  const slots = await getBellSlots(studentId);
  const rows = await db
    .select({
      weekday: schoolLessons.weekday,
      slotIndex: schoolLessons.slotIndex,
      subjectId: schoolLessons.subjectId,
      subjectTitle: subjects.title,
    })
    .from(schoolLessons)
    .innerJoin(subjects, eq(schoolLessons.subjectId, subjects.id))
    .where(eq(schoolLessons.studentId, studentId))
    .orderBy(asc(schoolLessons.weekday), asc(schoolLessons.slotIndex));
  return rows.map((row) => {
    const slot = slots[row.slotIndex] ?? { startMin: 0, endMin: 0 };
    return { ...row, startMin: slot.startMin, endMin: slot.endMin };
  });
}

export async function getSchoolIntervals(
  studentId: string,
): Promise<{ weekday: number; startMin: number; endMin: number; subjectId: string; subjectTitle: string }[]> {
  return (await getSchoolLessons(studentId)).map((row) => ({
    weekday: row.weekday,
    startMin: row.startMin,
    endMin: row.endMin,
    subjectId: row.subjectId,
    subjectTitle: row.subjectTitle,
  }));
}

export async function saveSchoolLessons(studentId: string, value: unknown): Promise<void> {
  if (!Array.isArray(value)) throw new SchoolScheduleValidationError("ساختار برنامه مدرسه نامعتبر است.");
  const slots = await getBellSlots(studentId);
  const rows: { weekday: number; slotIndex: number; subjectId: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const weekday = Number(record.weekday);
    const slotIndex = Number(record.slotIndex);
    const subjectId = typeof record.subjectId === "string" ? record.subjectId : "";
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) continue;
    if (!subjectId) continue;
    rows.push({ weekday, slotIndex, subjectId });
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schoolLessons).where(eq(schoolLessons.studentId, studentId));
    if (rows.length > 0) {
      await tx.insert(schoolLessons).values(rows.map((row) => ({ studentId, ...row }))).onConflictDoNothing();
    }
  });
}

export function schoolSlotsForWeekday(
  lessons: SchoolLessonView[],
  weekday: number,
  slots: readonly PanelSlot[],
): { startMin: number; endMin: number; subjectId: string; subjectTitle: string }[] {
  return lessons
    .filter((lesson) => lesson.weekday === weekday)
    .map((lesson) => {
      const slot = slots[lesson.slotIndex];
      return {
        startMin: slot?.startMin ?? lesson.startMin,
        endMin: slot?.endMin ?? lesson.endMin,
        subjectId: lesson.subjectId,
        subjectTitle: lesson.subjectTitle,
      };
    })
    .filter((lesson) => lesson.subjectId && lesson.endMin > lesson.startMin)
    .sort((a, b) => a.startMin - b.startMin);
}

export async function getSchoolLessonsForWeek(studentId: string, weekStart: string): Promise<Map<string, SchoolLessonView[]>> {
  const lessons = await getSchoolLessons(studentId);
  const { weekDates } = await import("./dates");
  const dates = weekDates(weekStart);
  const map = new Map<string, SchoolLessonView[]>();
  dates.forEach((date, weekday) => {
    map.set(date, lessons.filter((lesson) => lesson.weekday === weekday));
  });
  return map;
}
