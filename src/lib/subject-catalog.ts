import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  resourceChapters,
  resourcePool,
  resourcePoolChapters,
  resources,
  subjects,
  type Subject,
} from "@/db/schema";
import { recomputeResourceTotals } from "./resource-chapters";
import { catalogItemFor, SUBJECT_CATALOG } from "./subjects";

const normalizedWorkspaces = new Set<string>();

/**
 * General subjects only have exercises in their help books. This normalizes any
 * existing test-based data by folding test counts into exercise counts, then
 * switches the resource/pool unit type to exercise so progress is measured by
 * solved exercises.
 */
export async function normalizeGeneralSubjectResources(
  workspaceId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (!options.force && normalizedWorkspaces.has(workspaceId)) return;

  const db = await getDb();
  const generalSubjectRows = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.workspaceId, workspaceId), eq(subjects.kind, "general")));
  const generalSubjectIds = generalSubjectRows.map((row) => row.id);

  if (generalSubjectIds.length > 0) {
    const resourceRows = await db
      .select({
        id: resources.id,
        title: resources.title,
        completedUnits: resources.completedUnits,
      })
      .from(resources)
      .where(
        and(
          eq(resources.workspaceId, workspaceId),
          inArray(resources.subjectId, generalSubjectIds),
        ),
      );

    for (const resource of resourceRows) {
      const chapters = await db
        .select()
        .from(resourceChapters)
        .where(eq(resourceChapters.resourceId, resource.id));
      let touched = false;
      for (const chapter of chapters) {
        let changed = false;
        let testCount = chapter.testCount;
        let completedTests = chapter.completedTests;
        let exerciseCount = chapter.exerciseCount;
        let completedExercises = chapter.completedExercises;
        let pages = chapter.pages;
        let completedPages = chapter.completedPages;

        if (testCount > 0 || completedTests > 0) {
          exerciseCount += testCount;
          completedExercises += completedTests;
          testCount = 0;
          completedTests = 0;
          changed = true;
        }

        // Legacy page-based general resources become exercise-based so progress
        // keeps its meaning without exposing page counts.
        if (exerciseCount === 0 && pages > 0) {
          exerciseCount = pages;
          completedExercises = completedPages;
          pages = 0;
          completedPages = 0;
          changed = true;
        }

        if (!changed) continue;
        touched = true;
        await db
          .update(resourceChapters)
          .set({
            exerciseCount,
            completedExercises: Math.min(exerciseCount, completedExercises),
            testCount,
            completedTests: Math.min(testCount, completedTests),
            pages,
            completedPages: Math.min(pages, completedPages),
          })
          .where(eq(resourceChapters.id, chapter.id));
      }
      // Legacy page resources may only carry progress at the resource level;
      // spread it over chapters before the exercise-based recompute overwrites it.
      if (resource.completedUnits > 0) {
        const updated = await db
          .select()
          .from(resourceChapters)
          .where(eq(resourceChapters.resourceId, resource.id))
          .orderBy(asc(resourceChapters.sortIndex));
        const totalExercises = updated.reduce((sum, chapter) => sum + chapter.exerciseCount, 0);
        let remaining =
          Math.min(resource.completedUnits, totalExercises) -
          updated.reduce((sum, chapter) => sum + chapter.completedExercises, 0);
        for (const chapter of updated) {
          if (remaining <= 0) break;
          const add = Math.min(remaining, chapter.exerciseCount - chapter.completedExercises);
          if (add > 0) {
            await db
              .update(resourceChapters)
              .set({ completedExercises: chapter.completedExercises + add })
              .where(eq(resourceChapters.id, chapter.id));
            remaining -= add;
            touched = true;
          }
        }
      }

      const cleanedTitle = resource.title
        .replace(/\s*[—–-]\s*صفحه\s*$/u, "")
        .trim();
      await db
        .update(resources)
        .set({
          unitType: "exercise",
          ...(cleanedTitle && cleanedTitle !== resource.title ? { title: cleanedTitle } : {}),
        })
        .where(eq(resources.id, resource.id));
      if (touched) await recomputeResourceTotals(db, resource.id);
    }

    const poolRows = await db
      .select({ id: resourcePool.id })
      .from(resourcePool)
      .where(
        and(
          eq(resourcePool.workspaceId, workspaceId),
          inArray(resourcePool.subjectId, generalSubjectIds),
        ),
      );

    for (const book of poolRows) {
      const chapters = await db
        .select()
        .from(resourcePoolChapters)
        .where(eq(resourcePoolChapters.poolId, book.id));
      let totalUnits = 0;
      for (const chapter of chapters) {
        const merged = chapter.exerciseCount + chapter.testCount;
        const exerciseCount =
          merged > 0 ? merged : chapter.pages > 0 ? chapter.pages : 0;
        if (chapter.testCount > 0 || (merged === 0 && chapter.pages > 0)) {
          await db
            .update(resourcePoolChapters)
            .set({ exerciseCount, testCount: 0 })
            .where(eq(resourcePoolChapters.id, chapter.id));
        }
        totalUnits += exerciseCount;
      }
      await db
        .update(resourcePool)
        .set({
          unitType: "exercise",
          ...(chapters.length > 0 ? { totalUnits } : {}),
        })
        .where(eq(resourcePool.id, book.id));
    }
  }

  normalizedWorkspaces.add(workspaceId);
}

export async function ensureSubjectCatalog(workspaceId: string): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ title: subjects.title })
    .from(subjects)
    .where(eq(subjects.workspaceId, workspaceId));
  const known = new Set(existing.map((row) => row.title));

  const missing = SUBJECT_CATALOG.filter((item) => !known.has(item.title));
  if (missing.length > 0) {
    await db
      .insert(subjects)
      .values(
        missing.map((item) => ({
          workspaceId,
          title: item.title,
          kind: item.kind,
          fieldsJson: [...item.fields],
          color: item.color,
        })),
      )
      .onConflictDoNothing();
  }

  for (const item of SUBJECT_CATALOG) {
    await db
      .update(subjects)
      .set({
        kind: item.kind,
        fieldsJson: [...item.fields],
        color: item.color,
      })
      .where(and(eq(subjects.workspaceId, workspaceId), eq(subjects.title, item.title)));
  }

  await normalizeGeneralSubjectResources(workspaceId);
}

export type SubjectOption = Pick<Subject, "id" | "title" | "kind" | "color" | "fieldsJson">;

export async function listSubjectsForField(
  workspaceId: string,
  field: string,
): Promise<SubjectOption[]> {
  await ensureSubjectCatalog(workspaceId);
  const db = await getDb();
  const rows = await db
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

  return rows.filter((row) => {
    const fields = row.fieldsJson ?? catalogItemFor(row.title)?.fields;
    if (!fields || fields.length === 0) return true;
    return fields.includes(field);
  });
}

export async function listAllWorkspaceSubjects(workspaceId: string): Promise<SubjectOption[]> {
  await ensureSubjectCatalog(workspaceId);
  const db = await getDb();
  return db
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
}

export function subjectColor(subject: { color?: string | null; title?: string } | undefined): string {
  return subject?.color || (subject?.title ? catalogItemFor(subject.title)?.color : undefined) || "#1f6f4a";
}
