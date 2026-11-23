import "server-only";
import { and, desc, eq, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  challengeParticipants,
  challenges,
  examAnswers,
  examAssignments,
  examAttempts,
  exams,
  studentGroups,
  students,
} from "@/db/schema";
import { parseSnapshot, shuffleExamSnapshot, type ExamSnapshot } from "@/lib/exam";
import { logAudit } from "@/lib/audit";
import { notifyStudentUser } from "@/lib/notifications";
import { formatTehranDateTime } from "@/lib/dates";
import { getStudentSummary, type StudentSummary } from "@/lib/student-summary";

export type ChallengeStatus = "pending" | "cancelled" | "completed";
export type ChallengeInviteStatus = "pending" | "accepted" | "declined" | "expired";

export type ChallengeStudentRow = {
  id: string;
  name: string;
  code: string;
  grade: string;
  field: string;
  groupName: string | null;
  groupEmoji: string | null;
};

export type ChallengeExamSpec = {
  id: string;
  title: string;
  questionCount: number;
  totalScore: number;
  durationMinutes: number;
  topics: string[];
  createdAt: Date;
};

export type ChallengeListRow = {
  id: string;
  title: string;
  status: ChallengeStatus;
  scheduledAt: Date;
  endAt: Date | null;
  inviterStudentId: string;
  inviterName: string;
  myRole: "inviter" | "invitee";
  myInviteStatus: ChallengeInviteStatus | "inviter";
  examTitle: string;
  questionCount: number;
  durationMinutes: number;
  acceptedCount: number;
  pendingCount: number;
  myPercent: number | null;
};

export type ChallengeResultRow = {
  studentId: string;
  studentName: string;
  role: "inviter" | "invitee";
  inviteStatus: ChallengeInviteStatus | "inviter";
  attemptStatus: "none" | "in_progress" | "submitted" | "graded";
  percent: number | null;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  blank: number;
  timeSpentSec: number;
};

export type ChallengeDetail = {
  id: string;
  title: string;
  status: ChallengeStatus;
  scheduledAt: Date;
  endAt: Date;
  inviterStudentId: string;
  inviterName: string;
  viewerRole: "inviter" | "invitee";
  viewerInviteStatus: ChallengeInviteStatus | "inviter";
  examId: string;
  examTitle: string;
  questionCount: number;
  durationMinutes: number;
  topics: string[];
  participants: { studentId: string; studentName: string; status: ChallengeInviteStatus }[];
  results: ChallengeResultRow[];
};

export type ChallengeStudentProfile = {
  student: ChallengeStudentRow;
  summary: StudentSummary;
};

export class ChallengeError extends Error {}

const MAX_CHALLENGE_INVITEES = 30;

/** Human-readable topic breakdown of an exam snapshot (pure). */
export function examTopicsSummary(snapshot: ExamSnapshot, maxRows = 4): string[] {
  const byKey = new Map<string, { subjectTitle: string; topic: string; count: number }>();
  for (const item of snapshot.items) {
    const topic = item.topic?.trim() || "کلی";
    const key = `${item.subjectTitle}|${topic}`;
    const current = byKey.get(key) ?? { subjectTitle: item.subjectTitle, topic, count: 0 };
    current.count += 1;
    byKey.set(key, current);
  }
  const rows = [...byKey.values()].sort((a, b) => b.count - a.count);
  const picked = rows
    .slice(0, maxRows)
    .map((row) => `${row.subjectTitle} — ${row.topic} ×${row.count}`);
  const rest = rows.length - picked.length;
  if (rest > 0) picked.push(`${rest} ترکیب دیگر`);
  return picked;
}

/** Ranks participants: finished attempts by percent (then faster time), then in-progress, then absent (pure). */
export function rankChallengeResults(rows: ChallengeResultRow[]): ChallengeResultRow[] {
  const rankOf = (row: ChallengeResultRow) =>
    row.attemptStatus === "submitted" || row.attemptStatus === "graded"
      ? 0
      : row.attemptStatus === "in_progress"
        ? 1
        : 2;
  return [...rows].sort((a, b) => {
    const rankDiff = rankOf(a) - rankOf(b);
    if (rankDiff !== 0) return rankDiff;
    if (rankOf(a) === 0) {
      const percentDiff = (b.percent ?? 0) - (a.percent ?? 0);
      if (percentDiff !== 0) return percentDiff;
      if (a.timeSpentSec !== b.timeSpentSec) return a.timeSpentSec - b.timeSpentSec;
    }
    return a.studentName.localeCompare(b.studentName, "fa");
  });
}

export async function listChallengeStudents(
  workspaceId: string,
  filters: { q?: string; groupId?: string; grade?: string; field?: string },
  excludeStudentId: string,
): Promise<ChallengeStudentRow[]> {
  const db = await getDb();
  const conditions = [
    eq(students.workspaceId, workspaceId),
    eq(students.status, "active"),
    isNotNull(students.userId),
    ne(students.id, excludeStudentId),
  ];
  if (filters.q) conditions.push(sql`${students.name} ILIKE ${`%${filters.q}%`}`);
  if (filters.groupId) conditions.push(eq(students.groupId, filters.groupId));
  if (filters.grade) conditions.push(eq(students.grade, filters.grade));
  if (filters.field) conditions.push(eq(students.field, filters.field));

  const rows = await db
    .select({
      id: students.id,
      name: students.name,
      code: students.inviteCode,
      grade: students.grade,
      field: students.field,
      groupName: studentGroups.name,
      groupEmoji: studentGroups.emoji,
    })
    .from(students)
    .leftJoin(studentGroups, eq(students.groupId, studentGroups.id))
    .where(and(...conditions))
    .orderBy(students.name)
    .limit(200);

  return rows.map((row) => ({
    ...row,
    groupName: row.groupName ?? null,
    groupEmoji: row.groupEmoji ?? null,
  }));
}

export async function getChallengeStudentProfile(
  workspaceId: string,
  studentId: string,
): Promise<ChallengeStudentProfile | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      id: students.id,
      name: students.name,
      code: students.inviteCode,
      grade: students.grade,
      field: students.field,
      groupName: studentGroups.name,
      groupEmoji: studentGroups.emoji,
    })
    .from(students)
    .leftJoin(studentGroups, eq(students.groupId, studentGroups.id))
    .where(and(eq(students.id, studentId), eq(students.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;

  const summary = await getStudentSummary(studentId);
  return {
    student: { ...row, groupName: row.groupName ?? null, groupEmoji: row.groupEmoji ?? null },
    summary,
  };
}

/** Exams the student built themselves (own practice exams with a snapshot). */
export async function listChallengeableExams(userId: string): Promise<ChallengeExamSpec[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(exams)
    .where(and(eq(exams.createdBy, userId), isNotNull(exams.questionSnapshotJson)))
    .orderBy(desc(exams.createdAt))
    .limit(50);

  return rows.map((row) => {
    const snapshot = parseSnapshot(row.questionSnapshotJson);
    return {
      id: row.id,
      title: row.title,
      questionCount: snapshot.items.length,
      totalScore: snapshot.totalScore || row.totalScore,
      durationMinutes: row.durationMinutes,
      topics: examTopicsSummary(snapshot),
      createdAt: row.createdAt,
    };
  });
}

function challengeEndAt(scheduledAt: Date, durationMinutes: number): Date {
  return new Date(scheduledAt.getTime() + (durationMinutes + 10) * 60_000);
}

export type CreateChallengeInput = {
  workspaceId: string;
  inviterUserId: string;
  inviterStudentId: string;
  inviterName: string;
  examId: string;
  inviteeStudentIds: string[];
  scheduledAt: Date;
  title?: string;
};

export async function createChallenge(
  input: CreateChallengeInput,
): Promise<{ challengeId: string; challengeExamId: string }> {
  const db = await getDb();

  if (!Number.isFinite(input.scheduledAt.getTime())) {
    throw new ChallengeError("تاریخ و ساعت چالش نامعتبر است.");
  }
  if (input.scheduledAt.getTime() <= Date.now()) {
    throw new ChallengeError("ساعت چالش باید در آینده باشد.");
  }

  const uniqueInvitees = [...new Set(input.inviteeStudentIds)].filter(
    (studentId) => studentId !== input.inviterStudentId,
  );
  if (uniqueInvitees.length === 0) {
    throw new ChallengeError("حداقل یک دانش‌آموز را برای چالش انتخاب کنید.");
  }
  if (uniqueInvitees.length > MAX_CHALLENGE_INVITEES) {
    throw new ChallengeError(`حداکثر ${MAX_CHALLENGE_INVITEES} نفر در هر چالش مجاز است.`);
  }

  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, input.examId), eq(exams.createdBy, input.inviterUserId)))
    .limit(1);
  if (!exam || !exam.questionSnapshotJson) {
    throw new ChallengeError("آزمون انتخابی پیدا نشد یا قابل استفاده برای چالش نیست.");
  }

  const inviteeRows = await db
    .select({ id: students.id, userId: students.userId })
    .from(students)
    .where(
      and(
        inArray(students.id, uniqueInvitees),
        eq(students.workspaceId, input.workspaceId),
        eq(students.status, "active"),
        isNotNull(students.userId),
      ),
    );
  if (inviteeRows.length !== uniqueInvitees.length) {
    throw new ChallengeError("برخی دانش‌آموزان انتخابی فعال نیستند یا حساب کاربری ندارند.");
  }

  const sourceSnapshot = parseSnapshot(exam.questionSnapshotJson);
  if (sourceSnapshot.items.length === 0) {
    throw new ChallengeError("آزمون انتخابی سوال ندارد.");
  }

  const now = new Date();
  const startAt = input.scheduledAt;
  const endAt = challengeEndAt(startAt, exam.durationMinutes);
  const snapshot = shuffleExamSnapshot(
    sourceSnapshot,
    `challenge:${exam.id}:${now.toISOString()}`,
    exam.shuffleQuestions,
    exam.shuffleOptions,
  );
  const challengeTitle = input.title?.trim() || exam.title;

  const [challengeExam] = await db
    .insert(exams)
    .values({
      workspaceId: input.workspaceId,
      title: `چالش: ${challengeTitle}`,
      createdBy: input.inviterUserId,
      status: "scheduled",
      startAt,
      endAt,
      durationMinutes: exam.durationMinutes,
      blueprintJson: { items: [] },
      manualQuestionIdsJson: exam.manualQuestionIdsJson,
      questionSnapshotJson: snapshot,
      totalScore: snapshot.totalScore,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleOptions: exam.shuffleOptions,
      aiSelection: false,
      maxAttempts: 1,
      publishedAt: now,
    })
    .returning();

  const [challenge] = await db
    .insert(challenges)
    .values({
      workspaceId: input.workspaceId,
      examId: exam.id,
      challengeExamId: challengeExam.id,
      inviterStudentId: input.inviterStudentId,
      title: challengeTitle,
      scheduledAt: startAt,
      status: "pending",
    })
    .returning();

  await db.insert(challengeParticipants).values(
    inviteeRows.map((row) => ({
      challengeId: challenge.id,
      studentId: row.id,
      status: "pending" as const,
    })),
  );

  const payload = {
    challengeId: challenge.id,
    title: challengeTitle,
    inviterName: input.inviterName,
    scheduledAt: startAt.toISOString(),
    questionCount: snapshot.items.length,
    durationMinutes: exam.durationMinutes,
    body: `${input.inviterName} تو را به چالش «${challengeTitle}» دعوت کرد — ${snapshot.items.length.toLocaleString("fa-IR")} سوال، ${formatTehranDateTime(startAt)}`,
  };
  for (const row of inviteeRows) {
    await notifyStudentUser(row.id, "challenge_invited", payload);
  }

  await logAudit({
    workspaceId: input.workspaceId,
    actorId: input.inviterUserId,
    action: "challenge.create",
    entity: "challenge",
    entityId: challenge.id,
    diff: {
      title: challengeTitle,
      invitees: inviteeRows.length,
      scheduledAt: startAt.toISOString(),
    },
  });

  return { challengeId: challenge.id, challengeExamId: challengeExam.id };
}

export async function respondToChallenge(input: {
  challengeId: string;
  studentId: string;
  actorUserId: string | null;
  accept: boolean;
}): Promise<{ challengeExamId: string | null }> {
  const db = await getDb();
  const [row] = await db
    .select({ challenge: challenges, participant: challengeParticipants })
    .from(challengeParticipants)
    .innerJoin(challenges, eq(challengeParticipants.challengeId, challenges.id))
    .where(
      and(
        eq(challengeParticipants.challengeId, input.challengeId),
        eq(challengeParticipants.studentId, input.studentId),
      ),
    )
    .limit(1);
  if (!row) throw new ChallengeError("دعوت چالش پیدا نشد.");
  if (row.challenge.status !== "pending") {
    throw new ChallengeError("این چالش دیگر فعال نیست.");
  }
  if (row.participant.status !== "pending") {
    throw new ChallengeError("قبلاً به این دعوت پاسخ داده‌اید.");
  }
  if (row.challenge.scheduledAt.getTime() <= Date.now()) {
    throw new ChallengeError("زمان پاسخ به این دعوت گذشته است.");
  }

  const now = new Date();
  await db
    .update(challengeParticipants)
    .set({ status: input.accept ? "accepted" : "declined", respondedAt: now })
    .where(eq(challengeParticipants.id, row.participant.id));

  const payload = {
    challengeId: row.challenge.id,
    title: row.challenge.title,
    studentName: (await studentNameOf(input.studentId)) ?? "",
    scheduledAt: row.challenge.scheduledAt.toISOString(),
    body: input.accept
      ? `${(await studentNameOf(input.studentId)) ?? "دانش‌آموز"} چالش «${row.challenge.title}» را تایید کرد.`
      : `${(await studentNameOf(input.studentId)) ?? "دانش‌آموز"} چالش «${row.challenge.title}» را رد کرد.`,
  };

  if (input.accept) {
    if (row.challenge.challengeExamId) {
      await db
        .insert(examAssignments)
        .values({ examId: row.challenge.challengeExamId, studentId: input.studentId })
        .onConflictDoNothing();
      await db
        .insert(examAssignments)
        .values({
          examId: row.challenge.challengeExamId,
          studentId: row.challenge.inviterStudentId,
        })
        .onConflictDoNothing();
    }
    await notifyStudentUser(row.challenge.inviterStudentId, "challenge_accepted", payload);
    await logAudit({
      workspaceId: row.challenge.workspaceId,
      actorId: input.actorUserId,
      action: "challenge.accept",
      entity: "challenge",
      entityId: row.challenge.id,
      diff: { studentId: input.studentId },
    });
  } else {
    await notifyStudentUser(row.challenge.inviterStudentId, "challenge_declined", payload);
    await logAudit({
      workspaceId: row.challenge.workspaceId,
      actorId: input.actorUserId,
      action: "challenge.decline",
      entity: "challenge",
      entityId: row.challenge.id,
      diff: { studentId: input.studentId },
    });
  }

  return { challengeExamId: row.challenge.challengeExamId };
}

async function studentNameOf(studentId: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ name: students.name })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  return row?.name ?? null;
}

export async function cancelChallenge(input: {
  challengeId: string;
  inviterStudentId: string;
  actorUserId: string | null;
}): Promise<void> {
  const db = await getDb();
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.id, input.challengeId), eq(challenges.status, "pending")))
    .limit(1);
  if (!challenge) throw new ChallengeError("چالش قابل لغو نیست.");
  if (challenge.inviterStudentId !== input.inviterStudentId) {
    throw new ChallengeError("فقط دعوت‌کننده می‌تواند چالش را لغو کند.");
  }
  if (challenge.scheduledAt.getTime() <= Date.now()) {
    throw new ChallengeError("چالش‌های شروع‌شده قابل لغو نیستند.");
  }

  const pendingParticipants = await db
    .select({ id: challengeParticipants.id, studentId: challengeParticipants.studentId })
    .from(challengeParticipants)
    .where(
      and(
        eq(challengeParticipants.challengeId, challenge.id),
        eq(challengeParticipants.status, "pending"),
      ),
    );

  await db
    .update(challenges)
    .set({ status: "cancelled" })
    .where(eq(challenges.id, challenge.id));
  if (pendingParticipants.length > 0) {
    await db
      .update(challengeParticipants)
      .set({ status: "expired", respondedAt: new Date() })
      .where(
        inArray(
          challengeParticipants.id,
          pendingParticipants.map((row) => row.id),
        ),
      );
    const payload = {
      challengeId: challenge.id,
      title: challenge.title,
      scheduledAt: challenge.scheduledAt.toISOString(),
      body: `چالش «${challenge.title}» توسط دعوت‌کننده لغو شد.`,
    };
    for (const row of pendingParticipants) {
      await notifyStudentUser(row.studentId, "challenge_cancelled", payload);
    }
  }

  await logAudit({
    workspaceId: challenge.workspaceId,
    actorId: input.actorUserId,
    action: "challenge.cancel",
    entity: "challenge",
    entityId: challenge.id,
    diff: { title: challenge.title },
  });
}

/**
 * Lazy state machine pass: expire unanswered invites past the scheduled time,
 * cancel challenges nobody accepted, and finish challenges whose exam window
 * has closed (notifying participants of the results).
 */
export async function sweepChallenges(): Promise<void> {
  const db = await getDb();

  await db.execute(sql`
    UPDATE challenge_participants SET status = 'expired'
    WHERE status = 'pending'
      AND challenge_id IN (
        SELECT id FROM challenges
        WHERE scheduled_at < now() AND status IN ('pending', 'completed')
      )
  `);

  await db.execute(sql`
    UPDATE challenges SET status = 'cancelled'
    WHERE status = 'pending' AND scheduled_at < now()
      AND NOT EXISTS (
        SELECT 1 FROM challenge_participants
        WHERE challenge_participants.challenge_id = challenges.id
          AND challenge_participants.status = 'accepted'
      )
  `);

  const finishing = await db
    .select({ id: challenges.id, title: challenges.title, challengeExamId: challenges.challengeExamId, inviterStudentId: challenges.inviterStudentId })
    .from(challenges)
    .innerJoin(exams, eq(challenges.challengeExamId, exams.id))
    .where(and(eq(challenges.status, "pending"), lt(exams.endAt, new Date())));

  if (finishing.length === 0) return;

  const finishingIds = finishing.map((row) => row.id);
  await db
    .update(challenges)
    .set({ status: "completed", completedAt: new Date() })
    .where(inArray(challenges.id, finishingIds));

  for (const row of finishing) {
    if (row.challengeExamId) {
      await db
        .update(examAssignments)
        .set({ status: "absent" })
        .where(
          and(
            eq(examAssignments.examId, row.challengeExamId),
            eq(examAssignments.status, "assigned"),
          ),
        );
    }
    const participants = await db
      .select({ studentId: challengeParticipants.studentId })
      .from(challengeParticipants)
      .where(
        and(
          eq(challengeParticipants.challengeId, row.id),
          eq(challengeParticipants.status, "accepted"),
        ),
      );
    const audience = [
      ...participants.map((participant) => participant.studentId),
      row.inviterStudentId,
    ];
    const payload = {
      challengeId: row.id,
      title: row.title,
      body: `چالش «${row.title}» تمام شد. نتایج شرکت‌کننده‌ها را ببین.`,
    };
    for (const studentId of audience) {
      await notifyStudentUser(studentId, "challenge_finished", payload);
    }
  }
}

async function challengeParticipantCounts(
  challengeIds: string[],
): Promise<Map<string, { acceptedCount: number; pendingCount: number }>> {
  const counts = new Map<string, { acceptedCount: number; pendingCount: number }>();
  if (challengeIds.length === 0) return counts;
  const db = await getDb();
  const rows = await db
    .select({
      challengeId: challengeParticipants.challengeId,
      status: challengeParticipants.status,
      count: sql<number>`count(*)::int`,
    })
    .from(challengeParticipants)
    .where(inArray(challengeParticipants.challengeId, challengeIds))
    .groupBy(challengeParticipants.challengeId, challengeParticipants.status);
  for (const row of rows) {
    const current = counts.get(row.challengeId) ?? { acceptedCount: 0, pendingCount: 0 };
    if (row.status === "accepted") current.acceptedCount += row.count;
    if (row.status === "pending") current.pendingCount += row.count;
    counts.set(row.challengeId, current);
  }
  return counts;
}

export async function countPendingInvites(studentId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(challengeParticipants)
    .innerJoin(challenges, eq(challengeParticipants.challengeId, challenges.id))
    .where(
      and(
        eq(challengeParticipants.studentId, studentId),
        eq(challengeParticipants.status, "pending"),
        eq(challenges.status, "pending"),
      ),
    );
  return row?.count ?? 0;
}

export async function listChallengesForStudent(
  studentId: string,
): Promise<ChallengeListRow[]> {
  const db = await getDb();

  const asInvitee = await db
    .select({ challenge: challenges, participant: challengeParticipants })
    .from(challengeParticipants)
    .innerJoin(challenges, eq(challengeParticipants.challengeId, challenges.id))
    .where(eq(challengeParticipants.studentId, studentId));

  const asInviter = await db
    .select({ challenge: challenges })
    .from(challenges)
    .where(eq(challenges.inviterStudentId, studentId));

  const byId = new Map<string, { challenge: typeof asInviter[number]["challenge"]; inviteStatus: ChallengeInviteStatus | null }>();
  for (const row of asInviter) {
    byId.set(row.challenge.id, { challenge: row.challenge, inviteStatus: null });
  }
  for (const row of asInvitee) {
    byId.set(row.challenge.id, { challenge: row.challenge, inviteStatus: row.participant.status });
  }
  if (byId.size === 0) return [];

  const ids = [...byId.keys()];
  const sourceExams = await db
    .select({
      challengeExamId: challenges.challengeExamId,
      examId: challenges.examId,
      id: exams.id,
      title: exams.title,
      durationMinutes: exams.durationMinutes,
      questionSnapshotJson: exams.questionSnapshotJson,
    })
    .from(challenges)
    .innerJoin(exams, eq(challenges.examId, exams.id))
    .where(inArray(challenges.id, ids));
  const examByChallenge = new Map(sourceExams.map((row) => [row.examId, row]));

  const inviterRows = await db
    .select({ id: students.id, name: students.name })
    .from(students)
    .where(
      inArray(
        students.id,
        [...byId.values()].map((entry) => entry.challenge.inviterStudentId),
      ),
    );
  const inviterNames = new Map(inviterRows.map((row) => [row.id, row.name]));

  const counts = await challengeParticipantCounts(ids);

  const challengeExamIds = [
    ...new Set(
      [...byId.values()]
        .map((entry) => entry.challenge.challengeExamId)
        .filter((examId): examId is string => Boolean(examId)),
    ),
  ];
  const endAtByExam = new Map<string, Date>();
  if (challengeExamIds.length > 0) {
    const endRows = await db
      .select({ id: exams.id, endAt: exams.endAt })
      .from(exams)
      .where(inArray(exams.id, challengeExamIds));
    for (const row of endRows) endAtByExam.set(row.id, row.endAt);
  }
  const attemptConditions = [eq(examAttempts.studentId, studentId)];
  if (challengeExamIds.length > 0) {
    attemptConditions.push(inArray(examAttempts.examId, challengeExamIds));
  }
  const myAttempts = await db
    .select({
      examId: examAttempts.examId,
      status: examAttempts.status,
      score: examAttempts.score,
      maxScore: examAttempts.maxScore,
    })
    .from(examAttempts)
    .where(and(...attemptConditions));
  const attemptByExam = new Map(myAttempts.map((row) => [row.examId, row]));

  const rows: ChallengeListRow[] = [];
  for (const [challengeId, entry] of byId) {
    const challenge = entry.challenge;
    const isInviter = challenge.inviterStudentId === studentId;
    const sourceExam = examByChallenge.get(challenge.examId);
    const snapshot = parseSnapshot(sourceExam?.questionSnapshotJson);
    const challengeExamId = challenge.challengeExamId;
    const attempt = challengeExamId ? attemptByExam.get(challengeExamId) : undefined;
    const hasFinishedAttempt =
      attempt?.status === "submitted" || attempt?.status === "graded";
    const count = counts.get(challengeId) ?? { acceptedCount: 0, pendingCount: 0 };

    rows.push({
      id: challengeId,
      title: challenge.title,
      status: challenge.status,
      scheduledAt: challenge.scheduledAt,
      endAt: challengeExamId ? (endAtByExam.get(challengeExamId) ?? null) : null,
      inviterStudentId: challenge.inviterStudentId,
      inviterName: inviterNames.get(challenge.inviterStudentId) ?? "",
      myRole: isInviter ? "inviter" : "invitee",
      myInviteStatus: isInviter ? "inviter" : (entry.inviteStatus ?? "pending"),
      examTitle: sourceExam?.title ?? "",
      questionCount: snapshot.items.length,
      durationMinutes: sourceExam?.durationMinutes ?? 0,
      acceptedCount: count.acceptedCount,
      pendingCount: count.pendingCount,
      myPercent:
        hasFinishedAttempt && attempt && attempt.maxScore > 0
          ? Math.round((attempt.score / attempt.maxScore) * 100)
          : null,
    });
  }

  return rows.sort(
    (a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime(),
  );
}

export async function getChallengeDetail(
  workspaceId: string,
  challengeId: string,
  viewerStudentId: string,
): Promise<ChallengeDetail | null> {
  const db = await getDb();

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.id, challengeId), eq(challenges.workspaceId, workspaceId)))
    .limit(1);
  if (!challenge) return null;

  const [participant] = await db
    .select()
    .from(challengeParticipants)
    .where(
      and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.studentId, viewerStudentId),
      ),
    )
    .limit(1);

  const isInviter = challenge.inviterStudentId === viewerStudentId;
  if (!isInviter && !participant) return null;

  const [inviter] = await db
    .select({ name: students.name })
    .from(students)
    .where(eq(students.id, challenge.inviterStudentId))
    .limit(1);

  const [sourceExam] = await db
    .select()
    .from(exams)
    .where(eq(exams.id, challenge.examId))
    .limit(1);
  const snapshot = parseSnapshot(sourceExam?.questionSnapshotJson);

  let endAt = challenge.scheduledAt;
  if (challenge.challengeExamId) {
    const [challengeExam] = await db
      .select({ endAt: exams.endAt })
      .from(exams)
      .where(eq(exams.id, challenge.challengeExamId))
      .limit(1);
    if (challengeExam) endAt = challengeExam.endAt;
  }

  const participantRows = await db
    .select({
      studentId: challengeParticipants.studentId,
      status: challengeParticipants.status,
      studentName: students.name,
    })
    .from(challengeParticipants)
    .innerJoin(students, eq(challengeParticipants.studentId, students.id))
    .where(eq(challengeParticipants.challengeId, challengeId))
    .orderBy(students.name);

  const results = await getChallengeResults(challenge.id);

  return {
    id: challenge.id,
    title: challenge.title,
    status: challenge.status,
    scheduledAt: challenge.scheduledAt,
    endAt,
    inviterStudentId: challenge.inviterStudentId,
    inviterName: inviter?.name ?? "",
    viewerRole: isInviter ? "inviter" : "invitee",
    viewerInviteStatus: isInviter ? "inviter" : (participant?.status ?? "pending"),
    examId: challenge.challengeExamId ?? challenge.examId,
    examTitle: sourceExam?.title ?? "",
    questionCount: snapshot.items.length,
    durationMinutes: sourceExam?.durationMinutes ?? 0,
    topics: examTopicsSummary(snapshot),
    participants: participantRows.map((row) => ({
      studentId: row.studentId,
      studentName: row.studentName,
      status: row.status,
    })),
    results: rankChallengeResults(results),
  };
}

export async function getChallengeResults(challengeId: string): Promise<ChallengeResultRow[]> {
  const db = await getDb();

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);
  if (!challenge) return [];

  const challengeExamId = challenge.challengeExamId;

  const participantRows = await db
    .select({
      studentId: challengeParticipants.studentId,
      status: challengeParticipants.status,
      studentName: students.name,
    })
    .from(challengeParticipants)
    .innerJoin(students, eq(challengeParticipants.studentId, students.id))
    .where(eq(challengeParticipants.challengeId, challengeId));

  const [inviter] = await db
    .select({ id: students.id, name: students.name })
    .from(students)
    .where(eq(students.id, challenge.inviterStudentId))
    .limit(1);

  const audience: { studentId: string; studentName: string; role: "inviter" | "invitee"; inviteStatus: ChallengeInviteStatus | "inviter" }[] = [
    ...(inviter
      ? [{ studentId: inviter.id, studentName: inviter.name, role: "inviter" as const, inviteStatus: "inviter" as const }]
      : []),
    ...participantRows.map((row) => ({
      studentId: row.studentId,
      studentName: row.studentName,
      role: "invitee" as const,
      inviteStatus: row.status,
    })),
  ];

  const attempts = challengeExamId
    ? await db
        .select()
        .from(examAttempts)
        .where(eq(examAttempts.examId, challengeExamId))
    : [];
  const attemptByStudent = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) attemptByStudent.set(attempt.studentId, attempt);

  const answerStats = new Map<string, { correct: number; wrong: number; blank: number }>();
  const attemptIds = attempts.map((attempt) => attempt.id);
  if (attemptIds.length > 0) {
    const answerRows = await db
      .select({
        attemptId: examAnswers.attemptId,
        answerJson: examAnswers.answerJson,
        isCorrect: examAnswers.isCorrect,
      })
      .from(examAnswers)
      .where(inArray(examAnswers.attemptId, attemptIds));
    for (const row of answerRows) {
      const stat = answerStats.get(row.attemptId) ?? { correct: 0, wrong: 0, blank: 0 };
      if (row.answerJson === null || row.answerJson === undefined) stat.blank += 1;
      else if (row.isCorrect) stat.correct += 1;
      else stat.wrong += 1;
      answerStats.set(row.attemptId, stat);
    }
  }

  return audience.map((member) => {
    const attempt = attemptByStudent.get(member.studentId);
    const attemptStatus = attempt
      ? (attempt.status as "in_progress" | "submitted" | "graded")
      : "none";
    const stat = attempt ? answerStats.get(attempt.id) : undefined;
    return {
      studentId: member.studentId,
      studentName: member.studentName,
      role: member.role,
      inviteStatus: member.inviteStatus,
      attemptStatus,
      percent:
        attempt && (attemptStatus === "submitted" || attemptStatus === "graded") && attempt.maxScore > 0
          ? Math.round((attempt.score / attempt.maxScore) * 100)
          : null,
      score: attempt?.score ?? 0,
      maxScore: attempt?.maxScore ?? 0,
      correct: stat?.correct ?? 0,
      wrong: stat?.wrong ?? 0,
      blank: stat?.blank ?? 0,
      timeSpentSec: attempt?.timeSpentSec ?? 0,
    };
  });
}
