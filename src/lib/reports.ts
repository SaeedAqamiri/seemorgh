import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { reports } from "@/db/schema";

export async function saveReport(input: {
  studentId: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  metrics: Record<string, unknown>;
  narrative: string;
}): Promise<void> {
  const db = await getDb();
  await db
    .insert(reports)
    .values({
      studentId: input.studentId,
      periodType: input.periodType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      metricsJson: input.metrics,
      narrative: input.narrative,
    })
    .onConflictDoUpdate({
      target: [reports.studentId, reports.periodType, reports.periodStart],
      set: {
        periodEnd: input.periodEnd,
        metricsJson: input.metrics,
        narrative: input.narrative,
        createdAt: new Date(),
      },
    });
}

export async function getReport(studentId: string, periodType: string, periodStart: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.studentId, studentId),
        eq(reports.periodType, periodType),
        eq(reports.periodStart, periodStart),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getLatestReport(studentId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(reports)
    .where(eq(reports.studentId, studentId))
    .orderBy(desc(reports.createdAt))
    .limit(1);
  return row ?? null;
}
