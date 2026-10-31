import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions, students, users, workspaces } from "@/db/schema";

export const SESSION_COOKIE = "seemorgh_session";
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  workspaceId: string;
  role: "counselor" | "student";
  name: string;
  phone: string;
  workspaceName: string;
};

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const rows = await db
    .select({
      user: users,
      workspaceName: workspaces.name,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.user.id,
    workspaceId: row.user.workspaceId,
    role: row.user.role,
    name: row.user.name,
    phone: row.user.phone,
    workspaceName: row.workspaceName,
  };
});

export async function requireCounselor(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "counselor") redirect("/student");
  return user;
}

export async function requireStudent(): Promise<{
  user: SessionUser;
  student: typeof students.$inferSelect;
}> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/counselor");

  const db = await getDb();
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.userId, user.id))
    .limit(1);

  if (!student) redirect("/login?error=حساب دانش‌آموزی پیدا نشد.");
  return { user, student };
}
