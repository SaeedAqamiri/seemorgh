import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";

export async function logAudit(input: {
  workspaceId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  await db.insert(auditLogs).values({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    diffJson: input.diff ?? null,
  });
}

export async function listAuditLogs(
  workspaceId: string,
  options: { entity?: string; entityId?: string; limit?: number } = {},
) {
  const db = await getDb();
  const conditions = [eq(auditLogs.workspaceId, workspaceId)];
  if (options.entity) conditions.push(eq(auditLogs.entity, options.entity));
  if (options.entityId) conditions.push(eq(auditLogs.entityId, options.entityId));

  return db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(options.limit ?? 50);
}

export const AUDIT_LABELS: Record<string, string> = {
  "plan.generate": "تولید/بازتولید پیش‌نویس برنامه",
  "plan.approve": "تأیید برنامه",
  "plan.reopen": "بازگشت برنامه به پیش‌نویس",
  "plan.task.update": "ویرایش تسک",
  "plan.task.add": "افزودن تسک دستی",
  "plan.task.delete": "حذف تسک",
  "exam.publish": "انتشار آزمون",
  "exam.delete": "حذف پیش‌نویس آزمون",
  "exam.grade": "تصحیح پاسخ",
  "student.archive": "بایگانی دانش‌آموز",
  "report.narrative": "تولید روایت تحلیلی گزارش",
};
