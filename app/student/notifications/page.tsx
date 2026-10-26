import { NotificationsList } from "@/components/notifications-list";
import { requireStudent } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";

export default async function StudentNotificationsPage() {
  const { user } = await requireStudent();
  const items = await listNotifications(user.id);
  return <NotificationsList items={items} role="student" />;
}
