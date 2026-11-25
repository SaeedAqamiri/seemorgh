"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCounselor } from "@/lib/auth";
import {
  addPoolBook,
  deletePoolBook,
  ResourcePoolError,
} from "@/lib/resource-pool";
import {
  ResourceCoverError,
  saveCoverUpload,
  updatePoolCover,
} from "@/lib/resource-covers";

async function uploadedCover(formData: FormData) {
  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return null;
  try {
    return await saveCoverUpload(file);
  } catch (error) {
    if (error instanceof ResourceCoverError) {
      redirect(`/counselor/resources?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function numberField(form: FormData, name: string): number {
  return Number(field(form, name));
}

export async function addPoolResourceAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const subjectId = field(formData, "subjectId");
  const title = field(formData, "title");
  const publisher = field(formData, "publisher");
  const grade = field(formData, "grade");
  const unitType = field(formData, "unitType") || "test";
  const priority = Math.max(1, Math.min(5, numberField(formData, "priority") || 3));
  const chaptersText = field(formData, "chapters");
  const totalUnits = Math.max(0, numberField(formData, "totalUnits"));
  const cover = await uploadedCover(formData);

  if (!subjectId || !title) {
    redirect(`/counselor/resources?error=${encodeURIComponent("درس و عنوان منبع لازم است.")}`);
  }

  try {
    await addPoolBook({
      workspaceId: counselor.workspaceId,
      actorId: counselor.id,
      subjectId,
      title,
      publisher,
      grade,
      unitType: unitType as "test" | "exercise" | "page" | "chapter",
      priority,
      chaptersText,
      totalUnits,
      coverUrl: cover?.coverUrl ?? null,
      coverSource: cover?.coverSource ?? null,
    });
  } catch (error) {
    if (error instanceof ResourcePoolError) {
      redirect(`/counselor/resources?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath("/counselor/resources");
  revalidatePath("/student/resources");
  revalidatePath("/counselor");
  redirect("/counselor/resources?success=added");
}

export async function deletePoolResourceAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const poolId = field(formData, "poolId");
  await deletePoolBook(counselor.workspaceId, poolId);
  revalidatePath("/counselor/resources");
  redirect("/counselor/resources?success=deleted");
}

export async function updatePoolCoverAction(formData: FormData): Promise<void> {
  const counselor = await requireCounselor();
  const poolId = field(formData, "poolId");
  if (!poolId) {
    redirect(`/counselor/resources?error=${encodeURIComponent("منبع انتخاب نشده است.")}`);
  }
  const cover = await uploadedCover(formData);
  if (!cover) {
    redirect(`/counselor/resources?error=${encodeURIComponent("فایل تصویر انتخاب نشده است.")}`);
  }
  await updatePoolCover({
    workspaceId: counselor.workspaceId,
    poolId,
    coverUrl: cover.coverUrl,
    coverSource: cover.coverSource,
  });
  revalidatePath("/counselor/resources");
  revalidatePath("/student/resources");
  redirect("/counselor/resources?success=cover");
}
