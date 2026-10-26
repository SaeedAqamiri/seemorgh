"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { contentItems, resources, subjects } from "@/db/schema";
import { requireCounselor } from "@/lib/auth";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function addContentAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const title = field(formData, "title");
  const kind = field(formData, "kind") || "video";
  const url = field(formData, "url") || null;
  const body = field(formData, "body");
  const subjectId = field(formData, "subjectId") || null;
  const resourceId = field(formData, "resourceId") || null;

  if (title.length < 2) fail("/counselor/content", "عنوان محتوا را کامل وارد کنید.");
  if (!["video", "text", "psychology"].includes(kind)) {
    fail("/counselor/content", "نوع محتوا نامعتبر است.");
  }
  if (url && !validUrl(url)) fail("/counselor/content", "لینک محتوا معتبر نیست.");
  if (!url && !body) fail("/counselor/content", "لینک یا متن محتوا لازم است.");
  if (kind === "video" && !url) fail("/counselor/content", "برای فیلم، لینک آپارات یا یوتیوب لازم است.");

  const db = await getDb();

  if (subjectId) {
    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.workspaceId, counselor.workspaceId)))
      .limit(1);
    if (!subject) fail("/counselor/content", "درس پیدا نشد.");
  }

  if (resourceId) {
    const [resource] = await db
      .select({ id: resources.id })
      .from(resources)
      .where(and(eq(resources.id, resourceId), eq(resources.workspaceId, counselor.workspaceId)))
      .limit(1);
    if (!resource) fail("/counselor/content", "منبع پیدا نشد.");
  }

  await db.insert(contentItems).values({
    workspaceId: counselor.workspaceId,
    title,
    kind: kind as "video" | "text" | "psychology",
    url,
    body,
    subjectId,
    resourceId,
    createdBy: counselor.id,
  });

  revalidatePath("/counselor/content");
  revalidatePath("/student/content");
  redirect("/counselor/content?success=created");
}

export async function deleteContentAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const contentId = field(formData, "contentId");

  const db = await getDb();
  await db
    .update(contentItems)
    .set({ status: "archived" })
    .where(
      and(eq(contentItems.id, contentId), eq(contentItems.workspaceId, counselor.workspaceId)),
    );

  revalidatePath("/counselor/content");
  revalidatePath("/student/content");
  redirect("/counselor/content?success=deleted");
}
