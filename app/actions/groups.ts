"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { studentGroups, students } from "@/db/schema";
import { requireCounselor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_GROUP_NAME,
  ensureStudentGroups,
  nextGroupPalette,
  normalizeField,
} from "@/lib/student-groups";
import { saveGroupMockExamPlan } from "@/lib/mock-exams";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

const GROUPS_PATH = "/counselor/groups";

function fail(message: string): never {
  redirect(`${GROUPS_PATH}?error=${encodeURIComponent(message)}`);
}

function revalidateGroupViews() {
  revalidatePath(GROUPS_PATH);
  revalidatePath("/counselor");
  revalidatePath("/counselor/leaderboard");
}

export async function createGroupAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const name = field(formData, "name").slice(0, 120);
  const groupField = normalizeField(field(formData, "field"));
  const emoji = field(formData, "emoji").slice(0, 8) || undefined;
  const color = /^#[0-9a-fA-F]{6}$/.test(field(formData, "color"))
    ? field(formData, "color")
    : undefined;

  if (name.length < 2) fail("نام گروه باید دست‌کم دو حرف باشد.");

  await ensureStudentGroups(counselor.workspaceId);
  const db = await getDb();
  const palette = await nextGroupPalette(counselor.workspaceId);
  const [created] = await db
    .insert(studentGroups)
    .values({
      workspaceId: counselor.workspaceId,
      name,
      field: groupField,
      emoji: emoji ?? palette.emoji,
      color: color ?? palette.color,
    })
    .onConflictDoNothing()
    .returning({ id: studentGroups.id });

  if (!created) fail("گروهی با این نام از قبل وجود دارد.");

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "group.create",
    entity: "student_group",
    entityId: created.id,
  });

  revalidateGroupViews();
  redirect(`${GROUPS_PATH}?success=created`);
}

export async function updateGroupAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const groupId = field(formData, "groupId");
  const name = field(formData, "name").slice(0, 120);
  const emoji = field(formData, "emoji").slice(0, 8) || "🏫";
  const color = /^#[0-9a-fA-F]{6}$/.test(field(formData, "color"))
    ? field(formData, "color")
    : "#1f6f4a";

  if (!groupId) fail("گروه انتخاب نشده است.");
  if (name.length < 2) fail("نام گروه باید دست‌کم دو حرف باشد.");

  const db = await getDb();
  const [existing] = await db
    .select({ id: studentGroups.id })
    .from(studentGroups)
    .where(
      and(eq(studentGroups.id, groupId), eq(studentGroups.workspaceId, counselor.workspaceId)),
    )
    .limit(1);
  if (!existing) fail("گروه پیدا نشد.");

  const [duplicate] = await db
    .select({ id: studentGroups.id })
    .from(studentGroups)
    .where(
      and(eq(studentGroups.workspaceId, counselor.workspaceId), eq(studentGroups.name, name)),
    )
    .limit(1);
  if (duplicate && duplicate.id !== groupId) fail("گروه دیگری با این نام وجود دارد.");

  await db
    .update(studentGroups)
    .set({ name, emoji, color })
    .where(
      and(eq(studentGroups.id, groupId), eq(studentGroups.workspaceId, counselor.workspaceId)),
    );

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "group.update",
    entity: "student_group",
    entityId: groupId,
  });

  revalidateGroupViews();
  redirect(`${GROUPS_PATH}?success=updated`);
}

export async function saveGroupMockExamsAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const groupId = field(formData, "groupId");
  if (!groupId) fail("گروه انتخاب نشده است.");
  const ids = formData.getAll("mockExamId").map((value) => String(value));
  await saveGroupMockExamPlan(counselor.workspaceId, groupId, ids);
  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "group.mock_exams.save",
    entity: "student_group",
    entityId: groupId,
    diff: { exams: ids.length },
  });
  revalidateGroupViews();
  revalidatePath("/counselor/students");
  redirect(`${GROUPS_PATH}?success=updated`);
}

export async function deleteGroupAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const groupId = field(formData, "groupId");
  if (!groupId) fail("گروه انتخاب نشده است.");

  const db = await getDb();
  const [existing] = await db
    .select({ id: studentGroups.id, name: studentGroups.name })
    .from(studentGroups)
    .where(
      and(eq(studentGroups.id, groupId), eq(studentGroups.workspaceId, counselor.workspaceId)),
    )
    .limit(1);
  if (!existing) fail("گروه پیدا نشد.");

  const groups = await ensureStudentGroups(counselor.workspaceId);
  const fallback =
    groups.find((group) => group.id !== groupId && group.name === DEFAULT_GROUP_NAME) ??
    groups.find((group) => group.id !== groupId);

  if (!fallback) fail("تنها گروه دفتر را نمی‌توان حذف کرد.");

  const [memberRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(students)
    .where(and(eq(students.workspaceId, counselor.workspaceId), eq(students.groupId, groupId)))
    .limit(1);
  const reassigned = memberRow?.total ?? 0;

  await db
    .update(students)
    .set({ groupId: fallback.id })
    .where(and(eq(students.workspaceId, counselor.workspaceId), eq(students.groupId, groupId)));

  await db
    .delete(studentGroups)
    .where(
      and(eq(studentGroups.id, groupId), eq(studentGroups.workspaceId, counselor.workspaceId)),
    );

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "group.delete",
    entity: "student_group",
    entityId: groupId,
    diff: { reassignedTo: fallback.name, students: reassigned },
  });

  revalidateGroupViews();
  redirect(`${GROUPS_PATH}?success=deleted&moved=${reassigned}`);
}
