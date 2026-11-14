import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bellSchedules } from "@/db/schema";

export const PANEL_DAYS = 7;
export const DEFAULT_BELL_COUNT = 10;
export const DEFAULT_BELL_START = 8 * 60;
export const DEFAULT_BELL_MINUTES = 90;

export type PanelSlot = { startMin: number; endMin: number };

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

export function faNumber(value: number): string {
  return value.toLocaleString("fa-IR");
}

export class ScheduleValidationError extends Error {}

function normalizeSlot(value: unknown, index: number): PanelSlot {
  if (!value || typeof value !== "object") {
    throw new ScheduleValidationError(`زنگ ${index + 1}: ساختار نامعتبر است.`);
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
      `زنگ ${index + 1}: ساعت شروع/پایان باید معتبر و پایان بعد از شروع باشد.`,
    );
  }
  return { startMin, endMin };
}

export function normalizeBellSlots(value: unknown): PanelSlot[] {
  if (!Array.isArray(value) || value.length !== DEFAULT_BELL_COUNT) {
    throw new ScheduleValidationError("تعداد زنگ‌ها باید ۱۰ عدد باشد.");
  }
  return value.map((slot, index) => normalizeSlot(slot, index));
}

export async function ensureBellSchedule(studentId: string): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ slotIndex: bellSchedules.slotIndex })
    .from(bellSchedules)
    .where(eq(bellSchedules.studentId, studentId));
  const known = new Set(existing.map((row) => row.slotIndex));
  const missing = defaultBellSlots()
    .map((slot, index) => ({ slot, index }))
    .filter(({ index }) => !known.has(index));
  if (missing.length === 0) return;
  await db
    .insert(bellSchedules)
    .values(
      missing.map(({ slot, index }) => ({
        studentId,
        slotIndex: index,
        startMin: slot.startMin,
        endMin: slot.endMin,
      })),
    )
    .onConflictDoNothing();
}

export async function getBellSlots(studentId: string): Promise<PanelSlot[]> {
  await ensureBellSchedule(studentId);
  const db = await getDb();
  const rows = await db
    .select({ slotIndex: bellSchedules.slotIndex, startMin: bellSchedules.startMin, endMin: bellSchedules.endMin })
    .from(bellSchedules)
    .where(eq(bellSchedules.studentId, studentId))
    .orderBy(asc(bellSchedules.slotIndex));

  const byIndex = new Map(rows.map((row) => [row.slotIndex, row]));
  return defaultBellSlots().map((fallback, index) => {
    const row = byIndex.get(index);
    return row ? { startMin: row.startMin, endMin: row.endMin } : fallback;
  });
}

export async function saveBellSlots(studentId: string, value: unknown): Promise<PanelSlot[]> {
  const slots = normalizeBellSlots(value);
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const [index, slot] of slots.entries()) {
      await tx
        .insert(bellSchedules)
        .values({ studentId, slotIndex: index, startMin: slot.startMin, endMin: slot.endMin })
        .onConflictDoUpdate({
          target: [bellSchedules.studentId, bellSchedules.slotIndex],
          set: { startMin: slot.startMin, endMin: slot.endMin },
        });
    }
  });
  return slots;
}

export function slotIndexForStart(
  slots: readonly { startMin: number; endMin: number }[],
  startMin: number,
): number {
  return slots.findIndex((slot) => startMin >= slot.startMin && startMin < slot.endMin);
}
