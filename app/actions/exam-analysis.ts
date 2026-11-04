"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { externalExams, students, subjects } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { isISODate, todayISO } from "@/lib/dates";
import { computeExamOverallPercent, type ExamSubjectResult } from "@/lib/exam-analysis";
import type { ExamSubjectScore } from "@/db/schema";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function numberField(form: FormData, name: string): number | null {
  const raw = field(form, name);
  if (raw === "") return null;
  const value = Number(raw.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))));
  return Number.isFinite(value) ? value : null;
}

type ExamContext = {
  role: "counselor" | "student";
  studentId: string;
  workspaceId: string;
  actorId: string;
  basePath: string;
};

async function resolveExamContext(formData: FormData): Promise<ExamContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = await getDb();

  if (user.role === "student") {
    const [own] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, user.id), eq(students.workspaceId, user.workspaceId)))
      .limit(1);
    if (!own) redirect("/login?error=حساب دانش‌آموزی پیدا نشد.");
    return {
      role: "student",
      studentId: own.id,
      workspaceId: user.workspaceId,
      actorId: user.id,
      basePath: "/student/exam-analysis",
    };
  }

  const studentId = field(formData, "studentId");
  const [owned] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.workspaceId, user.workspaceId), eq(students.id, studentId)))
    .limit(1);
  if (!owned) redirect("/counselor");
  return {
    role: "counselor",
    studentId: owned.id,
    workspaceId: user.workspaceId,
    actorId: user.id,
    basePath: `/counselor/students/${owned.id}/exam-analysis`,
  };
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function withExamParam(path: string, examId: string, success: string): string {
  const params = new URLSearchParams({ exam: `external:${examId}`, success });
  return `${path}?${params.toString()}`;
}

export async function saveExternalExamAction(formData: FormData): Promise<void> {
  const context = await resolveExamContext(formData);
  const db = await getDb();
  const examId = field(formData, "examId");
  const title = field(formData, "title");
  const examDate = field(formData, "examDate");
  const examType = field(formData, "examType") || "external";
  const provider = field(formData, "provider");
  const note = field(formData, "note");

  if (!title) fail(context.basePath, "نام آزمون لازم است.");
  if (!isISODate(examDate)) fail(context.basePath, "تاریخ آزمون معتبر نیست.");

  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, context.workspaceId));

  const subjectScores: ExamSubjectResult[] = [];
  const subjectsJson: ExamSubjectScore[] = [];

  for (const subject of subjectRows) {
    const percent = numberField(formData, `percent_${subject.id}`);
    if (percent === null) continue;
    const correct = numberField(formData, `correct_${subject.id}`) ?? 0;
    const wrong = numberField(formData, `wrong_${subject.id}`) ?? 0;
    const blank = numberField(formData, `blank_${subject.id}`) ?? 0;
    const total = numberField(formData, `total_${subject.id}`) ?? 0;
    const boundedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    subjectScores.push({
      subjectId: subject.id,
      subjectTitle: subject.title,
      percent: boundedPercent,
      correct: Math.max(0, Math.round(correct)),
      wrong: Math.max(0, Math.round(wrong)),
      blank: Math.max(0, Math.round(blank)),
      total: Math.max(0, Math.round(total)),
    });
    subjectsJson.push({
      subjectId: subject.id,
      subjectTitle: subject.title,
      percent: boundedPercent,
      correct: Math.max(0, Math.round(correct)),
      wrong: Math.max(0, Math.round(wrong)),
      blank: Math.max(0, Math.round(blank)),
      total: Math.max(0, Math.round(total)),
    });
  }

  if (subjectScores.length === 0) {
    fail(context.basePath, "حداقل درصد یک درس را وارد کنید.");
  }

  const overallPercent = computeExamOverallPercent(subjectScores);
  let savedId = examId;

  if (examId) {
    const [updated] = await db
      .update(externalExams)
      .set({
        title,
        examDate,
        examType,
        provider,
        subjectsJson,
        overallPercent,
        note,
      })
      .where(
        and(
          eq(externalExams.id, examId),
          eq(externalExams.studentId, context.studentId),
          eq(externalExams.workspaceId, context.workspaceId),
        ),
      )
      .returning({ id: externalExams.id });
    if (!updated) fail(context.basePath, "آزمون پیدا نشد.");
    savedId = updated.id;
  } else {
    const [created] = await db
      .insert(externalExams)
      .values({
        workspaceId: context.workspaceId,
        studentId: context.studentId,
        title,
        examDate,
        examType,
        provider,
        subjectsJson,
        overallPercent,
        note,
        createdBy: context.actorId,
      })
      .onConflictDoUpdate({
        target: [externalExams.studentId, externalExams.title, externalExams.examDate],
        set: {
          examType,
          provider,
          subjectsJson,
          overallPercent,
          note,
          createdBy: context.actorId,
        },
      })
      .returning({ id: externalExams.id });
    savedId = created.id;
  }

  revalidatePath(context.basePath);
  revalidatePath("/student/exam-analysis");
  revalidatePath(`/counselor/students/${context.studentId}/exam-analysis`);
  redirect(withExamParam(context.basePath, savedId, "saved"));
}

export async function deleteExternalExamAction(formData: FormData): Promise<void> {
  const context = await resolveExamContext(formData);
  const examId = field(formData, "examId");
  const db = await getDb();
  await db
    .delete(externalExams)
    .where(
      and(
        eq(externalExams.id, examId),
        eq(externalExams.studentId, context.studentId),
        eq(externalExams.workspaceId, context.workspaceId),
      ),
    );
  revalidatePath(context.basePath);
  redirect(`${context.basePath}?success=deleted`);
}

type OcrPayload = {
  title?: unknown;
  examDate?: unknown;
  provider?: unknown;
  examType?: unknown;
  subjects?: unknown;
};

function normalizeSubjectName(value: string): string {
  return value.replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim();
}

export async function ocrExternalExamAction(formData: FormData): Promise<void> {
  const context = await resolveExamContext(formData);
  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) {
    fail(context.basePath, "یک تصویر از کارنامه انتخاب کنید.");
  }
  if (file.size > 8 * 1024 * 1024) {
    fail(context.basePath, "حجم تصویر باید کمتر از ۸ مگابایت باشد.");
  }

  const baseUrl = process.env.AI_BASE_URL?.replace(/\/+$/, "");
  const model = process.env.AI_MODEL;
  if (!baseUrl || !model) {
    fail(context.basePath, "OCR خودکار در دسترس نیست؛ اطلاعات را دستی وارد کنید.");
  }

  const mime = file.type || "image/jpeg";
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  let payload: OcrPayload;
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "این تصویر یک کارنامه آزمون است. فقط JSON برگردان با کلیدهای title، examDate (YYYY-MM-DD)، provider، examType و subjects. subjects آرایه‌ای از {subject, percent, correct, wrong, blank, total} است. اگر مقداری پیدا نشد null بگذار. هیچ متن اضافه‌ای برنگردان.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "اطلاعات کارنامه را استخراج کن. نام درس‌ها را دقیق نگه دار.",
              },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(35_000),
    });

    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    payload = JSON.parse(content) as OcrPayload;
  } catch {
    fail(
      context.basePath,
      "OCR خودکار در دسترس نیست یا مدل از تصویر پشتیبانی نمی‌کند؛ اطلاعات را دستی وارد کنید.",
    );
  }

  const db = await getDb();
  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, context.workspaceId));

  const rawSubjects = Array.isArray(payload.subjects) ? payload.subjects : [];
  const subjectsJson: ExamSubjectScore[] = [];
  const subjectScores: ExamSubjectResult[] = [];

  for (const raw of rawSubjects) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const subjectName = typeof entry.subject === "string" ? entry.subject : "";
    if (!subjectName) continue;
    const normalized = normalizeSubjectName(subjectName);
    const matched =
      subjectRows.find((subject) => normalizeSubjectName(subject.title) === normalized) ??
      subjectRows.find(
        (subject) =>
          normalizeSubjectName(subject.title).includes(normalized) ||
          normalized.includes(normalizeSubjectName(subject.title)),
      ) ??
      null;
    const percent = Number(entry.percent);
    if (!Number.isFinite(percent)) continue;
    const bounded = Math.max(0, Math.min(100, Math.round(percent)));
    const subjectTitle = matched?.title ?? subjectName;
    const score = {
      subjectId: matched?.id ?? null,
      subjectTitle,
      percent: bounded,
      correct: Number.isFinite(Number(entry.correct)) ? Math.max(0, Math.round(Number(entry.correct))) : 0,
      wrong: Number.isFinite(Number(entry.wrong)) ? Math.max(0, Math.round(Number(entry.wrong))) : 0,
      blank: Number.isFinite(Number(entry.blank)) ? Math.max(0, Math.round(Number(entry.blank))) : 0,
      total: Number.isFinite(Number(entry.total)) ? Math.max(0, Math.round(Number(entry.total))) : 0,
    };
    subjectsJson.push(score);
    subjectScores.push(score);
  }

  if (subjectsJson.length === 0) {
    fail(context.basePath, "از تصویر درسی شناسایی نشد؛ لطفاً اطلاعات را دستی وارد کنید.");
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "آزمون واردشده با OCR";
  const examDate =
    typeof payload.examDate === "string" && isISODate(payload.examDate)
      ? payload.examDate
      : todayISO();
  const provider = typeof payload.provider === "string" ? payload.provider.trim() : "";
  const overallPercent = computeExamOverallPercent(subjectScores);

  const [created] = await db
    .insert(externalExams)
    .values({
      workspaceId: context.workspaceId,
      studentId: context.studentId,
      title,
      examDate,
      examType: "external",
      provider,
      subjectsJson,
      overallPercent,
      note: "ثبت‌شده با OCR — قابل ویرایش",
      createdBy: context.actorId,
    })
    .onConflictDoUpdate({
      target: [externalExams.studentId, externalExams.title, externalExams.examDate],
      set: { provider, subjectsJson, overallPercent, note: "ثبت‌شده با OCR — قابل ویرایش" },
    })
    .returning({ id: externalExams.id });

  revalidatePath(context.basePath);
  redirect(withExamParam(context.basePath, created.id, "ocr"));
}
