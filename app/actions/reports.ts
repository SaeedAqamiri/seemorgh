"use server";

import { redirect } from "next/navigation";
import { requireCounselor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getPeriodReport, getStudentDetail } from "@/lib/counselor";
import {
  addDays,
  currentJalaliMonthRange,
  jalaliMonthRange,
  startOfWeekSaturday,
  todayISO,
} from "@/lib/dates";
import { generateNarrative } from "@/lib/ai";
import { saveReport } from "@/lib/reports";

export async function generateReportNarrativeAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const studentId = String(formData.get("studentId") ?? "");

  const detail = await getStudentDetail(counselor.workspaceId, studentId);
  if (!detail) redirect("/counselor");

  const period = String(formData.get("period") ?? "month") === "4w" ? "4w" : "month";
  const monthKey = String(formData.get("month") ?? "");

  let from: string;
  let to: string;

  if (period === "month") {
    const range = jalaliMonthRange(monthKey) ?? currentJalaliMonthRange();
    from = range.from;
    to = range.to;
  } else {
    const currentWeek = startOfWeekSaturday(todayISO());
    from = addDays(currentWeek, -21);
    to = addDays(currentWeek, 6);
  }

  const report = await getPeriodReport(counselor.workspaceId, studentId, from, to);
  const remainingUnits = detail.resources.reduce(
    (sum, resource) => sum + Math.max(0, resource.totalUnits - resource.completedUnits),
    0,
  );

  const metrics = {
    plannedMinutes: report.plannedMinutes,
    doneMinutes: report.doneMinutes,
    doneTasks: report.doneTasks,
    totalTasks: report.totalTasks,
    activeDays: report.activeDays,
    eligibleDays: report.eligibleDays,
    correctStarts: report.correctStarts,
    testsDone: report.testsDone,
    remainingUnits,
    byWeek: report.byWeek.map((week) => ({
      total: week.total,
      done: week.done,
      minutes: week.minutes,
    })),
  };

  const { narrative } = await generateNarrative({
    workspaceId: counselor.workspaceId,
    studentId,
    metrics,
  });

  await saveReport({
    studentId,
    periodType: period,
    periodStart: from,
    periodEnd: to,
    metrics,
    narrative,
  });

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "report.narrative",
    entity: "report",
    entityId: studentId,
    diff: { from, to, period, source: "fallback-or-ai" },
  });

  const params = new URLSearchParams({ success: "narrative", period });
  if (period === "month") params.set("month", jalaliMonthRange(monthKey)?.key ?? currentJalaliMonthRange().key);
  redirect(`/counselor/students/${studentId}/report?${params.toString()}`);
}
