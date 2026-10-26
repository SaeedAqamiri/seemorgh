export const DEFAULT_SUBJECTS = [
  "ریاضی",
  "فیزیک",
  "شیمی",
  "زیست‌شناسی",
  "ادبیات فارسی",
  "عربی",
  "زبان انگلیسی",
  "دین و زندگی",
  "زمین‌شناسی",
  "اقتصاد",
  "تاریخ",
  "جغرافیا",
  "فلسفه",
  "منطق",
  "روان‌شناسی",
] as const;

export const GRADES = ["دهم", "یازدهم", "دوازدهم", "فارغ‌التحصیل"] as const;

export const FIELDS = ["تجربی", "ریاضی", "انسانی", "هنر", "زبان"] as const;

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
