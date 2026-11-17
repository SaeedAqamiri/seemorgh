import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  performancePanels,
  studentGroups,
  students,
  subjects,
  type PerformanceCellJson,
  type PerformanceGridJson,
} from "@/db/schema";
import { addDays, startOfWeekSaturday, weekDates } from "./dates";
import { normalizePerfGrid, normalizePerfGridForSubjectKinds } from "./performance";
import { ensureSubjectCatalog } from "./subject-catalog";
import { subjectAvailableForField } from "./subjects";
import { ensureStudentGroups, type StudentGroup } from "./student-groups";

export type LeaderboardScope = "general" | "specialized";

export type SubjectMeta = {
  id: string;
  title: string;
  kind: string;
  color: string;
};

export type GroupMemberRow = {
  id: string;
  name: string;
  grade: string;
  field: string;
};

export type SubjectCounts = {
  tests: number;
  exercises: number;
  studyMinutes: number;
};

export type GroupStats = Map<string, Map<string, SubjectCounts>>;

export type PerformancePanelRow = {
  studentId: string;
  weekStart: string;
  grid: PerformanceGridJson;
};

export type LeaderboardEntry = {
  studentId: string;
  name: string;
  count: number;
  rank: number;
};

export type ViewerPosition = {
  studentId: string;
  name: string;
  count: number;
  rank: number;
  memberCount: number;
  average: number;
  aheadPercent: number;
};

export type SubjectChampion = {
  subjectId: string;
  title: string;
  kind: string;
  color: string;
  champion: LeaderboardEntry | null;
  top: LeaderboardEntry[];
  viewer: ViewerPosition | null;
};

export type GroupLeaderboard = {
  scope: LeaderboardScope;
  metricLabel: string;
  metricUnit: string;
  memberCount: number;
  totalCount: number;
  subjects: SubjectChampion[];
  overall: {
    champion: LeaderboardEntry | null;
    top: LeaderboardEntry[];
    viewer: ViewerPosition | null;
  };
};

export type GroupLeaderboardBundle = {
  group: StudentGroup;
  from: string;
  to: string;
  general: GroupLeaderboard;
  specialized: GroupLeaderboard;
};

export const SCOPE_LABELS: Record<LeaderboardScope, string> = {
  general: "دروس عمومی",
  specialized: "دروس اختصاصی",
};

export const METRIC_LABELS: Record<LeaderboardScope, { label: string; unit: string }> = {
  general: { label: "تمرین تشریحی", unit: "تمرین" },
  specialized: { label: "تست", unit: "تست" },
};

function emptyCounts(): SubjectCounts {
  return { tests: 0, exercises: 0, studyMinutes: 0 };
}

function addCell(counts: SubjectCounts, cell: PerformanceCellJson): void {
  if (cell.kind === "empty" || cell.kind === "rest" || cell.kind === "school" || cell.kind === "exam" || cell.kind === "examAnalysis") return;
  if (cell.kind === "test" || cell.kind === "timedTest") {
    counts.tests += Math.max(0, cell.count);
    return;
  }
  if (cell.kind === "exercise") {
    counts.exercises += Math.max(0, cell.count);
    return;
  }
  if (cell.kind === "routine") {
    if (cell.routineMode === "test") counts.tests += Math.max(0, cell.count);
    else counts.studyMinutes += Math.max(0, cell.minutes);
    return;
  }
  counts.studyMinutes += Math.max(0, cell.minutes);
}

/** Aggregates every performed cell inside the [from, to] window per student and subject. */
export function aggregateGroupStats(
  panels: PerformancePanelRow[],
  from: string,
  to: string,
): GroupStats {
  const stats: GroupStats = new Map();
  for (const panel of panels) {
    const dates = weekDates(panel.weekStart);
    const studentStats = stats.get(panel.studentId) ?? new Map<string, SubjectCounts>();
    for (let day = 0; day < dates.length; day += 1) {
      const date = dates[day];
      if (date < from || date > to) continue;
      for (const cell of panel.grid[day] ?? []) {
        if (cell.kind === "empty" || cell.kind === "rest" || cell.kind === "school" || cell.kind === "exam" || cell.kind === "examAnalysis") continue;
        if (!("subjectId" in cell) || !cell.subjectId) continue;
        const counts = studentStats.get(cell.subjectId) ?? emptyCounts();
        addCell(counts, cell);
        studentStats.set(cell.subjectId, counts);
      }
    }
    stats.set(panel.studentId, studentStats);
  }
  return stats;
}

export function subjectInScope(kind: string, scope: LeaderboardScope): boolean {
  if (kind === "both") return true;
  return scope === "general" ? kind === "general" : kind === "specialized";
}

export function metricForScope(
  counts: SubjectCounts | undefined,
  scope: LeaderboardScope,
): number {
  if (!counts) return 0;
  return scope === "general" ? counts.exercises : counts.tests;
}

function rankByCount(
  rows: { studentId: string; name: string; count: number }[],
): LeaderboardEntry[] {
  const sorted = [...rows].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "fa"),
  );
  return sorted.map((row) => ({
    ...row,
    rank: 1 + sorted.filter((other) => other.count > row.count).length,
  }));
}

function viewerPosition(
  entries: LeaderboardEntry[],
  viewerId: string | null | undefined,
): ViewerPosition | null {
  if (!viewerId) return null;
  const entry = entries.find((row) => row.studentId === viewerId);
  if (!entry) return null;
  const memberCount = entries.length;
  const total = entries.reduce((sum, row) => sum + row.count, 0);
  const others = memberCount - 1;
  const ahead = entries.filter(
    (row) => row.studentId !== viewerId && row.count < entry.count,
  ).length;
  const aheadOf = entries.filter((row) => row.studentId !== viewerId && row.count > entry.count).length;
  return {
    ...entry,
    memberCount,
    average: memberCount > 0 ? Math.round((total / memberCount) * 10) / 10 : 0,
    aheadPercent: others > 0 ? Math.round((ahead / others) * 100) : 100,
    rank: 1 + aheadOf,
  };
}

export function buildGroupLeaderboard(input: {
  scope: LeaderboardScope;
  members: GroupMemberRow[];
  subjects: SubjectMeta[];
  stats: GroupStats;
  viewerId?: string | null;
}): GroupLeaderboard {
  const { scope, members, subjects: subjectRows, stats, viewerId } = input;
  const scopedSubjects = subjectRows.filter((subject) => subjectInScope(subject.kind, scope));

  const subjectChampions: SubjectChampion[] = scopedSubjects.map((subject) => {
    const entries = rankByCount(
      members.map((member) => ({
        studentId: member.id,
        name: member.name,
        count: metricForScope(stats.get(member.id)?.get(subject.id), scope),
      })),
    );
    const withActivity = entries.filter((entry) => entry.count > 0);
    return {
      subjectId: subject.id,
      title: subject.title,
      kind: subject.kind,
      color: subject.color,
      champion: withActivity[0] ?? null,
      top: withActivity.slice(0, 3),
      viewer: viewerPosition(entries, viewerId),
    };
  });

  const totals = rankByCount(
    members.map((member) => ({
      studentId: member.id,
      name: member.name,
      count: scopedSubjects.reduce(
        (sum, subject) => sum + metricForScope(stats.get(member.id)?.get(subject.id), scope),
        0,
      ),
    })),
  );
  const overallActive = totals.filter((entry) => entry.count > 0);

  return {
    scope,
    metricLabel: METRIC_LABELS[scope].label,
    metricUnit: METRIC_LABELS[scope].unit,
    memberCount: members.length,
    totalCount: totals.reduce((sum, row) => sum + row.count, 0),
    subjects: subjectChampions,
    overall: {
      champion: overallActive[0] ?? null,
      top: overallActive.slice(0, 3),
      viewer: viewerPosition(totals, viewerId),
    },
  };
}

export async function getGroupLeaderboards(input: {
  workspaceId: string;
  groupId: string;
  from: string;
  to: string;
  viewerId?: string | null;
}): Promise<GroupLeaderboardBundle | null> {
  const { workspaceId, groupId, from, to, viewerId } = input;
  const db = await getDb();
  await ensureStudentGroups(workspaceId);
  await ensureSubjectCatalog(workspaceId);

  const [group] = await db
    .select()
    .from(studentGroups)
    .where(and(eq(studentGroups.workspaceId, workspaceId), eq(studentGroups.id, groupId)))
    .limit(1);
  if (!group) return null;

  const [memberRows, subjectRows] = await Promise.all([
    db
      .select({
        id: students.id,
        name: students.name,
        grade: students.grade,
        field: students.field,
      })
      .from(students)
      .where(
        and(
          eq(students.workspaceId, workspaceId),
          eq(students.groupId, groupId),
          eq(students.status, "active"),
        ),
      )
      .orderBy(asc(students.name)),
    db
      .select({
        id: subjects.id,
        title: subjects.title,
        kind: subjects.kind,
        color: subjects.color,
      })
      .from(subjects)
      .where(eq(subjects.workspaceId, workspaceId))
      .orderBy(asc(subjects.title)),
  ]);

  const memberIds = memberRows.map((member) => member.id);
  const panelFrom = startOfWeekSaturday(addDays(from, -6));
  const panelRows = memberIds.length
    ? await db
        .select({
          studentId: performancePanels.studentId,
          weekStart: performancePanels.weekStart,
          cellsJson: performancePanels.cellsJson,
        })
        .from(performancePanels)
        .where(
          and(
            inArray(performancePanels.studentId, memberIds),
            gte(performancePanels.weekStart, panelFrom),
            lte(performancePanels.weekStart, to),
          ),
        )
    : [];

  const kindById = new Map(subjectRows.map((subject) => [subject.id, subject.kind]));
  const panels: PerformancePanelRow[] = panelRows
    .filter((row) => Array.isArray(row.cellsJson))
    .map((row) => {
      const raw = row.cellsJson as unknown as unknown[][];
      const slotCount = Math.max(
        1,
        ...raw.map((cellRow) => (Array.isArray(cellRow) ? cellRow.length : 0)),
      );
      const grid = normalizePerfGridForSubjectKinds(
        normalizePerfGrid(raw, slotCount),
        kindById,
      );
      return { studentId: row.studentId, weekStart: row.weekStart, grid };
    });

  const stats = aggregateGroupStats(panels, from, to);
  const groupSubjects = subjectRows.filter((subject) =>
    subjectAvailableForField(subject.title, group.field),
  );
  return {
    group,
    from,
    to,
    general: buildGroupLeaderboard({
      scope: "general",
      members: memberRows,
      subjects: groupSubjects,
      stats,
      viewerId,
    }),
    specialized: buildGroupLeaderboard({
      scope: "specialized",
      members: memberRows,
      subjects: groupSubjects,
      stats,
      viewerId,
    }),
  };
}
