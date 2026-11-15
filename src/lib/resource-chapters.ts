import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  resourceChapters,
  resources,
  type ResourceChapter,
  type ResourceChapterRow,
} from "@/db/schema";

type DbExec = Pick<
  Awaited<ReturnType<typeof getDb>>,
  "select" | "insert" | "update" | "delete"
>;

export async function chaptersByResourceIds(
  db: DbExec,
  resourceIds: string[],
): Promise<Map<string, ResourceChapterRow[]>> {
  const map = new Map<string, ResourceChapterRow[]>();
  if (resourceIds.length === 0) return map;
  const rows = await db
    .select()
    .from(resourceChapters)
    .where(inArray(resourceChapters.resourceId, resourceIds))
    .orderBy(asc(resourceChapters.resourceId), asc(resourceChapters.sortIndex));
  for (const row of rows) {
    const list = map.get(row.resourceId) ?? [];
    list.push(row);
    map.set(row.resourceId, list);
  }
  return map;
}

export async function replaceResourceChapters(
  db: DbExec,
  resourceId: string,
  chapters: ResourceChapter[] | null,
): Promise<void> {
  const existing = await db
    .select()
    .from(resourceChapters)
    .where(eq(resourceChapters.resourceId, resourceId));
  const previousByTitle = new Map(existing.map((row) => [row.title, row]));

  await db.delete(resourceChapters).where(eq(resourceChapters.resourceId, resourceId));

  if (!chapters?.length) {
    await db.update(resources).set({ chaptersJson: null }).where(eq(resources.id, resourceId));
    return;
  }

  await db.insert(resourceChapters).values(
      chapters.map((chapter, index) => {
        const previous = previousByTitle.get(chapter.title);
        const testCount = Math.max(0, chapter.testCount ?? 0);
        const exerciseCount = Math.max(0, chapter.exerciseCount ?? 0);
        return {
          resourceId,
          title: chapter.title,
          sortIndex: index,
          pageStart: chapter.pages > 0 ? chapter.startPage : null,
          pageEnd: chapter.pages > 0 ? chapter.endPage : null,
          pages: Math.max(0, chapter.pages),
          completedPages: Math.min(Math.max(0, chapter.pages), previous?.completedPages ?? 0),
          testCount,
          completedTests: Math.min(testCount, previous?.completedTests ?? 0),
          exerciseCount,
          completedExercises: Math.min(exerciseCount, previous?.completedExercises ?? 0),
        };
      }),
    );

  await recomputeResourceTotals(db, resourceId);
}

export async function recomputeResourceTotals(db: DbExec, resourceId: string): Promise<void> {
  const [resource] = await db
    .select({ id: resources.id, unitType: resources.unitType })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  if (!resource) return;

  const rows = await db
    .select()
    .from(resourceChapters)
    .where(eq(resourceChapters.resourceId, resourceId))
    .orderBy(asc(resourceChapters.sortIndex));

  if (rows.length === 0) return;

  let totalUnits = 0;
  let completedUnits = 0;
  if (resource.unitType === "test") {
    totalUnits = rows.reduce((sum, row) => sum + row.testCount, 0);
    completedUnits = rows.reduce((sum, row) => sum + row.completedTests, 0);
  } else if (resource.unitType === "exercise") {
    totalUnits = rows.reduce((sum, row) => sum + row.exerciseCount, 0);
    completedUnits = rows.reduce((sum, row) => sum + row.completedExercises, 0);
  } else if (resource.unitType === "page") {
    totalUnits = rows.reduce((sum, row) => sum + row.pages, 0);
    completedUnits = rows.reduce((sum, row) => sum + row.completedPages, 0);
  } else {
    totalUnits = rows.length;
    completedUnits = rows.filter(
      (row) =>
        (row.testCount > 0 && row.completedTests >= row.testCount) ||
        (row.exerciseCount > 0 && row.completedExercises >= row.exerciseCount) ||
        (row.pages > 0 && row.completedPages >= row.pages),
    ).length;
  }

  const chaptersJson: ResourceChapter[] = rows.map((row) => ({
    title: row.title,
    pages: row.pages,
    startPage: row.pageStart ?? 1,
    endPage: row.pageEnd ?? row.pages,
    testCount: row.testCount,
    exerciseCount: row.exerciseCount,
  }));

  await db
    .update(resources)
    .set({
      totalUnits,
      completedUnits,
      chaptersJson,
    })
    .where(eq(resources.id, resourceId));
}

export type ActionDelta = {
  resourceId: string;
  chapterId: string | null;
  kind: "test" | "exercise";
  delta: number;
};

export async function applyActionDeltas(db: DbExec, deltas: ActionDelta[]): Promise<void> {
  const touched = new Set<string>();
  for (const delta of deltas) {
    if (!delta.resourceId || delta.delta === 0) continue;
    if (delta.chapterId) {
      if (delta.kind === "test") {
        await db
          .update(resourceChapters)
          .set({
            completedTests: sql`least(greatest(${resourceChapters.testCount}, 0), greatest(0, ${resourceChapters.completedTests} + ${delta.delta}))`,
          })
          .where(eq(resourceChapters.id, delta.chapterId));
      } else {
        await db
          .update(resourceChapters)
          .set({
            completedExercises: sql`least(greatest(${resourceChapters.exerciseCount}, 0), greatest(0, ${resourceChapters.completedExercises} + ${delta.delta}))`,
          })
          .where(eq(resourceChapters.id, delta.chapterId));
      }
      touched.add(delta.resourceId);
    } else if (delta.kind === "test" || delta.kind === "exercise") {
      await db
        .update(resources)
        .set({
          completedUnits: sql`least(greatest(${resources.totalUnits}, 0), greatest(0, ${resources.completedUnits} + ${delta.delta}))`,
        })
        .where(eq(resources.id, delta.resourceId));
    }
  }

  for (const resourceId of touched) {
    await recomputeResourceTotals(db, resourceId);
  }
}

export type LegacyChapterResource = {
  id: string;
  unitType: "test" | "exercise" | "page" | "chapter";
  totalUnits: number;
  completedUnits: number;
  chaptersJson: ResourceChapter[] | null;
};

export async function ensureChaptersFromJson(
  db: DbExec,
  resource: LegacyChapterResource,
): Promise<boolean> {
  if (!resource.chaptersJson?.length) return false;
  const existing = await db
    .select({ id: resourceChapters.id })
    .from(resourceChapters)
    .where(eq(resourceChapters.resourceId, resource.id))
    .limit(1);
  if (existing.length > 0) return false;

  let remainingCompleted = Math.max(0, resource.completedUnits);
  const rows = resource.chaptersJson.map((chapter, index) => {
    const pages = Math.max(0, chapter.pages);
    const isExercise = resource.unitType === "exercise";
    const testCount =
      resource.unitType === "test" ? Math.max(0, chapter.testCount ?? pages) : Math.max(0, chapter.testCount ?? 0);
    const exerciseSeed = Math.max(
      0,
      (chapter.exerciseCount ?? 0) + (chapter.testCount ?? 0),
    );
    const exerciseCount = isExercise
      ? exerciseSeed > 0
        ? exerciseSeed
        : Math.max(0, pages)
      : Math.max(0, chapter.exerciseCount ?? 0);
    const completedPages = resource.unitType === "page" ? Math.min(pages, remainingCompleted) : 0;
    const completedTests = resource.unitType === "test" ? Math.min(testCount, remainingCompleted) : 0;
    const completedExercises = isExercise
      ? Math.min(exerciseCount, remainingCompleted)
      : 0;
    remainingCompleted -=
      resource.unitType === "page"
        ? completedPages
        : resource.unitType === "exercise"
          ? completedExercises
          : completedTests;
    return {
      resourceId: resource.id,
      title: chapter.title,
      sortIndex: index,
      pageStart: pages > 0 ? chapter.startPage : null,
      pageEnd: pages > 0 ? chapter.endPage : null,
      pages,
      completedPages,
      testCount,
      completedTests,
      exerciseCount,
      completedExercises,
    };
  });

  if (rows.length === 0) return false;
  await db.insert(resourceChapters).values(rows);
  await db
    .update(resources)
    .set({
      chaptersJson: rows.map((row) => ({
        title: row.title,
        pages: row.pages,
        startPage: row.pageStart ?? 1,
        endPage: row.pageEnd ?? row.pages,
        testCount: row.testCount,
        exerciseCount: row.exerciseCount,
      })),
    })
    .where(eq(resources.id, resource.id));
  return true;
}
