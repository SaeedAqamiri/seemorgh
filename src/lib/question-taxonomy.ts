import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  questionBanks,
  questions,
  resourcePool,
  resourcePoolChapters,
  subjects,
} from "@/db/schema";
import type { SubjectOption } from "./subject-catalog";

export const GRADE_ORDER = ["دهم", "یازدهم", "دوازدهم", "فارغ‌التحصیل"] as const;

const GRADE_NUMBERS: Record<string, string> = {
  دهم: "۱",
  یازدهم: "۲",
  دوازدهم: "۳",
};


function asciiDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

export function normalizeQuestionText(value: string): string {
  return asciiDigits(value)
    .replace(/\u200c/g, " ")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedKey(value: string): string {
  return normalizeQuestionText(value).toLowerCase();
}

export function gradeNumberFor(grade: string): string {
  return GRADE_NUMBERS[grade] ?? "";
}

export function normalizeGrade(value: unknown): string {
  const text = normalizeQuestionText(String(value ?? ""));
  if (!text) return "";
  if (/فارغ/.test(text)) return "فارغ‌التحصیل";
  if (/دوازدهم|سوم/.test(text)) return "دوازدهم";
  if (/یازدهم|دوم/.test(text)) return "یازدهم";
  if (/دهم|اول/.test(text)) return "دهم";
  const digit = text.match(/[123]/)?.[0];
  if (!digit) return "";
  if (digit === "1") return "دهم";
  if (digit === "2") return "یازدهم";
  return "دوازدهم";
}

export function inferSubjectTitleFromBankTitle(title: string): string | null {
  const text = normalizeQuestionText(title);
  const rules: [RegExp, string][] = [
    [/زیست/, "زیست‌شناسی"],
    [/شیمی/, "شیمی"],
    [/فیزیک/, "فیزیک"],
    [/حسابان/, "حسابان"],
    [/هندسه/, "هندسه"],
    [/گسسته/, "گسسته"],
    [/ریاضی و آمار/, "ریاضی و آمار"],
    [/آمار و احتمال/, "آمار و احتمال"],
    [/آمار/, "آمار و احتمال"],
    [/ریاضی/, "ریاضی"],
    [/عربی/, "عربی"],
    [/دین و زندگی|دین و زندگی|تعلیم و تربیت/, "دین و زندگی"],
    [/زبان انگلیسی|انگلیسی/, "زبان انگلیسی"],
    [/علوم و فنون/, "علوم و فنون ادبی"],
    [/ادبیات|فارسی/, "ادبیات فارسی"],
    [/تاریخ/, "تاریخ"],
    [/جغرافیا/, "جغرافیا"],
    [/جامعه/, "جامعه‌شناسی"],
    [/منطق/, "منطق"],
    [/فلسفه/, "فلسفه"],
    [/روان/, "روان‌شناسی"],
    [/اقتصاد/, "اقتصاد"],
    [/زمین/, "زمین‌شناسی"],
    [/هویت/, "هویت اجتماعی"],
  ];
  for (const [pattern, subjectTitle] of rules) {
    if (pattern.test(text)) return subjectTitle;
  }
  return null;
}

const SINGLE_GRADE_SUBJECTS: Record<string, string> = {
  "آمار و احتمال": "یازدهم",
  "زمین‌شناسی": "یازدهم",
  "روان‌شناسی": "یازدهم",
  "منطق": "دهم",
  "اقتصاد": "دهم",
  "گسسته": "دوازدهم",
  "هویت اجتماعی": "دوازدهم",
  "جغرافیای ایران": "دهم",
};

const TWO_BOOK_SUBJECTS = new Set(["حسابان", "فلسفه"]);

export function gradeForBookNumber(subjectTitle: string | null, bookNumber: number): string {
  if (TWO_BOOK_SUBJECTS.has(subjectTitle ?? "")) {
    if (bookNumber === 1) return "یازدهم";
    if (bookNumber === 2) return "دوازدهم";
    return "";
  }
  if (bookNumber === 1) return "دهم";
  if (bookNumber === 2) return "یازدهم";
  if (bookNumber === 3) return "دوازدهم";
  return "";
}

export function inferGradeFromText(text: string, subjectTitle: string | null): string {
  const normalized = normalizeQuestionText(text);
  if (!normalized) {
    return subjectTitle ? SINGLE_GRADE_SUBJECTS[subjectTitle] ?? "" : "";
  }
  if (/فارغ/.test(normalized)) return "فارغ‌التحصیل";
  if (/دوازدهم|پیش دانشگاهی|پیش‌دانشگاهی/.test(normalized)) return "دوازدهم";
  if (/یازدهم/.test(normalized)) return "یازدهم";
  if (/دهم|جغرافیای ایران/.test(normalized)) return "دهم";

  const bookNumber = normalized.match(/(?:^|[^0-9])([123])(?:[^0-9]|$)/);
  if (bookNumber) {
    const grade = gradeForBookNumber(subjectTitle, Number(bookNumber[1]));
    if (grade) return grade;
  }

  return subjectTitle ? SINGLE_GRADE_SUBJECTS[subjectTitle] ?? "" : "";
}

export function bookLabelFor(
  subjectTitle: string,
  grade: string,
  baseTitle?: string | null,
): string {
  const number = gradeNumberFor(grade);
  const base = (baseTitle ?? "").trim();
  if (base) {
    if (grade && base.includes(grade) && number) {
      return base.replace(grade, number);
    }
    return base;
  }
  if (number) return `${subjectTitle} ${number}`;
  return subjectTitle;
}

export function questionBookKey(subjectId: string, grade: string): string {
  return `${subjectId}|${grade}`;
}

export function parseQuestionBookKey(
  key: string,
): { subjectId: string; grade: string } | null {
  const separator = key.indexOf("|");
  if (separator <= 0) return null;
  const subjectId = key.slice(0, separator);
  const grade = key.slice(separator + 1);
  if (!subjectId || !grade) return null;
  return { subjectId, grade };
}

export type QuestionBookOption = {
  key: string;
  subjectId: string;
  subjectTitle: string;
  grade: string;
  label: string;
  chapters: string[];
  topics: string[];
};

export type QuestionTaxonomy = {
  subjects: SubjectOption[];
  groups: { general: SubjectOption[]; specialized: SubjectOption[] };
  books: QuestionBookOption[];
};

function groupSubjects(subjectRows: SubjectOption[]) {
  return {
    general: subjectRows.filter((subject) => subject.kind !== "specialized"),
    specialized: subjectRows.filter((subject) => subject.kind !== "general"),
  };
}

function baseResourceTitle(title: string, publisher: string): string {
  const suffix = publisher ? ` — ${publisher}` : "";
  if (suffix && title.endsWith(suffix)) {
    return title.slice(0, -suffix.length).trim();
  }
  const [base] = title.split(" — ");
  return (base || title).trim();
}

function gradeSortIndex(grade: string): number {
  const index = GRADE_ORDER.indexOf(grade as (typeof GRADE_ORDER)[number]);
  return index < 0 ? GRADE_ORDER.length : index;
}

export async function listQuestionTaxonomy(workspaceId: string): Promise<QuestionTaxonomy> {
  const db = await getDb();
  const subjectRows: SubjectOption[] = await db
    .select({
      id: subjects.id,
      title: subjects.title,
      kind: subjects.kind,
      color: subjects.color,
      fieldsJson: subjects.fieldsJson,
    })
    .from(subjects)
    .where(eq(subjects.workspaceId, workspaceId))
    .orderBy(asc(subjects.title));
  const subjectById = new Map(subjectRows.map((subject) => [subject.id, subject]));

  const poolRows = await db
    .select({
      id: resourcePool.id,
      subjectId: resourcePool.subjectId,
      title: resourcePool.title,
      publisher: resourcePool.publisher,
      grade: resourcePool.grade,
      sortIndex: resourcePoolChapters.sortIndex,
    })
    .from(resourcePool)
    .leftJoin(resourcePoolChapters, eq(resourcePoolChapters.poolId, resourcePool.id))
    .where(eq(resourcePool.workspaceId, workspaceId))
    .orderBy(asc(resourcePool.id), asc(resourcePoolChapters.sortIndex));

  const chapterRows = await db
    .select({
      poolId: resourcePoolChapters.poolId,
      title: resourcePoolChapters.title,
      sortIndex: resourcePoolChapters.sortIndex,
    })
    .from(resourcePoolChapters)
    .innerJoin(resourcePool, eq(resourcePoolChapters.poolId, resourcePool.id))
    .where(eq(resourcePool.workspaceId, workspaceId))
    .orderBy(asc(resourcePoolChapters.poolId), asc(resourcePoolChapters.sortIndex));

  const chaptersByPool = new Map<string, string[]>();
  const seenChapterByPool = new Map<string, Set<string>>();
  for (const chapter of chapterRows) {
    const seen = seenChapterByPool.get(chapter.poolId) ?? new Set<string>();
    const key = normalizedKey(chapter.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    seenChapterByPool.set(chapter.poolId, seen);
    const list = chaptersByPool.get(chapter.poolId) ?? [];
    list.push(chapter.title);
    chaptersByPool.set(chapter.poolId, list);
  }

  const booksByKey = new Map<
    string,
    { subjectId: string; grade: string; baseTitle: string; chapters: string[] }
  >();
  const seenBook = new Set<string>();
  for (const row of poolRows) {
    if (!row.grade || !subjectById.has(row.subjectId)) continue;
    const key = questionBookKey(row.subjectId, row.grade);
    let book = booksByKey.get(key);
    if (!book) {
      book = {
        subjectId: row.subjectId,
        grade: row.grade,
        baseTitle: baseResourceTitle(row.title, row.publisher),
        chapters: [],
      };
      booksByKey.set(key, book);
    }
    if (seenBook.has(row.id)) continue;
    seenBook.add(row.id);
    const chapters = chaptersByPool.get(row.id) ?? [];
    const existing = new Set(book.chapters.map(normalizedKey));
    for (const chapter of chapters) {
      const chapterKey = normalizedKey(chapter);
      if (!chapterKey || existing.has(chapterKey)) continue;
      existing.add(chapterKey);
      book.chapters.push(chapter);
    }
  }

  const questionTopicRows = await db
    .selectDistinct({
      subjectId: questions.subjectId,
      grade: questions.grade,
      topic: questions.topic,
    })
    .from(questions)
    .where(
      and(
        eq(questions.workspaceId, workspaceId),
        ne(questions.grade, ""),
        ne(questions.topic, ""),
      ),
    )
    .orderBy(asc(questions.topic));

  const topicsByKey = new Map<string, string[]>();
  for (const row of questionTopicRows) {
    if (!row.subjectId || !row.grade || !subjectById.has(row.subjectId)) continue;
    const key = questionBookKey(row.subjectId, row.grade);
    if (!booksByKey.has(key)) {
      booksByKey.set(key, {
        subjectId: row.subjectId,
        grade: row.grade,
        baseTitle: "",
        chapters: [],
      });
    }
    const list = topicsByKey.get(key) ?? [];
    list.push(row.topic);
    topicsByKey.set(key, list);
  }

  const books = Array.from(booksByKey.values())
    .map((book) => {
      const subject = subjectById.get(book.subjectId);
      const key = questionBookKey(book.subjectId, book.grade);
      const topics = topicsByKey.get(key) ?? [];
      return {
        key,
        subjectId: book.subjectId,
        subjectTitle: subject?.title ?? "",
        grade: book.grade,
        label: bookLabelFor(subject?.title ?? "", book.grade, book.baseTitle),
        chapters: book.chapters.length > 0 ? book.chapters : topics,
        topics,
      } satisfies QuestionBookOption;
    })
    .sort((a, b) => {
      const subjectCompare = a.subjectTitle.localeCompare(b.subjectTitle, "fa");
      if (subjectCompare !== 0) return subjectCompare;
      return gradeSortIndex(a.grade) - gradeSortIndex(b.grade);
    });

  return {
    subjects: subjectRows,
    groups: groupSubjects(subjectRows),
    books,
  };
}

export type QuestionTaxonomyBackfillResult = {
  banks: number;
  banksUpdated: number;
  questionsUpdated: number;
};

export async function backfillQuestionTaxonomy(
  workspaceId?: string,
): Promise<QuestionTaxonomyBackfillResult> {
  const db = await getDb();
  const bankRows = await db
    .select({
      id: questionBanks.id,
      workspaceId: questionBanks.workspaceId,
      title: questionBanks.title,
      subjectId: questionBanks.subjectId,
    })
    .from(questionBanks);
  const subjectRows = await db
    .select({
      id: subjects.id,
      workspaceId: subjects.workspaceId,
      title: subjects.title,
    })
    .from(subjects);

  const subjectIdByKey = new Map(
    subjectRows.map((subject) => [
      `${subject.workspaceId}:${normalizedKey(subject.title)}`,
      subject.id,
    ]),
  );
  const subjectById = new Map(subjectRows.map((subject) => [subject.id, subject]));

  let banksUpdated = 0;
  let questionsUpdated = 0;
  let processedBanks = 0;

  for (const bank of bankRows) {
    if (workspaceId && bank.workspaceId !== workspaceId) continue;
    processedBanks += 1;

    const currentSubject = bank.subjectId ? subjectById.get(bank.subjectId) : undefined;
    const inferredTitle = inferSubjectTitleFromBankTitle(bank.title);
    const inferredSubjectId = inferredTitle
      ? subjectIdByKey.get(`${bank.workspaceId}:${normalizedKey(inferredTitle)}`) ?? null
      : null;
    const importedBank = /^منتا\s*-/.test(bank.title);

    const nextSubjectId =
      inferredSubjectId && (bank.subjectId === null || importedBank)
        ? inferredSubjectId
        : bank.subjectId;
    const subjectTitle =
      (nextSubjectId ? subjectById.get(nextSubjectId)?.title : undefined) ?? inferredTitle;
    const grade = inferGradeFromText(bank.title, subjectTitle ?? null);

    let bankChanged = false;
    if (nextSubjectId !== bank.subjectId) {
      await db
        .update(questionBanks)
        .set({ subjectId: nextSubjectId })
        .where(eq(questionBanks.id, bank.id));
      bankChanged = true;
    }

    if (nextSubjectId !== bank.subjectId || grade) {
      const set: { subjectId?: string | null; grade?: string } = {};
      if (nextSubjectId !== bank.subjectId) set.subjectId = nextSubjectId;
      if (grade) set.grade = grade;
      if (Object.keys(set).length > 0) {
        await db.update(questions).set(set).where(eq(questions.bankId, bank.id));
        questionsUpdated += 1;
      }
    }

    if (bankChanged) banksUpdated += 1;
  }

  return { banks: processedBanks, banksUpdated, questionsUpdated };
}
