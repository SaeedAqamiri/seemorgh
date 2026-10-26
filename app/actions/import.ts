"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  availability,
  questionBanks,
  questions,
  resources,
  studentConstraints,
  students,
  subjects,
} from "@/db/schema";
import { requireCounselor } from "@/lib/auth";
import { errorRows, parseWorkbook, totalRows } from "@/lib/excel";
import { deleteImportFile, readImportFile, saveImportFile } from "@/lib/import-store";
import { normalizePhone } from "@/lib/password";

export async function uploadExcelAction(formData: FormData): Promise<void> {
  await requireCounselor();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/counselor?error=" + encodeURIComponent("فایل اکسل را انتخاب کنید."));
  }
  if (file.size > 5 * 1024 * 1024) {
    redirect("/counselor?error=" + encodeURIComponent("حجم فایل بیشتر از ۵ مگابایت است."));
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    redirect("/counselor?error=" + encodeURIComponent("فقط فایل .xlsx پشتیبانی می‌شود."));
  }

  const token = randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());
  await saveImportFile(token, buffer);

  redirect(`/counselor/import?token=${token}`);
}

export async function cancelImportAction(formData: FormData): Promise<void> {
  await requireCounselor();
  const token = String(formData.get("token") ?? "");
  await deleteImportFile(token);
  redirect("/counselor");
}

export async function applyImportAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const token = String(formData.get("token") ?? "");
  const buffer = await readImportFile(token);

  if (!buffer) {
    redirect("/counselor?error=" + encodeURIComponent("فایل ایمپورت پیدا نشد؛ دوباره آپلود کنید."));
  }

  const parsed = await parseWorkbook(buffer);
  const db = await getDb();

  const subjectRows = await db
    .select()
    .from(subjects)
    .where(eq(subjects.workspaceId, counselor.workspaceId));
  const subjectByTitle = new Map(subjectRows.map((subject) => [subject.title.trim(), subject.id]));

  const studentRows = await db
    .select()
    .from(students)
    .where(eq(students.workspaceId, counselor.workspaceId));
  const studentByPhone = new Map(studentRows.map((student) => [student.phone, student]));

  let applied = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    for (const row of parsed.students) {
      if (row.errors.length > 0) {
        skipped += 1;
        continue;
      }

      if (studentByPhone.has(row.data.phone)) {
        skipped += 1;
        continue;
      }

      const [created] = await tx
        .insert(students)
        .values({
          workspaceId: counselor.workspaceId,
          counselorId: counselor.id,
          name: row.data.name,
          phone: row.data.phone,
          grade: row.data.grade,
          field: row.data.field,
          track: row.data.track,
          guardianPhone: row.data.guardianPhone,
          inviteCode: randomUUID().replace(/-/g, "").slice(0, 12),
        })
        .onConflictDoNothing()
        .returning();

      if (created) {
        studentByPhone.set(created.phone, created);
        await tx.insert(studentConstraints).values({ studentId: created.id }).onConflictDoNothing();
        applied += 1;
      } else {
        skipped += 1;
      }
    }

    const resolveStudent = (phone: string) => studentByPhone.get(normalizePhone(phone));

    for (const row of parsed.resources) {
      if (row.errors.length > 0) {
        skipped += 1;
        continue;
      }
      const student = resolveStudent(row.data.studentPhone);
      const subjectId = subjectByTitle.get(row.data.subject.trim());
      if (!student || !subjectId) {
        skipped += 1;
        continue;
      }

      await tx.insert(resources).values({
        workspaceId: counselor.workspaceId,
        studentId: student.id,
        subjectId,
        title: row.data.title,
        unitType: row.data.unitType,
        totalUnits: row.data.totalUnits,
        completedUnits: row.data.completedUnits,
        priority: row.data.priority,
      });
      applied += 1;
    }

    for (const row of parsed.availability) {
      if (row.errors.length > 0) {
        skipped += 1;
        continue;
      }
      const student = resolveStudent(row.data.studentPhone);
      if (!student) {
        skipped += 1;
        continue;
      }

      await tx.insert(availability).values({
        studentId: student.id,
        weekday: row.data.weekday,
        startMin: row.data.startMin,
        endMin: row.data.endMin,
      });
      applied += 1;
    }

    for (const row of parsed.constraints) {
      if (row.errors.length > 0) {
        skipped += 1;
        continue;
      }
      const student = resolveStudent(row.data.studentPhone);
      if (!student) {
        skipped += 1;
        continue;
      }

      await tx
        .insert(studentConstraints)
        .values({
          studentId: student.id,
          maxDailyMinutes: row.data.maxDailyMinutes,
          restWeekday: row.data.restWeekday,
          bufferPct: row.data.bufferPct,
        })
        .onConflictDoUpdate({
          target: studentConstraints.studentId,
          set: {
            maxDailyMinutes: row.data.maxDailyMinutes,
            restWeekday: row.data.restWeekday,
            bufferPct: row.data.bufferPct,
          },
        });
      applied += 1;
    }

    for (const row of parsed.questions) {
      if (row.errors.length > 0) {
        skipped += 1;
        continue;
      }

      const [existingBank] = await tx
        .select()
        .from(questionBanks)
        .where(
          and(
            eq(questionBanks.workspaceId, counselor.workspaceId),
            eq(questionBanks.title, row.data.bank),
          ),
        )
        .limit(1);

      const bank =
        existingBank ??
        (
          await tx
            .insert(questionBanks)
            .values({
              workspaceId: counselor.workspaceId,
              title: row.data.bank,
              subjectId: row.data.subject ? subjectByTitle.get(row.data.subject) ?? null : null,
              createdBy: counselor.id,
            })
            .returning()
        )[0];

      const subjectId = row.data.subject ? subjectByTitle.get(row.data.subject) ?? null : null;

      if (row.data.externalKey) {
        const [existingQuestion] = await tx
          .select({ id: questions.id })
          .from(questions)
          .where(
            and(eq(questions.bankId, bank.id), eq(questions.externalKey, row.data.externalKey)),
          )
          .limit(1);

        if (existingQuestion) {
          await tx
            .update(questions)
            .set({
              subjectId,
              topic: row.data.topic,
              type: row.data.type,
              difficulty: row.data.difficulty,
              body: row.data.body,
              optionsJson: row.data.options,
              correctJson: row.data.correct,
              score: row.data.score,
              explanation: row.data.explanation,
            })
            .where(eq(questions.id, existingQuestion.id));
          applied += 1;
          continue;
        }
      }

      await tx.insert(questions).values({
        bankId: bank.id,
        workspaceId: counselor.workspaceId,
        subjectId,
        topic: row.data.topic,
        type: row.data.type,
        difficulty: row.data.difficulty,
        body: row.data.body,
        optionsJson: row.data.options,
        correctJson: row.data.correct,
        score: row.data.score,
        explanation: row.data.explanation,
        externalKey: row.data.externalKey,
      });
      applied += 1;
    }
  });

  await deleteImportFile(token);

  revalidatePath("/counselor");
  revalidatePath("/counselor/questions");

  const summary = { applied, skipped, invalid: errorRows(parsed), total: totalRows(parsed) };
  redirect(
    `/counselor?success=imported&applied=${summary.applied}&skipped=${summary.skipped}&total=${summary.total}`,
  );
}
