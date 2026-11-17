import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { studentGroups, students } from "@/db/schema";
import { FIELDS } from "./subjects";

export const DEFAULT_GROUP_NAME = "گروه اصلی";

export const GROUP_EMOJIS = ["🏫", "🎓", "🦅", "🚀", "⭐", "🧠", "🏆", "📚", "🔥", "🎯"] as const;

export const GROUP_COLORS = [
  "#1f6f4a",
  "#2563eb",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0e7490",
  "#4d7c0f",
  "#9333ea",
  "#c2410c",
  "#0f766e",
] as const;

export type StudentGroup = typeof studentGroups.$inferSelect;

export type StudentGroupWithCount = StudentGroup & { memberCount: number };

export class GroupFieldMismatchError extends Error {}

export function normalizeField(value: unknown): string {
  const text = String(value ?? "").trim();
  return (FIELDS as readonly string[]).includes(text) ? text : "تجربی";
}

export function groupPaletteFor(index: number): { emoji: string; color: string } {
  return {
    emoji: GROUP_EMOJIS[index % GROUP_EMOJIS.length],
    color: GROUP_COLORS[index % GROUP_COLORS.length],
  };
}

function groupNameForField(field: string): string {
  return `گروه ${field}`;
}

async function insertGroup(
  workspaceId: string,
  values: { name: string; field: string; emoji?: string; color?: string },
): Promise<StudentGroup | null> {
  const db = await getDb();
  const [row] = await db
    .insert(studentGroups)
    .values({ workspaceId, ...values })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(studentGroups)
    .where(
      and(eq(studentGroups.workspaceId, workspaceId), eq(studentGroups.name, values.name)),
    )
    .limit(1);
  return existing ?? null;
}

/**
 * Guarantees the group invariant: every student belongs to exactly one group,
 * and every member of a group shares the same field (رشته). Groups (and members)
 * that predate this rule are repaired lazily, only when a mismatch is detected.
 */
export async function ensureStudentGroups(workspaceId: string): Promise<StudentGroup[]> {
  const db = await getDb();
  let groups = await db
    .select()
    .from(studentGroups)
    .where(eq(studentGroups.workspaceId, workspaceId))
    .orderBy(asc(studentGroups.createdAt), asc(studentGroups.name));

  const studentRows = await db
    .select({ id: students.id, field: students.field, groupId: students.groupId })
    .from(students)
    .where(eq(students.workspaceId, workspaceId));

  if (groups.length === 0) {
    const firstField = normalizeField(studentRows[0]?.field);
    const palette = groupPaletteFor(0);
    const created = await insertGroup(workspaceId, {
      name: DEFAULT_GROUP_NAME,
      field: firstField,
      emoji: palette.emoji,
      color: palette.color,
    });
    if (created) groups = [created];
  }

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const needRepair = studentRows.some((student) => {
    const group = student.groupId ? groupById.get(student.groupId) : undefined;
    return !group || normalizeField(student.field) !== group.field;
  });
  if (!needRepair) return groups;

  const groupsByField = new Map<string, StudentGroup[]>();
  for (const group of groups) {
    const list = groupsByField.get(group.field) ?? [];
    list.push(group);
    groupsByField.set(group.field, list);
  }

  for (const student of studentRows) {
    const field = normalizeField(student.field);
    const current = student.groupId ? groupById.get(student.groupId) : undefined;
    if (current && current.field === field) continue;

    let target = groupsByField.get(field)?.[0];
    if (!target) {
      const palette = groupPaletteFor(groups.length);
      target =
        (await insertGroup(workspaceId, {
          name: groupNameForField(field),
          field,
          emoji: palette.emoji,
          color: palette.color,
        })) ?? undefined;
    }
    if (!target) continue;

    await db.update(students).set({ groupId: target.id }).where(eq(students.id, student.id));
    if (!groups.some((group) => group.id === target!.id)) {
      groups.push(target);
      groupById.set(target.id, target);
      const list = groupsByField.get(field) ?? [];
      list.push(target);
      groupsByField.set(field, list);
    }
  }

  return groups;
}

export async function listStudentGroups(workspaceId: string): Promise<StudentGroupWithCount[]> {
  await ensureStudentGroups(workspaceId);
  const db = await getDb();
  const rows = await db
    .select({
      group: studentGroups,
      memberCount: sql<number>`count(${students.id}) filter (where ${students.status} = 'active')::int`,
    })
    .from(studentGroups)
    .leftJoin(students, eq(students.groupId, studentGroups.id))
    .where(eq(studentGroups.workspaceId, workspaceId))
    .groupBy(studentGroups.id)
    .orderBy(asc(studentGroups.createdAt), asc(studentGroups.name));
  return rows.map((row) => ({ ...row.group, memberCount: row.memberCount }));
}

export async function getGroupForStudent(
  workspaceId: string,
  studentId: string,
): Promise<StudentGroup | null> {
  await ensureStudentGroups(workspaceId);
  const db = await getDb();
  const [row] = await db
    .select({ group: studentGroups })
    .from(students)
    .innerJoin(studentGroups, eq(students.groupId, studentGroups.id))
    .where(and(eq(students.workspaceId, workspaceId), eq(students.id, studentId)))
    .limit(1);
  return row?.group ?? null;
}

export async function nextGroupPalette(workspaceId: string): Promise<{ emoji: string; color: string }> {
  const db = await getDb();
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(studentGroups)
    .where(eq(studentGroups.workspaceId, workspaceId));
  return groupPaletteFor(row?.total ?? 0);
}

/**
 * Resolves the group chosen in a student form. The group must match the
 * student's field; a new group inherits that field. If no group exists for the
 * field yet, a default one is created.
 */
export async function resolveGroupForForm(
  workspaceId: string,
  groupId: string,
  newGroupName: string,
  fieldInput: unknown,
): Promise<StudentGroup> {
  const field = normalizeField(fieldInput);
  await ensureStudentGroups(workspaceId);
  const db = await getDb();
  const name = newGroupName.trim().slice(0, 120);

  if (name) {
    const palette = await nextGroupPalette(workspaceId);
    const [inserted] = await db
      .insert(studentGroups)
      .values({ workspaceId, name, field, emoji: palette.emoji, color: palette.color })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;
    const [existing] = await db
      .select()
      .from(studentGroups)
      .where(and(eq(studentGroups.workspaceId, workspaceId), eq(studentGroups.name, name)))
      .limit(1);
    if (existing && existing.field !== field) {
      throw new GroupFieldMismatchError(
        `گروه «${name}» قبلاً برای رشته ${existing.field} ساخته شده است.`,
      );
    }
    if (existing) return existing;
  }

  if (groupId) {
    const [existing] = await db
      .select()
      .from(studentGroups)
      .where(and(eq(studentGroups.workspaceId, workspaceId), eq(studentGroups.id, groupId)))
      .limit(1);
    if (existing) {
      if (existing.field !== field) {
        throw new GroupFieldMismatchError(
          `گروه «${existing.name}» برای رشته ${existing.field} است و با رشته ${field} هم‌خوان نیست.`,
        );
      }
      return existing;
    }
  }

  const [sameField] = await db
    .select()
    .from(studentGroups)
    .where(and(eq(studentGroups.workspaceId, workspaceId), eq(studentGroups.field, field)))
    .orderBy(asc(studentGroups.createdAt))
    .limit(1);
  if (sameField) return sameField;

  const palette = await nextGroupPalette(workspaceId);
  const created = await insertGroup(workspaceId, {
    name: groupNameForField(field),
    field,
    emoji: palette.emoji,
    color: palette.color,
  });
  if (!created) throw new Error("گروهی برای این رشته ساخته نشد.");
  return created;
}
