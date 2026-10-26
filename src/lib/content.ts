import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contentItems, resources, students, subjects } from "@/db/schema";

export type ContentItemView = {
  id: string;
  title: string;
  kind: "video" | "text" | "psychology";
  url: string | null;
  body: string;
  subjectTitle: string | null;
  resourceId: string | null;
  resourceTitle: string | null;
  studentName: string | null;
  createdAt: Date;
};


export async function listWorkspaceContent(workspaceId: string): Promise<ContentItemView[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      kind: contentItems.kind,
      url: contentItems.url,
      body: contentItems.body,
      subjectTitle: subjects.title,
      resourceId: contentItems.resourceId,
      resourceTitle: resources.title,
      studentName: students.name,
      createdAt: contentItems.createdAt,
    })
    .from(contentItems)
    .leftJoin(subjects, eq(contentItems.subjectId, subjects.id))
    .leftJoin(resources, eq(contentItems.resourceId, resources.id))
    .leftJoin(students, eq(resources.studentId, students.id))
    .where(and(eq(contentItems.workspaceId, workspaceId), eq(contentItems.status, "active")))
    .orderBy(desc(contentItems.createdAt));

  return rows;
}

export async function listStudentContent(
  workspaceId: string,
  studentId: string,
): Promise<ContentItemView[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      kind: contentItems.kind,
      url: contentItems.url,
      body: contentItems.body,
      subjectTitle: subjects.title,
      resourceId: contentItems.resourceId,
      resourceTitle: resources.title,
      studentName: students.name,
      createdAt: contentItems.createdAt,
    })
    .from(contentItems)
    .leftJoin(subjects, eq(contentItems.subjectId, subjects.id))
    .leftJoin(resources, eq(contentItems.resourceId, resources.id))
    .leftJoin(students, eq(resources.studentId, students.id))
    .where(
      and(
        eq(contentItems.workspaceId, workspaceId),
        eq(contentItems.status, "active"),
        or(isNull(contentItems.resourceId), eq(resources.studentId, studentId)),
      ),
    )
    .orderBy(desc(contentItems.createdAt));

  return rows;
}

export async function contentForResources(resourceIds: string[]): Promise<ContentItemView[]> {
  if (resourceIds.length === 0) return [];
  const db = await getDb();
  return db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      kind: contentItems.kind,
      url: contentItems.url,
      body: contentItems.body,
      subjectTitle: subjects.title,
      resourceId: contentItems.resourceId,
      resourceTitle: resources.title,
      studentName: students.name,
      createdAt: contentItems.createdAt,
    })
    .from(contentItems)
    .leftJoin(subjects, eq(contentItems.subjectId, subjects.id))
    .leftJoin(resources, eq(contentItems.resourceId, resources.id))
    .leftJoin(students, eq(resources.studentId, students.id))
    .where(
      and(
        eq(contentItems.status, "active"),
        inArray(contentItems.resourceId, resourceIds),
      ),
    )
    .orderBy(desc(contentItems.createdAt));
}

export async function listResourceOptions(workspaceId: string) {
  const db = await getDb();
  return db
    .select({
      id: resources.id,
      title: resources.title,
      unitType: resources.unitType,
      studentName: students.name,
      subjectTitle: subjects.title,
    })
    .from(resources)
    .innerJoin(students, eq(resources.studentId, students.id))
    .innerJoin(subjects, eq(resources.subjectId, subjects.id))
    .where(eq(resources.workspaceId, workspaceId))
    .orderBy(students.name, sql`${resources.title}`);
}
