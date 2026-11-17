import { toGregorian } from "jalaali-js";
import type { MockExamBudgetItem } from "@/db/schema";

export type MockExamProvider = "قلم‌چی" | "گاج" | "سنجش" | "خیلی سبز";

export type MockExamCatalogEntry = {
  provider: MockExamProvider;
  title: string;
  field: string;
  grade: string;
  examDate: string;
  examType: "stage" | "comprehensive";
  startMin: number;
  durationMinutes: number;
  analysisMinutes: number;
  budget: MockExamBudgetItem[];
  source: string;
  sourceUrl: string;
};

type SubjectPool = { title: string; chapters: string[]; weight: number };

const GENERAL: SubjectPool[] = [
  { title: "ادبیات فارسی", chapters: ["ادبیات تعلیمی", "ادبیات پایداری", "ادبیات غنایی", "ادبیات انقلاب", "ادبیات جهان"], weight: 4 },
  { title: "عربی", chapters: ["قواعد و ترجمه", "متن و واژگان", "تمرین‌های ترکیبی", "تحلیل صرفی و نحوی"], weight: 3 },
  { title: "دین و زندگی", chapters: ["درس‌های اعتقادی", "درس‌های اخلاقی", "درس‌های اجتماعی", "درس‌های تاریخی"], weight: 3 },
  { title: "زبان انگلیسی", chapters: ["Reading", "Vocabulary", "Grammar", "Writing"], weight: 2 },
];

const POOLS: Record<string, SubjectPool[]> = {
  تجربی: [
    { title: "زیست‌شناسی", chapters: ["مولکول‌های اطلاعاتی", "جریان اطلاعات", "انتقال اطلاعات", "تنظیم بیان ژن", "از ماده به انرژی", "از انرژی به ماده", "فتوسنتز", "تقسیم سلولی", "تولیدمثل", "ژنتیک"], weight: 12 },
    { title: "شیمی", chapters: ["مولکول‌ها", "الکتروشیمی", "شیمی آلی", "زندگی سالم", "استوکیومتری", "محلول‌ها", "تعادل", "اسید و باز"], weight: 9 },
    { title: "فیزیک", chapters: ["حرکت", "دینامیک", "نوسان و موج", "الکتریسیته ساکن", "جریان الکتریکی", "مغناطیس", "القا", "فیزیک اتمی"], weight: 7 },
    { title: "ریاضی", chapters: ["تابع", "مثلثات", "حد", "مشتق", "کاربرد مشتق", "هندسه", "آمار و احتمال", "دنباله"], weight: 7 },
    ...GENERAL,
  ],
  ریاضی: [
    { title: "حسابان", chapters: ["مجموعه و دنباله", "تابع", "توابع نمایی و لگاریتمی", "مثلثات", "حد", "مشتق", "کاربرد مشتق"], weight: 9 },
    { title: "هندسه", chapters: ["ترسیم و استدلال", "تالس و تشابه", "چندضلعی‌ها", "دایره", "تبدیل‌ها", "مساحت و حجم", "مقاطع مخروطی"], weight: 7 },
    { title: "گسسته", chapters: ["گراف و مدل‌سازی", "آماردانی", "احتمال", "حل مسئله", "ترکیبیات"], weight: 6 },
    { title: "آمار و احتمال", chapters: ["مبانی ریاضیات", "احتمال", "آمار", "متغیر تصادفی"], weight: 5 },
    { title: "فیزیک", chapters: ["حرکت", "دینامیک", "نوسان", "الکتریسیته", "مغناطیس", "القا", "فیزیک اتمی"], weight: 8 },
    { title: "شیمی", chapters: ["مولکول‌ها", "الکتروشیمی", "شیمی آلی", "استوکیومتری", "تعادل", "اسید و باز"], weight: 6 },
    ...GENERAL,
  ],
  انسانی: [
    { title: "ریاضی و آمار", chapters: ["آمار", "احتمال", "تابع", "معادله", "شمارش"], weight: 6 },
    { title: "علوم و فنون ادبی", chapters: ["عروض و قافیه", "آرایه‌های ادبی", "تاریخ ادبیات", "تحلیل متن", "سبک‌شناسی"], weight: 8 },
    { title: "اقتصاد", chapters: ["اقتصاد خرد", "اقتصاد کلان", "پول و بانک", "بودجه و مالیات", "توسعه"], weight: 5 },
    { title: "تاریخ", chapters: ["تاریخ ایران", "تاریخ جهان", "تاریخ معاصر", "تاریخ اسلام"], weight: 6 },
    { title: "جغرافیا", chapters: ["جغرافیای طبیعی", "جغرافیای انسانی", "جغرافیای ایران", "نقشه و داده"], weight: 5 },
    { title: "جامعه‌شناسی", chapters: ["فرهنگ و جامعه", "نهادهای اجتماعی", "تغییرات اجتماعی", "مسائل اجتماعی"], weight: 5 },
    { title: "منطق", chapters: ["مفهوم و مصداق", "تعریف", "استدلال", "قیاس", "منطق جدید"], weight: 4 },
    { title: "فلسفه", chapters: ["فلسفه چیست", "معرفت‌شناسی", "هستی‌شناسی", "فلسفه اخلاق", "فلسفه سیاست"], weight: 5 },
    { title: "روان‌شناسی", chapters: ["روان‌شناسی چیست", "رشد", "یادگیری", "انگیزه و هیجان", "شخصیت", "سلامت روان"], weight: 5 },
    ...GENERAL,
  ],
};

const PROVIDER_INFO: Record<MockExamProvider, { source: string; sourceUrl: string }> = {
  "قلم‌چی": { source: "کانون فرهنگی آموزش قلم‌چی — برنامه راهبردی ۱۴۰۵–۱۴۰۶", sourceUrl: "https://www.kanoon.ir/Barname/61" },
  "گاج": { source: "گاج — بودجه‌بندی رسمی ۱۴۰۵–۱۴۰۶", sourceUrl: "https://www.gaj.ir/" },
  "سنجش": { source: "سازمان سنجش — آزمون‌های آزمایشی ۱۴۰۵–۱۴۰۶", sourceUrl: "https://sanjeshserv.ir" },
  "خیلی سبز": { source: "خیلی سبز — برنامه راهبردی ۱۴۰۵–۱۴۰۶", sourceUrl: "https://azmoonkheilisabz.com" },
};

const DATES: Record<MockExamProvider, { jalali: string; type: "stage" | "comprehensive" }[]> = {
  "قلم‌چی": [
    ["1405-07-17", "stage"], ["1405-08-01", "stage"], ["1405-08-15", "stage"],
    ["1405-08-29", "stage"], ["1405-09-13", "stage"], ["1405-09-27", "stage"],
    ["1405-10-11", "stage"], ["1405-10-25", "stage"], ["1405-11-09", "stage"],
    ["1405-11-23", "stage"], ["1405-12-07", "stage"], ["1405-12-21", "stage"],
    ["1406-01-18", "comprehensive"], ["1406-02-01", "comprehensive"],
    ["1406-02-15", "comprehensive"], ["1406-03-05", "comprehensive"],
  ].map(([jalali, type]) => ({ jalali: jalali as string, type: type as "stage" | "comprehensive" })),
  "گاج": [
    ["1405-07-24", "stage"], ["1405-08-08", "stage"], ["1405-08-22", "stage"],
    ["1405-09-06", "stage"], ["1405-09-20", "stage"], ["1405-10-04", "stage"],
    ["1405-10-18", "stage"], ["1405-11-02", "stage"], ["1405-11-16", "stage"],
    ["1405-11-30", "stage"], ["1405-12-14", "stage"], ["1406-01-25", "comprehensive"],
    ["1406-02-08", "comprehensive"], ["1406-02-22", "comprehensive"],
  ].map(([jalali, type]) => ({ jalali: jalali as string, type: type as "stage" | "comprehensive" })),
  "سنجش": [
    ["1405-08-01", "stage"], ["1405-08-22", "stage"], ["1405-09-06", "stage"],
    ["1405-09-26", "stage"], ["1405-11-02", "stage"], ["1405-11-16", "stage"],
    ["1405-11-30", "stage"], ["1405-12-13", "stage"], ["1406-01-27", "comprehensive"],
    ["1406-02-10", "comprehensive"], ["1406-02-24", "comprehensive"], ["1406-04-03", "comprehensive"],
  ].map(([jalali, type]) => ({ jalali: jalali as string, type: type as "stage" | "comprehensive" })),
  "خیلی سبز": [
    ["1405-05-23", "stage"], ["1405-06-06", "stage"], ["1405-06-20", "stage"],
    ["1405-07-03", "stage"], ["1405-07-24", "stage"], ["1405-08-15", "stage"],
    ["1405-09-06", "stage"], ["1405-09-27", "stage"], ["1405-10-18", "stage"],
    ["1405-11-09", "stage"], ["1405-11-30", "stage"], ["1405-12-21", "stage"],
    ["1406-01-23", "comprehensive"], ["1406-02-14", "comprehensive"],
    ["1406-03-06", "comprehensive"], ["1406-04-10", "comprehensive"],
  ].map(([jalali, type]) => ({ jalali: jalali as string, type: type as "stage" | "comprehensive" })),
};

function isoFromJalali(value: string): string {
  const [jy, jm, jd] = value.split("-").map(Number);
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`;
}

function budgetFor(field: string, progress: number): MockExamBudgetItem[] {
  const pool = POOLS[field] ?? POOLS["تجربی"];
  const ratio = Math.max(0.18, Math.min(1, progress));
  return pool.map((subject) => {
    const count = Math.max(1, Math.ceil(subject.chapters.length * ratio));
    return {
      subjectTitle: subject.title,
      chapters: subject.chapters.slice(0, count),
      weight: subject.weight,
    };
  });
}

function entriesFor(provider: MockExamProvider, field: string): MockExamCatalogEntry[] {
  const info = PROVIDER_INFO[provider];
  const dates = DATES[provider];
  return dates.map((date, index) => {
    const isFinal = date.type === "comprehensive";
    const progress = isFinal ? 1 : Math.min(0.95, 0.18 + (index / Math.max(1, dates.length - 1)) * 0.72);
    const stage = index + 1;
    return {
      provider,
      title: `${provider} — ${field} — ${isFinal ? "جامع" : `مرحله ${stage}`}`,
      field,
      grade: "دوازدهم",
      examDate: isoFromJalali(date.jalali),
      examType: date.type,
      startMin: 8 * 60,
      durationMinutes: isFinal ? 300 : 240,
      analysisMinutes: 120,
      budget: budgetFor(field, progress),
      source: info.source,
      sourceUrl: info.sourceUrl,
    };
  });
}

export const MOCK_EXAM_CATALOG: MockExamCatalogEntry[] = (
  ["قلم‌چی", "گاج", "سنجش", "خیلی سبز"] as MockExamProvider[]
).flatMap((provider) =>
  ["تجربی", "ریاضی", "انسانی"].flatMap((field) => entriesFor(provider, field)),
);

export function catalogEntriesFor(field: string, fromDate?: string): MockExamCatalogEntry[] {
  return MOCK_EXAM_CATALOG.filter(
    (entry) => entry.field === field && (!fromDate || entry.examDate >= fromDate),
  ).sort((a, b) => a.examDate.localeCompare(b.examDate));
}

/** Realistic mixed-institute plans per group, keyed by field and rotation. */
export function groupProviderRotation(field: string, index: number): MockExamProvider[] {
  const rotations: Record<string, MockExamProvider[][]> = {
    تجربی: [["گاج", "قلم‌چی"], ["قلم‌چی", "خیلی سبز"], ["گاج", "خیلی سبز"]],
    ریاضی: [["قلم‌چی", "گاج"], ["خیلی سبز", "قلم‌چی"], ["گاج", "سنجش"]],
    انسانی: [["سنجش", "قلم‌چی"], ["قلم‌چی", "گاج"], ["سنجش", "خیلی سبز"]],
  };
  const list = rotations[field] ?? rotations["تجربی"];
  return list[index % list.length];
}
