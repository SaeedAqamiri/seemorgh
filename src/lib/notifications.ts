import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notifications, students } from "@/db/schema";

export type NotificationItem = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function notifyUser(
  userId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  await db.insert(notifications).values({ userId, type, payloadJson: payload });
}

export async function notifyStudentUser(
  studentId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  const [student] = await db
    .select({ userId: students.userId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);
  if (!student?.userId) return;
  await notifyUser(student.userId, type, payload);
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationItem[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payloadJson ?? null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  }));
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.id, id)));
}
