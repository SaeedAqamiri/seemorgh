"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";

export async function markAllReadAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await markAllNotificationsRead(user.id);
  revalidatePath("/counselor/notifications");
  revalidatePath("/student/notifications");
  redirect(user.role === "counselor" ? "/counselor/notifications" : "/student/notifications");
}

export async function markReadAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (id) await markNotificationRead(user.id, id);
  revalidatePath("/counselor/notifications");
  revalidatePath("/student/notifications");
  redirect(user.role === "counselor" ? "/counselor/notifications" : "/student/notifications");
}
