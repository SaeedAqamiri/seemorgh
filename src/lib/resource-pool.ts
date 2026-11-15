import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  resourcePool,
  resourcePoolChapters,
  resourceChapters,
  resources,
  students,
  subjects,
  type ResourceChapter,
} from "@/db/schema";
import { parseChapterPlan } from "./resources";
import { subjectSupportsTests } from "./subjects";
import { ensureChaptersFromJson, replaceResourceChapters } from "./resource-chapters";
import { buildPoolBooks, POOL_PUBLISHERS, type PoolChapterSeed } from "./resource-pool-data";
import { ensureSubjectCatalog, normalizeGeneralSubjectResources } from "./subject-catalog";

export class ResourcePoolError extends Error {}

export type PoolChapterView = {
  id: string;
  title: string;
  sortIndex: number;
  pages: number;
  testCount: number;
  exerciseCount: number;
};

export type PoolBookView = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  title: string;
  publisher: string;
  grade: string;
  unitType: "test" | "exercise" | "page" | "chapter";
  totalUnits: number;
  priority: number;
  chapters: PoolChapterView[];
};

function totalFor(unitType: string, chapters: { pages: number; testCount: number; exerciseCount: number }[]) {
  if (unitType === "page") return chapters.reduce((sum, chapter) => sum + chapter.pages, 0);
  if (unitType === "chapter") return chapters.length;
  if (unitType === "exercise") return chapters.reduce((sum, chapter) => sum + chapter.exerciseCount, 0);
  return chapters.reduce((sum, chapter) => sum + chapter.testCount, 0);
}

export async function seedResourcePool(workspaceId: string): Promise<{ books: number; chapters: number }> {
  const db = await getDb();
  await ensureSubjectCatalog(workspaceId);

  const subjectRows = await db
    .select({ id: subjects.id, title: subjects.title })
    .from(subjects)
    .where(eq(subjects.workspaceId, workspaceId));
  const subjectIdByTitle = new Map(subjectRows.map((row) => [row.title, row.id]));

  const seeds = buildPoolBooks();
  const insertable = seeds
    .map((seed) => {
      const subjectId = subjectIdByTitle.get(seed.subject);
      if (!subjectId) return null;
      const totalUnits = totalFor(
        seed.unitType,
        seed.chapters.map((chapter) => ({
          pages: chapter.pages,
          testCount: chapter.tests,
          exerciseCount: chapter.exercises,
        })),
      );
      return {
        workspaceId,
        subjectId,
        title: seed.title,
        publisher: seed.publisher,
        grade: seed.grade,
        unitType: seed.unitType,
        totalUnits,
        priority: seed.priority,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (insertable.length > 0) {
    await db.insert(resourcePool).values(insertable).onConflictDoNothing();
  }

  const poolRows = await db
    .select({ id: resourcePool.id, subjectId: resourcePool.subjectId, title: resourcePool.title })
    .from(resourcePool)
    .where(eq(resourcePool.workspaceId, workspaceId));
  const poolIdByKey = new Map(poolRows.map((row) => [`${row.subjectId}|${row.title}`, row.id]));

  const existingChapterCounts = await db
    .select({ poolId: resourcePoolChapters.poolId })
    .from(resourcePoolChapters)
    .where(inArray(resourcePoolChapters.poolId, poolRows.map((row) => row.id)));
  const hasChapters = new Set(existingChapterCounts.map((row) => row.poolId));

  const chapterValues: (typeof resourcePoolChapters.$inferInsert)[] = [];
  for (const seed of seeds) {
    const subjectId = subjectIdByTitle.get(seed.subject);
    if (!subjectId) continue;
    const poolId = poolIdByKey.get(`${subjectId}|${seed.title}`);
    if (!poolId || hasChapters.has(poolId)) continue;
    seed.chapters.forEach((chapter, index) => {
      const pageStart = chapter.pages > 0 ? 1 : null;
      chapterValues.push({
        poolId,
        title: chapter.title,
        sortIndex: index,
        pageStart,
        pageEnd: chapter.pages > 0 ? chapter.pages : null,
        pages: chapter.pages,
        testCount: chapter.tests,
        exerciseCount: chapter.exercises,
      });
    });
  }

  for (let index = 0; index < chapterValues.length; index += 500) {
    await db.insert(resourcePoolChapters).values(chapterValues.slice(index, index + 500));
  }

  await normalizeGeneralSubjectResources(workspaceId, { force: true });

  return { books: insertable.length, chapters: chapterValues.length };
}

export async function listResourcePool(workspaceId: string): Promise<PoolBookView[]> {
  const db = await getDb();
  await ensureSubjectCatalog(workspaceId);
  const books = await db
    .select({
      id: resourcePool.id,
      subjectId: resourcePool.subjectId,
      subjectTitle: subjects.title,
      title: resourcePool.title,
      publisher: resourcePool.publisher,
      grade: resourcePool.grade,
      unitType: resourcePool.unitType,
      totalUnits: resourcePool.totalUnits,
      priority: resourcePool.priority,
    })
    .from(resourcePool)
    .innerJoin(subjects, eq(resourcePool.subjectId, subjects.id))
    .where(eq(resourcePool.workspaceId, workspaceId))
    .orderBy(asc(subjects.title), asc(resourcePool.grade), asc(resourcePool.title));

  if (books.length === 0) return [];

  const chapterRows = await db
    .select()
    .from(resourcePoolChapters)
    .where(inArray(resourcePoolChapters.poolId, books.map((book) => book.id)))
    .orderBy(asc(resourcePoolChapters.poolId), asc(resourcePoolChapters.sortIndex));
  const chaptersByPool = new Map<string, PoolChapterView[]>();
  for (const chapter of chapterRows) {
    const list = chaptersByPool.get(chapter.poolId) ?? [];
    list.push({
      id: chapter.id,
      title: chapter.title,
      sortIndex: chapter.sortIndex,
      pages: chapter.pages,
      testCount: chapter.testCount,
      exerciseCount: chapter.exerciseCount,
    });
    chaptersByPool.set(chapter.poolId, list);
  }

  return books.map((book) => ({
    ...book,
    unitType: book.unitType as PoolBookView["unitType"],
    chapters: chaptersByPool.get(book.id) ?? [],
  }));
}

export async function getPoolBook(
  workspaceId: string,
  poolId: string,
): Promise<PoolBookView | null> {
  const books = await listResourcePool(workspaceId);
  return books.find((book) => book.id === poolId) ?? null;
}

export type AddPoolBookInput = {
  workspaceId: string;
  actorId: string;
  subjectId: string;
  title: string;
  publisher: string;
  grade: string;
  unitType: "test" | "exercise" | "page" | "chapter";
  priority: number;
  chaptersText: string;
  totalUnits: number;
};

export async function addPoolBook(input: AddPoolBookInput): Promise<string> {
  const db = await getDb();
  const [subject] = await db
    .select({ id: subjects.id, kind: subjects.kind })
    .from(subjects)
    .where(and(eq(subjects.id, input.subjectId), eq(subjects.workspaceId, input.workspaceId)))
    .limit(1);
  if (!subject) throw new ResourcePoolError("درس انتخاب‌شده معتبر نیست.");

  const supportsTests = subjectSupportsTests(subject.kind);
  const unitType = supportsTests ? "test" : "exercise";
  const parsed = parseChapterPlan(
    input.chaptersText,
    0,
    supportsTests ? "test" : "exercise",
  );
  if (parsed.error) throw new ResourcePoolError(parsed.error);
  const chapters = parsed.chapters ?? [];
  const totalUnits =
    chapters.length > 0
      ? totalFor(unitType, chapters.map((chapter) => ({
          pages: chapter.pages,
          testCount: chapter.testCount ?? 0,
          exerciseCount: chapter.exerciseCount ?? 0,
        })))
      : Math.max(0, input.totalUnits);

  const [created] = await db
    .insert(resourcePool)
    .values({
      workspaceId: input.workspaceId,
      subjectId: input.subjectId,
      title: input.title,
      publisher: input.publisher,
      grade: input.grade,
      unitType,
      totalUnits,
      priority: input.priority,
      createdBy: input.actorId,
    })
    .returning({ id: resourcePool.id });

  if (chapters.length > 0) {
    await db.insert(resourcePoolChapters).values(
      chapters.map((chapter, index) => ({
        poolId: created.id,
        title: chapter.title,
        sortIndex: index,
        pageStart: chapter.pages > 0 ? chapter.startPage : null,
        pageEnd: chapter.pages > 0 ? chapter.endPage : null,
        pages: chapter.pages,
        testCount: chapter.testCount ?? 0,
        exerciseCount: chapter.exerciseCount ?? 0,
      })),
    );
  }

  return created.id;
}

export async function deletePoolBook(workspaceId: string, poolId: string): Promise<void> {
  const db = await getDb();
  await db
    .delete(resourcePool)
    .where(and(eq(resourcePool.id, poolId), eq(resourcePool.workspaceId, workspaceId)));
}

export async function copyPoolBookToStudent(
  workspaceId: string,
  studentId: string,
  poolId: string,
  priority?: number,
): Promise<string> {
  const db = await getDb();
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.workspaceId, workspaceId)))
    .limit(1);
  if (!student) throw new ResourcePoolError("دانش‌آموز پیدا نشد.");

  const book = await getPoolBook(workspaceId, poolId);
  if (!book) throw new ResourcePoolError("منبع انتخاب‌شده در استخر پیدا نشد.");
  if (!book.chapters.length) throw new ResourcePoolError("این منبع در استخر فصل‌بندی ندارد.");

  const [duplicate] = await db
    .select({ id: resources.id })
    .from(resources)
    .where(
      and(
        eq(resources.studentId, studentId),
        eq(resources.subjectId, book.subjectId),
        eq(resources.title, book.title),
      ),
    )
    .limit(1);
  if (duplicate) throw new ResourcePoolError("این منبع قبلاً برای دانش‌آموز ثبت شده است.");

  const chapters: ResourceChapter[] = book.chapters.map((chapter) => ({
    title: chapter.title,
    pages: chapter.pages,
    startPage: 1,
    endPage: chapter.pages,
    testCount: chapter.testCount,
    exerciseCount: chapter.exerciseCount,
  }));

  const [created] = await db
    .insert(resources)
    .values({
      workspaceId,
      studentId,
      subjectId: book.subjectId,
      title: book.title,
      unitType: book.unitType,
      totalUnits: book.totalUnits,
      completedUnits: 0,
      priority: Math.max(1, Math.min(5, priority ?? book.priority)),
    })
    .returning({ id: resources.id });

  await replaceResourceChapters(db, created.id, chapters);
  return created.id;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[—–\-_|/]/g, " ")
    .replace(/تست|موضوعی|جامع|صفحه|ریاضی|تجربی|انسانی/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function gradeOf(value: string): string | null {
  if (value.includes("دوازدهم")) return "دوازدهم";
  if (value.includes("یازدهم")) return "یازدهم";
  if (value.includes("دهم")) return "دهم";
  return null;
}

function publisherOf(value: string): string | null {
  return POOL_PUBLISHERS.find((publisher) => value.includes(publisher)) ?? null;
}

function scaleChapters(
  chapters: PoolChapterSeed[],
  unitType: string,
  targetTotal: number,
): ResourceChapter[] {
  if (chapters.length === 0) return [];
  const raw = chapters.map((chapter) => ({
    ...chapter,
    weight:
      unitType === "page"
        ? chapter.pages
        : unitType === "chapter"
          ? 1
          : unitType === "exercise"
            ? chapter.exercises
            : chapter.tests,
  }));
  const rawTotal = raw.reduce((sum, chapter) => sum + chapter.weight, 0);
  if (targetTotal <= 0 || rawTotal <= 0) {
    return chapters.map((chapter) => ({
      title: chapter.title,
      pages: chapter.pages,
      startPage: 1,
      endPage: chapter.pages,
      testCount: unitType === "exercise" ? 0 : chapter.tests,
      exerciseCount: chapter.exercises,
    }));
  }

  let assigned = 0;
  let cursor = 1;
  return raw.map((chapter, index) => {
    const isLast = index === raw.length - 1;
    const scaled = isLast
      ? Math.max(0, targetTotal - assigned)
      : Math.max(0, Math.round((chapter.weight / rawTotal) * targetTotal));
    assigned += scaled;
    const pages = unitType === "page" ? scaled : chapter.pages;
    const testCount = unitType === "test" ? scaled : unitType === "exercise" ? 0 : chapter.tests;
    const exerciseCount = unitType === "exercise" ? scaled : chapter.exercises;
    const result: ResourceChapter = {
      title: chapter.title,
      pages,
      startPage: pages > 0 ? cursor : 1,
      endPage: pages > 0 ? cursor + pages - 1 : 0,
      testCount,
      exerciseCount,
    };
    cursor += pages;
    return result;
  });
}

export async function backfillPersonalResourcesFromPool(workspaceId?: string): Promise<number> {
  const db = await getDb();
  const conditions = workspaceId ? [eq(resources.workspaceId, workspaceId)] : [];
  const personal = await db
    .select({
      id: resources.id,
      workspaceId: resources.workspaceId,
      subjectId: resources.subjectId,
      subjectTitle: subjects.title,
      title: resources.title,
      unitType: resources.unitType,
      totalUnits: resources.totalUnits,
      completedUnits: resources.completedUnits,
      chaptersJson: resources.chaptersJson,
    })
    .from(resources)
    .innerJoin(subjects, eq(resources.subjectId, subjects.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const defaultWorkspace = personal[0]?.workspaceId;
  const poolBooks = defaultWorkspace ? await listResourcePool(defaultWorkspace) : [];
  if (poolBooks.length === 0) return 0;

  const existing = await db
    .select({ resourceId: resourceChapters.resourceId })
    .from(resourceChapters)
    .where(inArray(resourceChapters.resourceId, personal.map((row) => row.id)));
  const hasChapters = new Set(existing.map((row) => row.resourceId));

  const bySubjectTitle = new Map<string, PoolBookView>();
  const bySubjectGradePublisher = new Map<string, PoolBookView>();
  const byTitle = new Map<string, PoolBookView[]>();
  for (const book of poolBooks) {
    bySubjectTitle.set(`${book.subjectId}|${normalize(book.title)}`, book);
    bySubjectGradePublisher.set(`${book.subjectId}|${book.grade}|${book.publisher}`, book);
    const key = normalize(book.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), book]);
  }

  let updated = 0;
  for (const row of personal) {
    if (hasChapters.has(row.id)) continue;
    if (row.chaptersJson?.length) continue;
    const grade = gradeOf(row.title);
    const publisher = publisherOf(row.title);
    let match: PoolBookView | undefined;
    if (grade && publisher) {
      match = bySubjectGradePublisher.get(`${row.subjectId}|${grade}|${publisher}`);
    }
    if (!match) {
      match = bySubjectTitle.get(`${row.subjectId}|${normalize(row.title)}`);
    }
    if (!match) {
      const candidates = byTitle.get(normalize(row.title)) ?? [];
      if (candidates.length === 1) match = candidates[0];
    }
    if (!match) continue;

    const chapters = scaleChapters(
      match.chapters.map((chapter) => ({
        title: chapter.title,
        tests: chapter.testCount,
        exercises: chapter.exerciseCount,
        pages: chapter.pages,
      })),
      row.unitType,
      row.totalUnits,
    );
    const chaptersJson: ResourceChapter[] = chapters;
    await db.update(resources).set({ chaptersJson }).where(eq(resources.id, row.id));
    const created = await ensureChaptersFromJson(db, {
      id: row.id,
      unitType: row.unitType as "test" | "exercise" | "page" | "chapter",
      totalUnits: row.totalUnits,
      completedUnits: row.completedUnits,
      chaptersJson,
    });
    if (created) updated += 1;
  }

  return updated;
}
