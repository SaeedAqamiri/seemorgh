import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { subjects, type Subject } from "@/db/schema";
import { catalogItemFor, SUBJECT_CATALOG } from "./subjects";

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
