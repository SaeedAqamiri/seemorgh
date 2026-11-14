"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCounselor } from "@/lib/auth";
import {
  addPoolBook,
  deletePoolBook,
  ResourcePoolError,
} from "@/lib/resource-pool";

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
      unitType: unitType as "test" | "page" | "chapter",
      priority,
      chaptersText,
      totalUnits,
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
