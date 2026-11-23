"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import {
  cancelChallenge,
  ChallengeError,
  createChallenge,
  respondToChallenge,
} from "@/lib/challenges";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function parseTehranLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+03:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createChallengeAction(formData: FormData): Promise<void> {
  const { user, student } = await requireStudent();

  const examId = field(formData, "examId");
  const title = field(formData, "title");
  const scheduledRaw = field(formData, "scheduledAt");
  const invitees = formData
    .getAll("inviteeIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const backPath = `/student/challenges/new/invite?students=${encodeURIComponent(invitees.join(","))}`;
  const scheduledAt = parseTehranLocal(scheduledRaw);

  if (!examId) fail(backPath, "یک آزمون برای چالش انتخاب کنید.");
  if (!scheduledAt) fail(backPath, "تاریخ و ساعت چالش را مشخص کنید.");

  try {
    await createChallenge({
      workspaceId: user.workspaceId,
      inviterUserId: user.id,
      inviterStudentId: student.id,
      inviterName: student.name,
      examId,
      inviteeStudentIds: invitees,
      scheduledAt,
      title: title || undefined,
    });
  } catch (error) {
    if (error instanceof ChallengeError) fail(backPath, error.message);
    throw error;
  }

  revalidatePath("/student/challenges");
  redirect("/student/challenges?sent=1");
}

export async function respondChallengeAction(formData: FormData): Promise<void> {
  const { user, student } = await requireStudent();

  const challengeId = field(formData, "challengeId");
  const accept = field(formData, "decision") === "accept";
  const backPath = "/student/challenges";

  let challengeExamId: string | null = null;
  try {
    const result = await respondToChallenge({
      challengeId,
      studentId: student.id,
      actorUserId: user.id,
      accept,
    });
    challengeExamId = result.challengeExamId;
  } catch (error) {
    if (error instanceof ChallengeError) fail(backPath, error.message);
    throw error;
  }

  revalidatePath("/student/challenges");
  revalidatePath("/student/exams");
  redirect(accept && challengeExamId ? "/student/exams?challenge=1" : backPath);
}

export async function cancelChallengeAction(formData: FormData): Promise<void> {
  const { user, student } = await requireStudent();

  const challengeId = field(formData, "challengeId");
  const backPath = "/student/challenges";

  try {
    await cancelChallenge({
      challengeId,
      inviterStudentId: student.id,
      actorUserId: user.id,
    });
  } catch (error) {
    if (error instanceof ChallengeError) fail(backPath, error.message);
    throw error;
  }

  revalidatePath("/student/challenges");
  redirect(backPath);
}
