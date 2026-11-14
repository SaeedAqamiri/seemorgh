import { and, eq, lte } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  dailyLogs,
  performancePanels,
  students,
  weeklyPanels,
  type PanelCellJson,
  type PerformanceCellJson,
  type PerformanceGridJson,
} from "../db/schema";
import { startOfWeekSaturday, tehranDateTime, todayISO, weekDates } from "./dates";
import { getBellSlots, type PanelSlot } from "./schedule";

function hashSeed(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function makeRandom(seed: string): () => number {
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type DayMode = "full" | "good" | "partial" | "poor" | "off";

function dayMode(random: () => number): { mode: DayMode; doneRate: number } {
  const value = random();
  if (value < 0.18) return { mode: "full", doneRate: 0.97 };
  if (value < 0.55) return { mode: "good", doneRate: 0.85 };
  if (value < 0.8) return { mode: "partial", doneRate: 0.6 };
  if (value < 0.93) return { mode: "poor", doneRate: 0.3 };
  return { mode: "off", doneRate: 0.08 };
}

function notesFor(kind: PerformanceCellJson["kind"], random: () => number): string {
  if (random() > 0.82) return "";
  const notes = [
    "تمرکز خوبی داشتم",
    "کمی خسته بودم",
    "وسطش گوشی چک کردم",
    "سریع‌تر از برنامه تمام شد",
    "نزدیک پایان حوصله‌ام سر رفت",
    "با تایمر زدم",
  ];
  return notes[Math.floor(random() * notes.length)];
}

function toPerformanceCell(
  cell: PanelCellJson,
  slot: PanelSlot,
  doneRate: number,
  random: () => number,
): PerformanceCellJson {
  if (cell.kind === "rest") return { kind: "rest" };
  if (cell.kind === "empty") return { kind: "empty" };
  if (random() > doneRate) return { kind: "empty" };

  const slotMinutes = Math.max(20, slot.endMin - slot.startMin);
  const minutes = Math.max(
    8,
    Math.min(slotMinutes + 15, Math.round(slotMinutes * (0.45 + random() * 0.65))),
  );
  const note = notesFor(cell.kind, random);

  if (cell.kind === "study" || cell.kind === "review") {
    return {
      kind: cell.kind,
      subjectId: cell.subjectId,
      resourceText: cell.resourceText,
      minutes,
      note,
    };
  }

  if (cell.kind === "routine") {
    return {
      kind: "routine",
      routineMode: cell.routineMode,
      subjectId: cell.subjectId,
      resourceText: cell.resourceText,
      resourceId: cell.resourceId,
      chapterId: cell.chapterId,
      count:
        cell.routineMode === "test"
          ? Math.max(1, Math.round(cell.count * (0.55 + random() * 0.5)))
          : 0,
      minutes,
      note,
    };
  }

  if (cell.kind === "test" || cell.kind === "timedTest" || cell.kind === "exercise") {
    return {
      kind: cell.kind,
      subjectId: cell.subjectId,
      resourceId: cell.resourceId,
      chapterId: cell.chapterId,
      count: Math.max(1, Math.round(cell.count * (0.5 + random() * 0.55))),
      minutes,
      note,
    };
  }

  return { kind: "empty" };
}

function firstStart(planRow: PanelCellJson[], slots: PanelSlot[]): number | null {
  for (let slot = 0; slot < planRow.length; slot += 1) {
    const cell = planRow[slot];
    if (cell.kind !== "empty" && cell.kind !== "rest") return slots[slot].startMin;
  }
  return null;
}

function openedMinutes(mode: DayMode, plannedStart: number | null, random: () => number): number {
  if (plannedStart === null) return 9 * 60 + Math.floor(random() * 180);
  const offsets: Record<DayMode, [number, number]> = {
    full: [-10, 20],
    good: [0, 35],
    partial: [25, 80],
    poor: [60, 140],
    off: [90, 190],
  };
  const [min, max] = offsets[mode];
  return Math.max(
    6 * 60,
    Math.min(23 * 60, plannedStart + Math.floor(min + random() * (max - min))),
  );
}

export async function seedPerformanceData(): Promise<{ panels: number; logs: number }> {
  const db = await getDb();
  const studentRows = await db.select().from(students).where(eq(students.status, "active"));
  const currentWeek = startOfWeekSaturday(todayISO());

  let panels = 0;
  let logs = 0;

  for (const student of studentRows) {
    const slots = await getBellSlots(student.id);
    const weekRows = await db
      .select()
      .from(weeklyPanels)
      .where(
        and(
          eq(weeklyPanels.studentId, student.id),
          lte(weeklyPanels.weekStart, currentWeek),
        ),
      );

    for (const weekRow of weekRows) {
      if (!weekRow.gridJson) continue;
      const dates = weekDates(weekRow.weekStart);
      const perfGrid: PerformanceGridJson = [];
      const random = makeRandom(`${student.id}:${weekRow.weekStart}:performance`);

      for (let day = 0; day < 7; day += 1) {
        const planRow = weekRow.gridJson[day] ?? [];
        const { mode, doneRate } = dayMode(random);
        const perfRow: PerformanceCellJson[] = [];

        for (let slot = 0; slot < slots.length; slot += 1) {
          const planCell = planRow[slot] ?? { kind: "empty" };
          perfRow.push(toPerformanceCell(planCell, slots[slot], doneRate, random));
        }
        perfGrid.push(perfRow);

        const plannedStart = firstStart(planRow, slots);
        const openMin = openedMinutes(mode, plannedStart, random);
        const openedAt = tehranDateTime(dates[day], openMin);
        const completedAt =
          random() < 0.95 ? new Date(openedAt.getTime() + 5 * 60_000) : null;

        await db
          .insert(dailyLogs)
          .values({
            studentId: student.id,
            logDate: dates[day],
            firstOpenedAt: openedAt,
            challengeCompletedAt: completedAt,
            mood: 2 + Math.floor(random() * 4),
            energy: 2 + Math.floor(random() * 4),
          })
          .onConflictDoUpdate({
            target: [dailyLogs.studentId, dailyLogs.logDate],
            set: {
              firstOpenedAt: openedAt,
              challengeCompletedAt: completedAt,
            },
          });
        logs += 1;
      }

      await db
        .insert(performancePanels)
        .values({
          studentId: student.id,
          weekStart: weekRow.weekStart,
          cellsJson: perfGrid,
          narrative: "",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [performancePanels.studentId, performancePanels.weekStart],
          set: {
            cellsJson: perfGrid,
            narrative: "",
            updatedAt: new Date(),
          },
        });
      panels += 1;
    }
  }

  return { panels, logs };
}
