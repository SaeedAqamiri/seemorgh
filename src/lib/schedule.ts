import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bellSchedules } from "@/db/schema";

export const PANEL_DAYS = 7;
export const DEFAULT_BELL_COUNT = 10;
export const DEFAULT_BELL_START = 8 * 60;
export const DEFAULT_BELL_MINUTES = 90;

export type PanelSlot = { startMin: number; endMin: number };
export type WeekBellSlots = PanelSlot[][];

export const PANEL_SLOTS: readonly PanelSlot[] = Array.from(
  { length: DEFAULT_BELL_COUNT },
  (_, index) => ({
    startMin: DEFAULT_BELL_START + index * DEFAULT_BELL_MINUTES,
    endMin: DEFAULT_BELL_START + (index + 1) * DEFAULT_BELL_MINUTES,
  }),
);

export function defaultBellSlots(): PanelSlot[] {
  return PANEL_SLOTS.map((slot) => ({ ...slot }));
}

export function defaultWeekBellSlots(): WeekBellSlots {
  return Array.from({ length: PANEL_DAYS }, () => defaultBellSlots());
}

/** Header label for a bell column: «زنگ ۱» … */
export function slotNumberLabel(index: number): string {
  return `زنگ ${faNumber(index + 1)}`;
}

function faClock(minutes: number): string {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const two = (value: number) =>
    value.toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false });
  return `${two(hh)}:${two(mm)}`;
}

export function slotLabel(slot: { startMin: number; endMin: number }): string {
  return `${faClock(slot.startMin)} تا ${faClock(slot.endMin)}`;
}

export function slotRangeLabel(slot: { startMin: number; endMin: number }): string {
  return `${faClock(slot.startMin)}–${faClock(slot.endMin)}`;
}

export function faNumber(value: number): string {
  return value.toLocaleString("fa-IR");
}

export class ScheduleValidationError extends Error {}

function normalizeSlot(value: unknown, weekday: number, index: number): PanelSlot {
  if (!value || typeof value !== "object") {
    throw new ScheduleValidationError(
      `روز ${weekday + 1} زنگ ${index + 1}: ساختار نامعتبر است.`,
    );
  }
  const raw = value as Record<string, unknown>;
  const startMin = Number(raw.startMin);
  const endMin = Number(raw.endMin);
  if (
    !Number.isInteger(startMin) ||
    !Number.isInteger(endMin) ||
    startMin < 0 ||
    endMin > 24 * 60 ||
    endMin <= startMin
  ) {
    throw new ScheduleValidationError(
      `روز ${weekday + 1} زنگ ${index + 1}: ساعت شروع/پایان باید معتبر و پایان بعد از شروع باشد.`,
    );
  }
  return { startMin, endMin };
}

export function normalizeBellSlots(value: unknown): PanelSlot[] {
  if (!Array.isArray(value) || value.length !== DEFAULT_BELL_COUNT) {
    throw new ScheduleValidationError("تعداد زنگ‌ها باید ۱۰ عدد باشد.");
  }
  return value.map((slot, index) => normalizeSlot(slot, 0, index));
}

export function normalizeWeekBellSlots(value: unknown): WeekBellSlots {
  if (!Array.isArray(value) || value.length !== PANEL_DAYS) {
    throw new ScheduleValidationError("ساعت زنگ‌ها باید برای هر ۷ روز تعریف شود.");
  }
  return value.map((day, weekday) => {
    if (!Array.isArray(day) || day.length !== DEFAULT_BELL_COUNT) {
      throw new ScheduleValidationError(
        `روز ${weekday + 1}: تعداد زنگ‌ها باید ۱۰ عدد باشد.`,
      );
    }
    return day.map((slot, index) => normalizeSlot(slot, weekday, index));
  });
}

export async function ensureBellSchedule(studentId: string): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ weekday: bellSchedules.weekday, slotIndex: bellSchedules.slotIndex })
    .from(bellSchedules)
    .where(eq(bellSchedules.studentId, studentId));
  const known = new Set(existing.map((row) => `${row.weekday}-${row.slotIndex}`));
  const defaults = defaultBellSlots();
  const missing: { studentId: string; weekday: number; slotIndex: number; startMin: number; endMin: number }[] = [];
  for (let weekday = 0; weekday < PANEL_DAYS; weekday += 1) {
    for (const [index, slot] of defaults.entries()) {
      if (known.has(`${weekday}-${index}`)) continue;
      missing.push({ studentId, weekday, slotIndex: index, startMin: slot.startMin, endMin: slot.endMin });
    }
  }
  if (missing.length === 0) return;
  await db.insert(bellSchedules).values(missing).onConflictDoNothing();
}

export async function getWeekBellSlots(studentId: string): Promise<WeekBellSlots> {
  await ensureBellSchedule(studentId);
  const db = await getDb();
  const rows = await db
    .select({
      weekday: bellSchedules.weekday,
      slotIndex: bellSchedules.slotIndex,
      startMin: bellSchedules.startMin,
      endMin: bellSchedules.endMin,
    })
    .from(bellSchedules)
    .where(eq(bellSchedules.studentId, studentId))
    .orderBy(asc(bellSchedules.weekday), asc(bellSchedules.slotIndex));

  const byKey = new Map(rows.map((row) => [`${row.weekday}-${row.slotIndex}`, row]));
  const fallback = defaultBellSlots();
  return Array.from({ length: PANEL_DAYS }, (_, weekday) =>
    Array.from({ length: DEFAULT_BELL_COUNT }, (_, index) => {
      const row = byKey.get(`${weekday}-${index}`);
      return row ? { startMin: row.startMin, endMin: row.endMin } : { ...fallback[index] };
    }),
  );
}

/** Per-day save: each day keeps its own start/end per bell. */
export async function saveWeekBellSlots(studentId: string, value: unknown): Promise<WeekBellSlots> {
  const weekSlots = normalizeWeekBellSlots(value);
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const [weekday, slots] of weekSlots.entries()) {
      for (const [index, slot] of slots.entries()) {
        await tx
          .insert(bellSchedules)
          .values({
            studentId,
            weekday,
            slotIndex: index,
            startMin: slot.startMin,
            endMin: slot.endMin,
          })
          .onConflictDoUpdate({
            target: [bellSchedules.studentId, bellSchedules.weekday, bellSchedules.slotIndex],
            set: { startMin: slot.startMin, endMin: slot.endMin },
          });
      }
    }
  });
  return weekSlots;
}

/** Global defaults: apply one set of bells to every day of the week. */
export async function saveBellSlots(studentId: string, value: unknown): Promise<PanelSlot[]> {
  const slots = normalizeBellSlots(value);
  await saveWeekBellSlots(
    studentId,
    Array.from({ length: PANEL_DAYS }, () => slots.map((slot) => ({ ...slot }))),
  );
  return slots;
}

export function slotIndexForStart(
  slots: readonly { startMin: number; endMin: number }[],
  startMin: number,
): number {
  return slots.findIndex((slot) => startMin >= slot.startMin && startMin < slot.endMin);
}
