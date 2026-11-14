import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dailyLogs } from "@/db/schema";
import { todayISO } from "./dates";
import { dailyChallengeFor, type DailyChallenge } from "./daily-challenge";

export type DailyChallengeState = {
  required: boolean;
  completed: boolean;
  challenge: DailyChallenge | null;
  firstOpenedAt: Date | null;
};

export async function recordStudentDailyOpen(studentId: string): Promise<void> {
  const db = await getDb();
  const date = todayISO();
  const [existing] = await db
    .select({ id: dailyLogs.id, firstOpenedAt: dailyLogs.firstOpenedAt })
    .from(dailyLogs)
    .where(and(eq(dailyLogs.studentId, studentId), eq(dailyLogs.logDate, date)))
    .limit(1);

  if (!existing) {
    await db
      .insert(dailyLogs)
      .values({
        studentId,
        logDate: date,
        firstOpenedAt: new Date(),
      })
      .onConflictDoNothing();
    return;
  }

  if (!existing.firstOpenedAt) {
    await db
      .update(dailyLogs)
      .set({ firstOpenedAt: new Date() })
      .where(eq(dailyLogs.id, existing.id));
  }
}

export async function getDailyChallengeState(studentId: string): Promise<DailyChallengeState> {
  const db = await getDb();
  const date = todayISO();
  const [log] = await db
    .select({
      firstOpenedAt: dailyLogs.firstOpenedAt,
      challengeCompletedAt: dailyLogs.challengeCompletedAt,
    })
    .from(dailyLogs)
    .where(and(eq(dailyLogs.studentId, studentId), eq(dailyLogs.logDate, date)))
    .limit(1);

  return {
    required: true,
    completed: Boolean(log?.challengeCompletedAt),
    challenge: log?.challengeCompletedAt ? null : dailyChallengeFor(studentId, date),
    firstOpenedAt: log?.firstOpenedAt ?? null,
  };
}
