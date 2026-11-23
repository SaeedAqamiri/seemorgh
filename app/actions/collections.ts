"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { questionCollectionItems, questionCollections } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { filterSelectableQuestionIds } from "@/lib/collections";
import { sanitizeQuestionIds } from "@/lib/exam";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function collectionsPath(role: "counselor" | "student", collectionId?: string): string {
  const base = role === "counselor" ? "/counselor/collections" : "/student/collections";
  return collectionId ? `${base}/${collectionId}` : base;
}

function safeInternalPath(path: string, fallback: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}

function fail(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function revalidateCollections(role: "counselor" | "student", collectionId?: string) {
  revalidatePath(collectionsPath(role));
  revalidatePath(collectionsPath(role === "counselor" ? "student" : "counselor"));
  if (collectionId) {
    revalidatePath(collectionsPath(role, collectionId));
    revalidatePath(
      collectionsPath(role === "counselor" ? "student" : "counselor", collectionId),
    );
  }
}

function done(role: "counselor" | "student", path: string, code: string, collectionId?: string): never {
  revalidateCollections(role, collectionId);
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}success=${code}`);
}

async function requireOwnedCollection(
  collectionId: string,
  userId: string,
  workspaceId: string,
  role: "counselor" | "student",
) {
  if (!collectionId) fail(collectionsPath(role), "مجموعه را انتخاب کنید.");
  const db = await getDb();
  const [collection] = await db
    .select()
    .from(questionCollections)
    .where(
      and(
        eq(questionCollections.id, collectionId),
        eq(questionCollections.workspaceId, workspaceId),
        eq(questionCollections.userId, userId),
      ),
    )
    .limit(1);
  if (!collection) fail(collectionsPath(role), "مجموعه سوال پیدا نشد.");
  return collection;
}

export async function createCollectionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const title = field(formData, "title");
  const description = field(formData, "description");
  const base = collectionsPath(user.role);

  if (title.length < 2) fail(base, "نام مجموعه را کامل وارد کنید.");

  const db = await getDb();
  const [collection] = await db
    .insert(questionCollections)
    .values({
      workspaceId: user.workspaceId,
      userId: user.id,
      title,
      description,
    })
    .returning();

  done(user.role, base, "created", collection.id);
}

export async function updateCollectionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const collectionId = field(formData, "collectionId");
  const collection = await requireOwnedCollection(collectionId, user.id, user.workspaceId, user.role);
  const path = collectionsPath(user.role, collection.id);
  const title = field(formData, "title");

  if (title.length < 2) fail(path, "نام مجموعه را کامل وارد کنید.");

  const db = await getDb();
  await db
    .update(questionCollections)
    .set({ title, description: field(formData, "description") })
    .where(eq(questionCollections.id, collection.id));

  done(user.role, path, "updated", collection.id);
}

export async function deleteCollectionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const collectionId = field(formData, "collectionId");
  const collection = await requireOwnedCollection(collectionId, user.id, user.workspaceId, user.role);

  const db = await getDb();
  await db.delete(questionCollections).where(eq(questionCollections.id, collection.id));

  done(user.role, collectionsPath(user.role), "deleted");
}

export async function addQuestionsToCollectionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const base = collectionsPath(user.role);
  const redirectTo = safeInternalPath(field(formData, "redirectTo") || base, base);
  const questionIds = sanitizeQuestionIds(formData.getAll("questionIds"));
  const newTitle = field(formData, "newCollectionTitle");
  const collectionIdInput = field(formData, "collectionId");

  if (questionIds.length === 0) fail(redirectTo, "حداقل یک سوال انتخاب کنید.");
  if (questionIds.length > 300) fail(redirectTo, "حداکثر ۳۰۰ سوال در هر بار افزودن مجاز است.");

  const db = await getDb();

  let collectionId = collectionIdInput;
  if (newTitle) {
    if (newTitle.length < 2) fail(redirectTo, "نام مجموعه جدید را کامل وارد کنید.");
    const [created] = await db
      .insert(questionCollections)
      .values({ workspaceId: user.workspaceId, userId: user.id, title: newTitle })
      .returning();
    collectionId = created.id;
  } else {
    await requireOwnedCollection(collectionId, user.id, user.workspaceId, user.role);
  }

  const validIds = await filterSelectableQuestionIds(
    user.workspaceId,
    user.id,
    questionIds,
  );
  if (validIds.length === 0) {
    fail(redirectTo, "سوال‌های انتخاب‌شده قابل افزودن نیستند (بایگانی یا ناموجود).");
  }

  await db
    .insert(questionCollectionItems)
    .values(validIds.map((questionId) => ({ collectionId, questionId })))
    .onConflictDoNothing();

  done(user.role, collectionsPath(user.role, collectionId), "questions-added", collectionId);
}

export async function removeQuestionFromCollectionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const collectionId = field(formData, "collectionId");
  const questionId = field(formData, "questionId");
  const collection = await requireOwnedCollection(collectionId, user.id, user.workspaceId, user.role);

  const db = await getDb();
  await db
    .delete(questionCollectionItems)
    .where(
      and(
        eq(questionCollectionItems.collectionId, collection.id),
        eq(questionCollectionItems.questionId, questionId),
      ),
    );

  done(user.role, collectionsPath(user.role, collection.id), "question-removed", collection.id);
}
