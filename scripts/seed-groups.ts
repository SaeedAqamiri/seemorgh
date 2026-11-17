import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { studentGroups, students, workspaces } from "../src/db/schema";
import { DEFAULT_GROUP_NAME, normalizeField } from "../src/lib/student-groups";
import { FIELD_LABELS } from "../src/lib/subjects";

const GROUP_SEED = [
  { name: "مدرسه علامه حلی", field: "تجربی", emoji: "🏫", color: "#2563eb" },
  { name: "مؤسسه مشاوره دکتر سعیدی", field: "ریاضی", emoji: "🎓", color: "#7c3aed" },
  { name: "دبیرستان فرزانگان", field: "تجربی", emoji: "⭐", color: "#be123c" },
];

async function main() {
  const db = await getDb();
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, "دفتر مشاوره نمونه"))
    .limit(1);
  if (!workspace) throw new Error("workspace missing; run `bun run db:seed` first");

  for (const group of GROUP_SEED) {
    await db
      .insert(studentGroups)
      .values({ workspaceId: workspace.id, ...group })
      .onConflictDoNothing();
    await db
      .update(studentGroups)
      .set({ field: group.field, emoji: group.emoji, color: group.color })
      .where(
        and(eq(studentGroups.workspaceId, workspace.id), eq(studentGroups.name, group.name)),
      );
  }

  const groups = await db
    .select()
    .from(studentGroups)
    .where(eq(studentGroups.workspaceId, workspace.id))
    .orderBy(asc(studentGroups.createdAt));

  const groupsByField = new Map<string, (typeof groups)[number][]>();
  for (const seed of GROUP_SEED) {
    const group = groups.find((row) => row.name === seed.name);
    if (!group) continue;
    const list = groupsByField.get(seed.field) ?? [];
    list.push(group);
    groupsByField.set(seed.field, list);
  }

  const studentRows = await db
    .select()
    .from(students)
    .where(and(eq(students.workspaceId, workspace.id), eq(students.status, "active")))
    .orderBy(asc(students.name));

  const assignedPerField = new Map<string, number>();
  let assigned = 0;
  for (const student of studentRows) {
    const field = normalizeField(student.field);
    const current = groups.find((group) => group.id === student.groupId);
    const keepCurrent =
      current && current.field === field && current.name !== DEFAULT_GROUP_NAME;
    if (keepCurrent) continue;

    const candidates = groupsByField.get(field) ?? [];
    if (candidates.length === 0) continue;
    const offset = assignedPerField.get(field) ?? 0;
    const target = candidates[offset % candidates.length];
    await db.update(students).set({ groupId: target.id }).where(eq(students.id, student.id));
    assignedPerField.set(field, offset + 1);
    assigned += 1;
  }

  const after = await db
    .select({ groupId: students.groupId })
    .from(students)
    .where(and(eq(students.workspaceId, workspace.id), eq(students.status, "active")));
  console.log(`assigned ${assigned} students across ${groups.length} groups`);
  for (const group of groups) {
    const members = after.filter((row) => row.groupId === group.id).length;
    console.log(`  ${group.name} (${FIELD_LABELS[group.field] ?? group.field}): ${members}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
