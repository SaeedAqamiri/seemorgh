"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCounselor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { generateCounselingReport, getLatestCounselingReport } from "@/lib/counseling-report";
import { getStudentDetail } from "@/lib/counselor";

function studentPath(studentId: string, suffix = ""): string {
  return `/counselor/students/${studentId}/auto-plan${suffix}`;
}

function fail(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

async function resolveStudent(formData: FormData) {
  const counselor = await requireCounselor();
  const studentId = String(formData.get("studentId") ?? "").trim();
  const detail = studentId ? await getStudentDetail(counselor.workspaceId, studentId) : null;
  if (!detail) fail("/counselor", "دانش‌آموز پیدا نشد.");
  return { counselor, studentId };
}

export async function runCounselingAction(formData: FormData): Promise<void> {
  const { counselor, studentId } = await resolveStudent(formData);

  const generated = await generateCounselingReport({
    workspaceId: counselor.workspaceId,
    studentId,
  });

  await logAudit({
    workspaceId: counselor.workspaceId,
    actorId: counselor.id,
    action: "counseling.run",
    entity: "student",
    entityId: studentId,
    diff: { source: generated.source },
  });

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, `?counseling=${generated.source}`));
}

export async function prepareAutoPlanAction(formData: FormData): Promise<void> {
  const { counselor, studentId } = await resolveStudent(formData);

  const detail = await getStudentDetail(counselor.workspaceId, studentId);
  if (detail && detail.availability.length === 0) {
    fail(studentPath(studentId), "اول زمان‌های آزاد هفتگی دانش‌آموز را ثبت کنید.");
  }
  if (detail && detail.resources.length === 0) {
    fail(studentPath(studentId), "اول حداقل یک منبع برای دانش‌آموز ثبت کنید.");
  }

  // Auto-planning always reuses the latest counseling report; only build a
  // fresh one when none exists (AI calls are costly — regenerate explicitly
  // via the counseling button instead).
  const existing = await getLatestCounselingReport(studentId).catch(() => null);
  let counselingParam = "reused";
  if (!existing) {
    const generated = await generateCounselingReport({
      workspaceId: counselor.workspaceId,
      studentId,
    });
    counselingParam = generated.source;
    await logAudit({
      workspaceId: counselor.workspaceId,
      actorId: counselor.id,
      action: "auto_plan.prepare",
      entity: "student",
      entityId: studentId,
      diff: { source: generated.source, reused: false },
    });
  } else {
    await logAudit({
      workspaceId: counselor.workspaceId,
      actorId: counselor.id,
      action: "auto_plan.prepare",
      entity: "student",
      entityId: studentId,
      diff: { reused: true, reportCreatedAt: existing.createdAt.toISOString() },
    });
  }

  revalidatePath(studentPath(studentId));
  redirect(studentPath(studentId, `?stage=review&counseling=${counselingParam}`));
}
