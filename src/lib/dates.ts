import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

export const TEHRAN_TZ = "Asia/Tehran";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && formatISO(date) === value;
}

export function formatISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseISODate(iso: string): Date {
  if (!isISODate(iso)) throw new Error(`تاریخ نامعتبر است: ${iso}`);
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatISO(date);
}

export function weekdayIndex(iso: string): number {
  // 0 = Saturday ... 6 = Friday
  return (parseISODate(iso).getUTCDay() + 1) % 7;
}

export function startOfWeekSaturday(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function todayISO(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function formatJalali(iso: string, options?: { short?: boolean }): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "UTC",
    dateStyle: options?.short ? "medium" : "full",
  }).format(date);
}

export function formatJalaliNumeric(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatTime(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (parseISODate(toISO).getTime() - parseISODate(fromISO).getTime()) / 86_400_000,
  );
}

export function tehranDateTime(iso: string, minutes: number): Date {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  // Iran has no DST at the moment; +03:30 is the fixed offset used across the country.
  return new Date(`${iso}T${hh}:${mm}:00+03:30`);
}

export const WEEKDAY_LABELS = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
] as const;

export function tehranDateTimeInput(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

export function formatTehranDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: TEHRAN_TZ,
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

export function tehranMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEHRAN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

export type JalaliMonthRange = {
  key: string;
  from: string;
  to: string;
  label: string;
};

function isoFromGregorian(gy: number, gm: number, gd: number): string {
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export function jalaliMonthKey(iso: string): string {
  const date = parseISODate(iso);
  const { jy, jm } = toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return `${jy}-${String(jm).padStart(2, "0")}`;
}

export function jalaliMonthRange(monthKey: string): JalaliMonthRange | null {
  const match = /^(\d{4})-(\d{1,2})$/.exec(monthKey.trim());
  if (!match) return null;
  const jy = Number(match[1]);
  const jm = Number(match[2]);
  if (jm < 1 || jm > 12) return null;

  const first = toGregorian(jy, jm, 1);
  const last = toGregorian(jy, jm, jalaaliMonthLength(jy, jm));
  const from = isoFromGregorian(first.gy, first.gm, first.gd);
  const to = isoFromGregorian(last.gy, last.gm, last.gd);

  const label = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  }).format(new Date(`${from}T12:00:00Z`));

  return { key: `${jy}-${String(jm).padStart(2, "0")}`, from, to, label };
}

export function currentJalaliMonthRange(): JalaliMonthRange {
  const range = jalaliMonthRange(jalaliMonthKey(todayISO()));
  if (!range) throw new Error("failed to compute jalali month");
  return range;
}

export function shiftJalaliMonth(monthKey: string, delta: number): string {
  const match = /^(\d{4})-(\d{1,2})$/.exec(monthKey.trim());
  if (!match) return monthKey;
  let jy = Number(match[1]);
  let jm = Number(match[2]) + delta;
  while (jm > 12) {
    jm -= 12;
    jy += 1;
  }
  while (jm < 1) {
    jm += 12;
    jy -= 1;
  }
  return `${jy}-${String(jm).padStart(2, "0")}`;
}
