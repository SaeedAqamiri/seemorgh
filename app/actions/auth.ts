"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { students, subjects, users, workspaces } from "@/db/schema";
import { createSession, destroySession } from "@/lib/auth";
import {
  hashPassword,
  isValidIranianMobile,
  normalizePhone,
  verifyPassword,
} from "@/lib/password";
import { DEFAULT_SUBJECTS } from "@/lib/subjects";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function randomInviteCode(): string {
  return randomBytes(6).toString("base64url");
}

export async function signupAction(formData: FormData): Promise<void> {
  const name = field(formData, "name");
  const workspaceName = field(formData, "workspaceName") || `دفتر ${name}`;
  const phone = normalizePhone(field(formData, "phone"));
  const password = field(formData, "password");

  if (name.length < 2) fail("/signup", "نام را کامل وارد کنید.");
  if (!isValidIranianMobile(phone)) fail("/signup", "شماره موبایل معتبر نیست.");
  if (password.length < 8) fail("/signup", "رمز عبور باید حداقل ۸ کاراکتر باشد.");

  const db = await getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  if (existing) fail("/signup", "این شماره قبلاً ثبت‌نام کرده است.");

  let userId = "";
  try {
    await db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(workspaces)
        .values({ name: workspaceName })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({
          workspaceId: workspace.id,
          role: "counselor",
          name,
          phone,
          passwordHash: hashPassword(password),
        })
        .returning();

      userId = user.id;
      await tx.update(workspaces).set({ ownerId: user.id }).where(eq(workspaces.id, workspace.id));

      await tx.insert(subjects).values(
        DEFAULT_SUBJECTS.map((title) => ({
          workspaceId: workspace.id,
          title,
        })),
      );
    });
  } catch {
    fail("/signup", "ثبت‌نام انجام نشد؛ دوباره تلاش کنید.");
  }

  await createSession(userId);
  redirect("/counselor");
}

export async function loginAction(formData: FormData): Promise<void> {
  const phone = normalizePhone(field(formData, "phone"));
  const password = field(formData, "password");

  if (!isValidIranianMobile(phone)) fail("/login", "شماره موبایل معتبر نیست.");
  if (!password) fail("/login", "رمز عبور را وارد کنید.");

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    fail("/login", "شماره موبایل یا رمز عبور اشتباه است.");
  }

  await createSession(user.id);
  redirect(user.role === "counselor" ? "/counselor" : "/student");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const code = field(formData, "code");
  const path = `/invite/${encodeURIComponent(code)}`;
  const name = field(formData, "name");
  const password = field(formData, "password");

  if (!code) fail("/login", "لینک دعوت نامعتبر است.");
  if (name.length < 2) fail(path, "نام را کامل وارد کنید.");
  if (password.length < 8) fail(path, "رمز عبور باید حداقل ۸ کاراکتر باشد.");

  const db = await getDb();
  const [student] = await db.select().from(students).where(eq(students.inviteCode, code)).limit(1);
  if (!student) fail("/login", "دعوت پیدا نشد.");
  if (student.userId) fail("/login", "این دعوت قبلاً استفاده شده است.");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, student.phone))
    .limit(1);
  if (existing) fail(path, "این شماره قبلاً حساب دارد؛ از صفحه ورود استفاده کنید.");

  let userId = "";
  try {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          workspaceId: student.workspaceId,
          role: "student",
          name,
          phone: student.phone,
          passwordHash: hashPassword(password),
        })
        .returning();

      userId = user.id;
      await tx
        .update(students)
        .set({ userId: user.id, name })
        .where(and(eq(students.id, student.id), eq(students.workspaceId, student.workspaceId)));
    });
  } catch {
    fail(path, "فعال‌سازی حساب انجام نشد؛ دوباره تلاش کنید.");
  }

  await createSession(userId);
  redirect("/student");
}
