export type SubjectKind = "general" | "specialized" | "both";

export type SubjectCatalogItem = {
  title: string;
  kind: SubjectKind;
  fields: readonly string[];
  color: string;
};

const ALL_FIELDS = ["تجربی", "ریاضی", "انسانی", "هنر", "زبان"] as const;

export const SUBJECT_COLORS = {
  literature: "#8b5cf6",
  writing: "#a78bfa",
  arabic: "#d97706",
  religion: "#0f766e",
  english: "#2563eb",
  art: "#db2777",
  geography: "#0891b2",
  history: "#b45309",
  environment: "#16a34a",
  media: "#64748b",
  defense: "#475569",
  entrepreneurship: "#7c3aed",
  family: "#e11d48",
  health: "#059669",
  identity: "#9333ea",
  culture: "#c026d3",
  religions: "#6b7280",
  calculus: "#dc2626",
  geometry: "#ea580c",
  discrete: "#7c2d12",
  statistics: "#ca8a04",
  physics: "#1d4ed8",
  chemistry: "#15803d",
  biology: "#166534",
  math: "#b91c1c",
  mathStatistics: "#be123c",
  literatureTechniques: "#7e22ce",
  economics: "#a16207",
  sociology: "#0e7490",
  logic: "#4f46e5",
  philosophy: "#5b21b6",
  psychology: "#be185d",
  geology: "#92400e",
  lab: "#334155",
} as const;

/**
 * Catalog of Iranian upper-secondary subjects, grouped across grades.
 * A "subject" here is the planning-level course (e.g. فیزیک) while the
 * grade-specific books (فیزیک ۱/۲/۳) are modelled as resources/chapters.
 */
export const SUBJECT_CATALOG: readonly SubjectCatalogItem[] = [
  // ── عمومی ──────────────────────────────────────────────────────────────
  { title: "ادبیات فارسی", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.literature },
  { title: "نگارش", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.writing },
  { title: "عربی", kind: "both", fields: ALL_FIELDS, color: SUBJECT_COLORS.arabic },
  { title: "دین و زندگی", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.religion },
  { title: "زبان انگلیسی", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.english },
  { title: "هنر", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.art },
  { title: "جغرافیای ایران", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.geography },
  { title: "تاریخ معاصر", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.history },
  { title: "انسان و محیط زیست", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.environment },
  { title: "تفکر و سواد رسانه‌ای", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.media },
  { title: "آمادگی دفاعی", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.defense },
  { title: "کارگاه کارآفرینی و تولید", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.entrepreneurship },
  { title: "مدیریت خانواده و سبک زندگی", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.family },
  { title: "سلامت و بهداشت", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.health },
  { title: "هویت اجتماعی", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.identity },
  { title: "تحلیل فرهنگی", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.culture },
  { title: "تعلیمات ادیان الهی و اخلاق", kind: "general", fields: ALL_FIELDS, color: SUBJECT_COLORS.religions },

  // ── ریاضی فیزیک ────────────────────────────────────────────────────────
  { title: "حسابان", kind: "specialized", fields: ["ریاضی"], color: SUBJECT_COLORS.calculus },
  { title: "هندسه", kind: "specialized", fields: ["ریاضی"], color: SUBJECT_COLORS.geometry },
  { title: "گسسته", kind: "specialized", fields: ["ریاضی"], color: SUBJECT_COLORS.discrete },
  { title: "آمار و احتمال", kind: "specialized", fields: ["ریاضی"], color: SUBJECT_COLORS.statistics },

  // ── تجربی ──────────────────────────────────────────────────────────────
  { title: "زیست‌شناسی", kind: "specialized", fields: ["تجربی"], color: SUBJECT_COLORS.biology },
  { title: "ریاضی", kind: "specialized", fields: ["تجربی"], color: SUBJECT_COLORS.math },
  { title: "زمین‌شناسی", kind: "specialized", fields: ["تجربی", "ریاضی"], color: SUBJECT_COLORS.geology },
  { title: "آزمایشگاه علوم تجربی", kind: "specialized", fields: ["تجربی", "ریاضی"], color: SUBJECT_COLORS.lab },

  // ── مشترک ریاضی و تجربی ────────────────────────────────────────────────
  { title: "فیزیک", kind: "specialized", fields: ["ریاضی", "تجربی"], color: SUBJECT_COLORS.physics },
  { title: "شیمی", kind: "specialized", fields: ["ریاضی", "تجربی"], color: SUBJECT_COLORS.chemistry },

  // ── انسانی ─────────────────────────────────────────────────────────────
  { title: "ریاضی و آمار", kind: "specialized", fields: ["انسانی"], color: SUBJECT_COLORS.mathStatistics },
  { title: "علوم و فنون ادبی", kind: "specialized", fields: ["انسانی"], color: SUBJECT_COLORS.literatureTechniques },
  { title: "اقتصاد", kind: "specialized", fields: ["انسانی"], color: SUBJECT_COLORS.economics },
  { title: "تاریخ", kind: "specialized", fields: ["انسانی"], color: SUBJECT_COLORS.history },
  { title: "جغرافیا", kind: "specialized", fields: ["انسانی"], color: SUBJECT_COLORS.geography },
  { title: "جامعه‌شناسی", kind: "specialized", fields: ["انسانی"], color: SUBJECT_COLORS.sociology },
  { title: "منطق", kind: "specialized", fields: ["انسانی"], color: SUBJECT_COLORS.logic },
  { title: "فلسفه", kind: "specialized", fields: ["انسانی"], color: SUBJECT_COLORS.philosophy },
  { title: "روان‌شناسی", kind: "specialized", fields: ["انسانی"], color: SUBJECT_COLORS.psychology },
];

export const DEFAULT_SUBJECTS = SUBJECT_CATALOG.map((subject) => subject.title);

export const GRADES = ["دهم", "یازدهم", "دوازدهم", "فارغ‌التحصیل"] as const;

export const FIELDS = ["تجربی", "ریاضی", "انسانی", "هنر", "زبان"] as const;

export const FIELD_LABELS: Record<string, string> = {
  تجربی: "علوم تجربی",
  ریاضی: "ریاضی فیزیک",
  انسانی: "علوم انسانی",
  هنر: "هنر",
  زبان: "زبان",
};

export const UNIT_TYPE_LABELS = {
  test: "تست",
  page: "صفحه",
  chapter: "فصل",
} as const;

export const TRACK_LABELS = {
  konkur: "کنکور",
  final: "امتحان نهایی",
  both: "کنکور و نهایی",
} as const;

export function catalogItemFor(title: string): SubjectCatalogItem | undefined {
  return SUBJECT_CATALOG.find((subject) => subject.title === title);
}

export function subjectAvailableForField(title: string, field: string): boolean {
  const item = catalogItemFor(title);
  if (!item) return true;
  return item.fields.includes(field);
}

/**
 * Splits subjects for a student's field into the two groups used by the panel
 * picker (عمومی / تخصصی). Subjects marked `both` (e.g. عربی for انسانی) appear
 * in both groups, otherwise they appear once under their own group.
 */
export function groupSubjectsForField<T extends { title: string; kind: string }>(
  subjects: readonly T[],
  field: string,
): { general: T[]; specialized: T[] } {
  const general: T[] = [];
  const specialized: T[] = [];
  for (const subject of subjects) {
    const kind = subject.kind;
    if (kind === "general") {
      general.push(subject);
    } else if (kind === "specialized") {
      specialized.push(subject);
    } else {
      general.push(subject);
      if (field === "انسانی") specialized.push(subject);
    }
  }
  return { general, specialized };
}
