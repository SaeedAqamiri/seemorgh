import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  externalExams,
  groupMockExams,
  mockExamPrograms,
  studentGroups,
  studentMockExams,
  students,
  type MockExamProgram,
} from "@/db/schema";
import { todayISO } from "./dates";
import {
  MOCK_EXAM_CATALOG,
  groupProviderRotation,
  type MockExamProvider,
} from "./mock-exam-catalog";

const catalogWorkspaces = new Set<string>();

export async function ensureMockExamCatalog(workspaceId: string): Promise<void> {
  if (catalogWorkspaces.has(workspaceId)) return;
  const db = await getDb();
  const existing = await db
    .select({ provider: mockExamPrograms.provider, title: mockExamPrograms.title, field: mockExamPrograms.field, examDate: mockExamPrograms.examDate })
    .from(mockExamPrograms)
    .where(eq(mockExamPrograms.workspaceId, workspaceId));
  const known = new Set(existing.map((row) => `${row.provider}|${row.title}|${row.field}|${row.examDate}`));
  const missing = MOCK_EXAM_CATALOG.filter(
    (entry) => !known.has(`${entry.provider}|${entry.title}|${entry.field}|${entry.examDate}`),
  );
  if (missing.length > 0) {
    await db
      .insert(mockExamPrograms)
      .values(
        missing.map((entry) => ({
          workspaceId,
          provider: entry.provider,
          title: entry.title,
          field: entry.field,
          grade: entry.grade,
          examDate: entry.examDate,
          examType: entry.examType,
          startMin: entry.startMin,
          durationMinutes: entry.durationMinutes,
          analysisMinutes: entry.analysisMinutes,
          budgetJson: entry.budget,
          source: entry.source,
          sourceUrl: entry.sourceUrl,
        })),
      )
      .onConflictDoNothing();
  }
  catalogWorkspaces.add(workspaceId);
}

export async function listMockExamPrograms(
  workspaceId: string,
  options: { field?: string; fromDate?: string; includePast?: boolean } = {},
): Promise<MockExamProgram[]> {
  await ensureMockExamCatalog(workspaceId);
  const db = await getDb();
  const conditions = [eq(mockExamPrograms.workspaceId, workspaceId)];
  if (options.field) conditions.push(eq(mockExamPrograms.field, options.field));
  if (!options.includePast) conditions.push(gte(mockExamPrograms.examDate, options.fromDate ?? todayISO()));
  return db
    .select()
    .from(mockExamPrograms)
    .where(and(...conditions))
    .orderBy(asc(mockExamPrograms.examDate), asc(mockExamPrograms.provider));
}

export type StudentMockExamRow = {
  program: MockExamProgram;
  status: string;
  source: string;
  resultExamId: string | null;
};

export async function listStudentMockExams(studentId: string): Promise<StudentMockExamRow[]> {
  const db = await getDb();
  const rows = await db
    .select({ program: mockExamPrograms, status: studentMockExams.status, source: studentMockExams.source, resultExamId: studentMockExams.resultExamId })
    .from(studentMockExams)
    .innerJoin(mockExamPrograms, eq(studentMockExams.mockExamId, mockExamPrograms.id))
    .where(eq(studentMockExams.studentId, studentId))
    .orderBy(asc(mockExamPrograms.examDate));
  return rows;
}

export async function ensureGroupMockExamPlan(
  workspaceId: string,
  groupId: string,
): Promise<MockExamProgram[]> {
  const db = await getDb();
  await ensureMockExamCatalog(workspaceId);
  const [group] = await db
    .select()
    .from(studentGroups)
    .where(and(eq(studentGroups.workspaceId, workspaceId), eq(studentGroups.id, groupId)))
    .limit(1);
  if (!group) return [];

  const existing = await db
    .select({ program: mockExamPrograms })
    .from(groupMockExams)
    .innerJoin(mockExamPrograms, eq(groupMockExams.mockExamId, mockExamPrograms.id))
    .where(eq(groupMockExams.groupId, groupId))
    .orderBy(asc(mockExamPrograms.examDate));

  if (existing.length > 0) {
    const programs = existing.map((row) => row.program);
    const members = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.groupId, groupId), eq(students.status, "active")));
    if (members.length > 0) {
      const memberIds = members.map((member) => member.id);
      const existingSelections = await db
        .select({ studentId: studentMockExams.studentId })
        .from(studentMockExams)
        .where(inArray(studentMockExams.studentId, memberIds));
      const hasSelection = new Set(existingSelections.map((row) => row.studentId));
      const fresh = members.filter((member) => !hasSelection.has(member.id));
      if (fresh.length > 0) {
        await db
          .insert(studentMockExams)
          .values(
            fresh.flatMap((member) =>
              programs.map((program) => ({
                studentId: member.id,
                mockExamId: program.id,
                status: "selected" as const,
                source: "group" as const,
              })),
            ),
          )
          .onConflictDoNothing();
      }
    }
    return programs;
  }

  const groups = await db
    .select({ id: studentGroups.id })
    .from(studentGroups)
    .where(eq(studentGroups.workspaceId, workspaceId))
    .orderBy(asc(studentGroups.createdAt));
  const index = Math.max(0, groups.findIndex((row) => row.id === groupId));
  const providers = groupProviderRotation(group.field, index);
  const allPrograms = await listMockExamPrograms(workspaceId, {
    field: group.field,
    includePast: true,
  });
  const today = todayISO();
  const chosen: MockExamProgram[] = [];
  providers.forEach((provider, providerIndex) => {
    const rows = allPrograms.filter((row) => row.provider === provider);
    const past = rows.filter((row) => row.examDate < today).slice(-1);
    const future = rows.filter((row) => row.examDate >= today).slice(0, providerIndex === 0 ? 4 : 3);
    chosen.push(...past, ...future);
  });
  const unique = [...new Map(chosen.map((row) => [row.id, row])).values()].sort((a, b) => a.examDate.localeCompare(b.examDate));

  if (unique.length > 0) {
    await db
      .insert(groupMockExams)
      .values(unique.map((program) => ({ groupId, mockExamId: program.id })))
      .onConflictDoNothing();
  }

  const members = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.groupId, groupId), eq(students.status, "active")));
  if (unique.length > 0 && members.length > 0) {
    await db
      .insert(studentMockExams)
      .values(
        members.flatMap((member) =>
          unique.map((program) => ({
            studentId: member.id,
            mockExamId: program.id,
            status: "selected" as const,
            source: "group" as const,
          })),
        ),
      )
      .onConflictDoNothing();
  }

  return unique;
}

export async function saveGroupMockExamPlan(
  workspaceId: string,
  groupId: string,
  mockExamIds: string[],
): Promise<void> {
  const db = await getDb();
  const [group] = await db
    .select({ id: studentGroups.id })
    .from(studentGroups)
    .where(and(eq(studentGroups.workspaceId, workspaceId), eq(studentGroups.id, groupId)))
    .limit(1);
  if (!group) return;
  const valid = mockExamIds.length
    ? await db
        .select({ id: mockExamPrograms.id })
        .from(mockExamPrograms)
        .where(and(eq(mockExamPrograms.workspaceId, workspaceId), inArray(mockExamPrograms.id, mockExamIds)))
    : [];
  const validIds = valid.map((row) => row.id);
  await db.transaction(async (tx) => {
    await tx.delete(groupMockExams).where(eq(groupMockExams.groupId, groupId));
    if (validIds.length > 0) {
      await tx.insert(groupMockExams).values(validIds.map((mockExamId) => ({ groupId, mockExamId })));
    }
    const members = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.groupId, groupId), eq(students.status, "active")));
    for (const member of members) {
      await tx.delete(studentMockExams).where(and(eq(studentMockExams.studentId, member.id), eq(studentMockExams.source, "group")));
    }
    if (validIds.length > 0 && members.length > 0) {
      await tx
        .insert(studentMockExams)
        .values(
          members.flatMap((member) =>
            validIds.map((mockExamId) => ({
              studentId: member.id,
              mockExamId,
              status: "selected" as const,
              source: "group" as const,
            })),
          ),
        )
        .onConflictDoNothing();
    }
  });
}

export async function saveStudentMockExamSelection(studentId: string, mockExamIds: string[]): Promise<void> {
  const db = await getDb();
  await db.delete(studentMockExams).where(eq(studentMockExams.studentId, studentId));
  if (mockExamIds.length === 0) return;
  const valid = await db
    .select({ id: mockExamPrograms.id })
    .from(mockExamPrograms)
    .where(inArray(mockExamPrograms.id, mockExamIds));
  if (valid.length === 0) return;
  await db
    .insert(studentMockExams)
    .values(
      valid.map((row) => ({
        studentId,
        mockExamId: row.id,
        status: "selected" as const,
        source: "manual" as const,
      })),
    )
    .onConflictDoUpdate({
      target: [studentMockExams.studentId, studentMockExams.mockExamId],
      set: { source: "manual", status: "selected" },
    });
}

export async function latestSelectedExam(studentId: string): Promise<MockExamProgram | null> {
  const db = await getDb();
  const [row] = await db
    .select({ program: mockExamPrograms })
    .from(studentMockExams)
    .innerJoin(mockExamPrograms, eq(studentMockExams.mockExamId, mockExamPrograms.id))
    .where(and(eq(studentMockExams.studentId, studentId), inArray(studentMockExams.status, ["selected", "registered"])))
    .orderBy(desc(mockExamPrograms.examDate))
    .limit(1);
  return row?.program ?? null;
}

export async function studentMockExamPrograms(
  studentId: string,
  options: { fromDate?: string } = {},
): Promise<MockExamProgram[]> {
  const db = await getDb();
  const rows = await db
    .select({ program: mockExamPrograms })
    .from(studentMockExams)
    .innerJoin(mockExamPrograms, eq(studentMockExams.mockExamId, mockExamPrograms.id))
    .where(and(eq(studentMockExams.studentId, studentId), inArray(studentMockExams.status, ["selected", "registered"])))
    .orderBy(asc(mockExamPrograms.examDate));
  return rows
    .map((row) => row.program)
    .filter((program) => !options.fromDate || program.examDate >= options.fromDate);
}

export type GroupMockExamComparisonRow = {
  examId: string;
  examDate: string;
  title: string;
  provider: string;
  members: {
    studentId: string;
    name: string;
    overallPercent: number;
    subjects: { subjectTitle: string; percent: number }[];
  }[];
};

export async function getGroupMockExamComparison(groupId: string): Promise<GroupMockExamComparisonRow[]> {
  const db = await getDb();
  const programs = await db
    .select({ program: mockExamPrograms })
    .from(groupMockExams)
    .innerJoin(mockExamPrograms, eq(groupMockExams.mockExamId, mockExamPrograms.id))
    .where(eq(groupMockExams.groupId, groupId))
    .orderBy(asc(mockExamPrograms.examDate));
  if (programs.length === 0) return [];
  const members = await db
    .select({ id: students.id, name: students.name })
    .from(students)
    .where(and(eq(students.groupId, groupId), eq(students.status, "active")))
    .orderBy(asc(students.name));
  if (members.length === 0) return [];
  const results = await db
    .select()
    .from(externalExams)
    .where(
      and(
        inArray(externalExams.studentId, members.map((member) => member.id)),
        inArray(externalExams.mockExamId, programs.map((row) => row.program.id)),
      ),
    );
  const resultKey = (studentId: string, mockExamId: string | null) => `${studentId}|${mockExamId ?? ""}`;
  const resultByKey = new Map(
    results.map((row) => [resultKey(row.studentId, row.mockExamId), row]),
  );
  const nameById = new Map(members.map((member) => [member.id, member.name]));
  return programs.map(({ program }) => ({
    examId: program.id,
    examDate: program.examDate,
    title: program.title,
    provider: program.provider,
    members: members
      .map((member) => {
        const result = resultByKey.get(resultKey(member.id, program.id));
        return {
          studentId: member.id,
          name: nameById.get(member.id) ?? member.name,
          overallPercent: result?.overallPercent ?? 0,
          subjects: (result?.subjectsJson ?? []).map((subject) => ({
            subjectTitle: subject.subjectTitle,
            percent: subject.percent,
          })),
        };
      })
      .sort((a, b) => b.overallPercent - a.overallPercent),
  }));
}

export async function listGroupMockExamIds(groupId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ mockExamId: groupMockExams.mockExamId })
    .from(groupMockExams)
    .where(eq(groupMockExams.groupId, groupId));
  return rows.map((row) => row.mockExamId);
}

export function providerLabel(provider: string): MockExamProvider | string {
  return provider;
}
